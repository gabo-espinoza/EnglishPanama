// Pruebas del segundo factor (MFA/TOTP) para las cuentas de plataforma
// (estudiantes/docentes): vinculacion del autenticador y login en dos pasos.
//
// Demuestran lo que pide la consigna: con la contrasena sola NO se obtiene el JWT
// cuando la cuenta tiene MFA, el reto intermedio no sirve en rutas protegidas, y
// solo un codigo TOTP correcto completa el inicio de sesion.
//
// Se omiten solas si no hay MySQL, JWT_SECRET o STAFF_MFA_KEY (maquina sin .env).
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

require('dotenv').config();

const app = require('../src/app');
const pool = require('../src/config/db');
const totp = require('../src/utils/totp');
const mfaCrypto = require('../src/utils/mfaCrypto');

let server;
let baseUrl;
let ready = false;

const PASSWORD = 'EstudiantePrueba12345';
const suffix = String(Date.now()).slice(-7);
const created = [];
let student;  // estudiante01 de prueba (vincula MFA durante la suite)
let lockUser; // segunda cuenta, con MFA ya activo, para la prueba de bloqueo

async function createStudent(prefix, username) {
    const hash = await bcrypt.hash(PASSWORD, 10);
    const [tres] = await pool.query(
        "INSERT INTO users (role, username, password_hash) VALUES ('teacher', ?, ?)",
        [`prof.${prefix}.${suffix}`, hash]
    );
    const classCode = 'T' + prefix.toUpperCase().slice(0, 4) + suffix.slice(-3);
    await pool.query(
        'INSERT INTO teachers (user_id, display_name, class_code) VALUES (?, ?, ?)',
        [tres.insertId, 'Docente Prueba', classCode]
    );
    const [sres] = await pool.query(
        "INSERT INTO users (role, username, password_hash) VALUES ('student', ?, ?)",
        [username, hash]
    );
    await pool.query('INSERT INTO students (user_id, teacher_id) VALUES (?, ?)', [sres.insertId, tres.insertId]);
    created.push(tres.insertId, sres.insertId);
    return { id: sres.insertId, teacherId: tres.insertId, username };
}

test.before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    if (!process.env.JWT_SECRET || !process.env.STAFF_MFA_KEY) return;
    try { await pool.query('SELECT 1'); } catch { return; }

    student = await createStudent('a', `estudiante01.${suffix}`);
    lockUser = await createStudent('b', `bloqueo.mfa.${suffix}`);

    // A lockUser se le activa el MFA directamente en la base para no gastar el
    // limite de peticiones de autenticacion creando la vinculacion por HTTP.
    await pool.query(
        'UPDATE users SET mfa_secret_enc = ? WHERE id = ?',
        [mfaCrypto.encrypt(totp.generateSecret()), lockUser.id]
    );

    ready = true;
});

test.after(async () => {
    if (ready) {
        const ids = created;
        await pool.query('DELETE FROM students WHERE user_id IN (?)', [ids]);
        await pool.query('DELETE FROM teachers WHERE user_id IN (?)', [ids]);
        await pool.query('DELETE FROM users WHERE id IN (?)', [ids]);
    }
    server.close();
    try { await pool.end(); } catch { /* sin conexiones */ }
});

function call(method, url, { token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(baseUrl + url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
}

function login(user, password = PASSWORD) {
    return call('POST', '/auth/login', { body: { username: user.username, password } });
}

function loginMfa(mfaToken, code) {
    return call('POST', '/auth/login/mfa', { body: { mfaToken, totp: code } });
}

function secretFromUri(uri) {
    const match = /[?&]secret=([A-Z2-7]+)/.exec(uri);
    return match ? match[1] : null;
}

test('sin segundo factor, el login entrega la sesion normal', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const res = await login(student);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.token, 'debe entregar el JWT cuando no hay MFA');
    assert.ok(!body.mfaRequired, 'no debe pedir MFA si la cuenta no lo tiene');
});

test('la vinculacion exige sesion: setup sin token -> 401', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const res = await call('POST', '/auth/mfa/setup', { body: {} });
    assert.strictEqual(res.status, 401);
});

test('vinculacion: setup devuelve el URI otpauth y confirmar activa el MFA', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }

    const session = await (await login(student)).json();
    assert.ok(session.token);

    const setup = await call('POST', '/auth/mfa/setup', { token: session.token, body: {} });
    assert.strictEqual(setup.status, 200);
    const { otpauthUri } = await setup.json();
    assert.match(otpauthUri, /^otpauth:\/\/totp\//, 'debe devolver un URI otpauth');

    const secret = secretFromUri(otpauthUri);
    assert.ok(secret, 'el URI debe incluir el secreto');
    student.secret = secret;

    // Antes de confirmar, el secreto solo esta en la columna pendiente.
    const [pending] = await pool.query('SELECT mfa_secret_enc, mfa_pending_enc FROM users WHERE id = ?', [student.id]);
    assert.strictEqual(pending[0].mfa_secret_enc, null, 'el MFA no debe estar activo antes de confirmar');
    assert.ok(pending[0].mfa_pending_enc, 'el secreto pendiente debe quedar guardado');

    const confirm = await call('POST', '/auth/mfa/confirm', {
        token: session.token,
        body: { totp: totp.generateToken(secret) }
    });
    assert.strictEqual(confirm.status, 200);
    assert.strictEqual((await confirm.json()).mfaEnabled, true);

    // Ya activo: el secreto queda cifrado y la columna pendiente vacia.
    const [active] = await pool.query('SELECT mfa_secret_enc, mfa_pending_enc FROM users WHERE id = ?', [student.id]);
    assert.ok(Buffer.isBuffer(active[0].mfa_secret_enc), 'el secreto activo debe estar cifrado (binario)');
    assert.strictEqual(active[0].mfa_pending_enc, null, 'no debe quedar secreto pendiente');
    assert.strictEqual(mfaCrypto.decrypt(active[0].mfa_secret_enc), secret, 'el secreto guardado debe descifrarse');
    assert.notStrictEqual(String(active[0].mfa_secret_enc), secret, 'el secreto no debe guardarse en claro');

    // El perfil no expone el secreto.
    const me = await (await call('GET', '/users/me', { token: session.token })).json();
    assert.strictEqual(me.mfa_secret_enc, undefined);
    assert.strictEqual(me.mfa_pending_enc, undefined);
});

test('con MFA activo, la contrasena sola NO entrega el JWT (devuelve un reto)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const res = await login(student);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.mfaRequired, true, 'debe exigir el segundo factor');
    assert.ok(body.mfaToken, 'debe devolver un reto temporal');
    assert.strictEqual(body.token, undefined, 'no debe entregar el JWT de acceso todavia');
});

test('el reto temporal no abre rutas protegidas (401)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const { mfaToken } = await (await login(student)).json();
    const res = await call('GET', '/users/me', { token: mfaToken });
    assert.strictEqual(res.status, 401);
});

test('un codigo TOTP correcto completa el login y el JWT abre el perfil', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const { mfaToken } = await (await login(student)).json();

    const res = await loginMfa(mfaToken, totp.generateToken(student.secret));
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.token, 'el codigo correcto debe entregar el JWT');
    assert.strictEqual(body.role, 'student');

    const me = await call('GET', '/users/me', { token: body.token });
    assert.strictEqual(me.status, 200, 'ese JWT si debe abrir el perfil');
});

test('un codigo TOTP incorrecto no entrega el JWT (401)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const { mfaToken } = await (await login(student)).json();

    const good = totp.generateToken(student.secret);
    const bad = String((Number(good) + 1) % 1000000).padStart(6, '0');
    const res = await loginMfa(mfaToken, bad);
    assert.strictEqual(res.status, 401);
});

test('un reto expirado no sirve (401)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const expired = jwt.sign(
        { id: student.id, typ: 'mfa_pending', tv: 0 },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' }
    );
    const res = await loginMfa(expired, totp.generateToken(student.secret));
    assert.strictEqual(res.status, 401);
});

test('un JWT de sesion normal no sirve como reto en /login/mfa (401)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const session = await (await login(student)).json();
    const res = await loginMfa(session.mfaToken, '000000'); // reto valido pero codigo no
    assert.strictEqual(res.status, 401);

    // Y un token de plataforma normal (sin typ mfa_pending) tampoco es un reto valido.
    const normal = jwt.sign({ id: student.id, role: 'student', tv: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const res2 = await loginMfa(normal, totp.generateToken(student.secret));
    assert.strictEqual(res2.status, 401);
});

test('3 codigos incorrectos bloquean la verificacion 10 segundos', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }

    const { mfaToken } = await (await login(lockUser)).json();
    assert.ok(mfaToken);

    for (let i = 0; i < 3; i++) {
        const res = await loginMfa(mfaToken, '000001');
        assert.strictEqual(res.status, 401);
    }

    const [rows] = await pool.query(
        'SELECT locked_until, (locked_until > NOW()) AS is_locked FROM users WHERE id = ?',
        [lockUser.id]
    );
    assert.strictEqual(Number(rows[0].is_locked), 1, 'la cuenta debe quedar bloqueada');

    // La espera es de ~10 segundos, no de 5 ni 15 minutos.
    const [secs] = await pool.query(
        'SELECT TIMESTAMPDIFF(SECOND, NOW(), locked_until) AS s FROM users WHERE id = ?',
        [lockUser.id]
    );
    assert.ok(Number(secs[0].s) > 5 && Number(secs[0].s) <= 12,
        `el bloqueo debe ser de ~10 s (quedan ${secs[0].s})`);
});
