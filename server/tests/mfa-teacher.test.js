// Pruebas del MFA obligatorio para docentes: un docente sin autenticador no recibe
// sesion, recibe un token de vinculacion que solo abre /mfa/setup y /mfa/confirm, y el
// primer codigo correcto completa tambien el inicio de sesion. Incluye el reinicio
// manual que hace el gestor de accesos cuando un docente pierde el celular.
//
// Se omiten solas si no hay MySQL, JWT_SECRET, STAFF_JWT_SECRET o STAFF_MFA_KEY.
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

require('dotenv').config();

const app = require('../src/app');
const pool = require('../src/config/db');
const totp = require('../src/utils/totp');
const mfaCrypto = require('../src/utils/mfaCrypto');
const audit = require('../src/services/audit.service');
const { closeAuditPool } = require('../src/config/auditDb');

let server;
let baseUrl;
let ready = false;

const PASSWORD = 'DocentePrueba12345';
const suffix = String(Date.now()).slice(-7);
const userIds = [];
const staffIds = [];
let newTeacher;      // sin MFA: se vincula durante la suite
let resetTeacher;    // con MFA activo: se le reinicia el MFA
let student;         // estudiante sin MFA (el MFA sigue siendo opcional para ellos)
let accessManager;   // access_manager de prueba
let auditorStaff;    // auditor de prueba (no puede reiniciar el MFA)

async function createTeacher(prefix, { mfa }) {
    const hash = await bcrypt.hash(PASSWORD, 10);
    const username = `prof.${prefix}.${suffix}`;
    const secret = mfa ? totp.generateSecret() : null;
    const [res] = await pool.query(
        "INSERT INTO users (role, username, password_hash, mfa_secret_enc) VALUES ('teacher', ?, ?, ?)",
        [username, hash, secret ? mfaCrypto.encrypt(secret) : null]
    );
    await pool.query(
        'INSERT INTO teachers (user_id, display_name, class_code) VALUES (?, ?, ?)',
        [res.insertId, 'Docente Prueba', 'M' + prefix.toUpperCase().slice(0, 2) + suffix.slice(-3)]
    );
    userIds.push(res.insertId);
    return { id: res.insertId, username, secret };
}

async function createStaff(prefix, role) {
    const secret = totp.generateSecret();
    const username = `test.${prefix}.${suffix}`;
    const [res] = await pool.query(
        'INSERT INTO staff_accounts (username, password_hash, role, mfa_secret_enc) VALUES (?, ?, ?, ?)',
        [username, await bcrypt.hash(PASSWORD, 10), role, mfaCrypto.encrypt(secret)]
    );
    staffIds.push(res.insertId);
    return { id: res.insertId, username, secret };
}

test.before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    if (!process.env.JWT_SECRET || !process.env.STAFF_JWT_SECRET || !process.env.STAFF_MFA_KEY) return;
    try { await pool.query('SELECT 1'); } catch { return; }

    newTeacher = await createTeacher('nuevo', { mfa: false });
    resetTeacher = await createTeacher('reset', { mfa: true });

    const hash = await bcrypt.hash(PASSWORD, 10);
    const [sres] = await pool.query(
        "INSERT INTO users (role, username, password_hash) VALUES ('student', ?, ?)",
        [`estu.mfa.${suffix}`, hash]
    );
    await pool.query('INSERT INTO students (user_id, teacher_id) VALUES (?, ?)', [sres.insertId, newTeacher.id]);
    userIds.push(sres.insertId);
    student = { id: sres.insertId, username: `estu.mfa.${suffix}` };

    accessManager = await createStaff('acc', 'access_manager');
    auditorStaff = await createStaff('aud', 'auditor');
    ready = true;
});

test.after(async () => {
    if (ready) {
        await pool.query('DELETE FROM students WHERE user_id IN (?)', [userIds]);
        await pool.query('DELETE FROM teachers WHERE user_id IN (?)', [userIds]);
        await pool.query('DELETE FROM users WHERE id IN (?)', [userIds]);
        await pool.query('DELETE FROM staff_accounts WHERE id IN (?)', [staffIds]);
    }
    server.close();
    try { await pool.end(); } catch { /* sin conexiones */ }
    try { await closeAuditPool(); } catch { /* sin conexiones */ }
});

function call(method, url, { token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(baseUrl + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

const login = (user) => call('POST', '/auth/login', { body: { username: user.username, password: PASSWORD } });
const secretFromUri = (uri) => (/[?&]secret=([A-Z2-7]+)/.exec(uri) || [])[1];

async function staffToken(account) {
    const res = await call('POST', '/staff/auth/login', {
        body: { username: account.username, password: PASSWORD, totp: totp.generateToken(account.secret) }
    });
    assert.strictEqual(res.status, 200, 'el login del personal debe funcionar');
    return (await res.json()).token;
}

let enrollToken;

test('un docente sin MFA no recibe sesion: recibe un token de vinculacion', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const res = await login(newTeacher);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.mfaSetupRequired, true);
    assert.ok(body.enrollToken, 'debe entregar el token de vinculacion');
    assert.ok(!body.token, 'NO debe entregar la sesion normal');
    assert.ok(!body.role, 'no debe entregar rol ni sesion');
    assert.strictEqual(jwt.decode(body.enrollToken).typ, 'mfa_enroll');
    enrollToken = body.enrollToken;
});

test('el token de vinculacion NO abre rutas protegidas (401)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    for (const url of ['/users/me', '/teacher/students', '/teacher/difficult-topics', '/teacher/class']) {
        const res = await call('GET', url, { token: enrollToken });
        assert.strictEqual(res.status, 401, `${url} no debe aceptar el token de vinculacion`);
    }
});

test('el reto de MFA (mfa_pending) tampoco sirve para vincular (401)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const challenge = (await (await login(resetTeacher)).json()).mfaToken;
    assert.ok(challenge, 'un docente con MFA recibe el reto del segundo paso');
    const res = await call('POST', '/auth/mfa/setup', { token: challenge, body: {} });
    assert.strictEqual(res.status, 401);
});

test('la vinculacion con el token de vinculacion entrega la sesion al primer codigo correcto', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }

    const setup = await call('POST', '/auth/mfa/setup', { token: enrollToken, body: {} });
    assert.strictEqual(setup.status, 200);
    const { otpauthUri } = await setup.json();
    assert.match(otpauthUri, /^otpauth:\/\/totp\//);
    const secret = secretFromUri(otpauthUri);
    assert.ok(secret);

    const wrong = await call('POST', '/auth/mfa/confirm', { token: enrollToken, body: { totp: '000000' } });
    assert.strictEqual(wrong.status, 401, 'un codigo incorrecto no activa el MFA ni da sesion');
    assert.ok(!(await wrong.json()).token);

    const ok = await call('POST', '/auth/mfa/confirm', { token: enrollToken, body: { totp: totp.generateToken(secret) } });
    assert.strictEqual(ok.status, 200);
    const body = await ok.json();
    assert.strictEqual(body.mfaEnabled, true);
    assert.strictEqual(body.role, 'teacher');
    assert.ok(body.token, 'el primer codigo correcto completa el inicio de sesion');
    assert.ok(!jwt.decode(body.token).typ || jwt.decode(body.token).typ === 'user');

    const me = await call('GET', '/users/me', { token: body.token });
    assert.strictEqual(me.status, 200, 'la sesion entregada debe abrir las rutas protegidas');
    newTeacher.secret = secret;
});

test('el token de vinculacion ya no sirve una vez vinculado el autenticador (409)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const setup = await call('POST', '/auth/mfa/setup', { token: enrollToken, body: {} });
    assert.strictEqual(setup.status, 409, 'no puede reemplazar un autenticador ya activo');
    const confirm = await call('POST', '/auth/mfa/confirm', { token: enrollToken, body: { totp: '123456' } });
    assert.strictEqual(confirm.status, 409);
});

test('despues de vincular, el siguiente login pide el codigo (flujo normal de MFA)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const first = await (await login(newTeacher)).json();
    assert.strictEqual(first.mfaRequired, true);
    assert.ok(first.mfaToken && !first.token && !first.mfaSetupRequired);

    const second = await call('POST', '/auth/login/mfa', {
        body: { mfaToken: first.mfaToken, totp: totp.generateToken(newTeacher.secret) }
    });
    assert.strictEqual(second.status, 200);
    assert.ok((await second.json()).token);
});

test('el MFA sigue siendo opcional para estudiantes: entran directo', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const body = await (await login(student)).json();
    assert.ok(body.token, 'el estudiante sin MFA recibe la sesion');
    assert.ok(!body.mfaSetupRequired && !body.mfaRequired);
    assert.strictEqual(body.role, 'student');
});

test('el registro de docentes esta deshabilitado: no crea la cuenta (403)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const username = `prof.reg.${suffix}`;
    const res = await call('POST', '/auth/register/teacher', {
        body: { username, password: PASSWORD, displayName: 'Docente Registro' }
    });
    assert.strictEqual(res.status, 403);
    const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    assert.strictEqual(rows.length, 0, 'no debe haberse creado ninguna cuenta');
});

test('reinicio manual: solo el gestor de accesos puede reiniciar el MFA de un docente', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }

    // El docente tiene una sesion abierta con su MFA actual.
    const first = await (await login(resetTeacher)).json();
    const full = await (await call('POST', '/auth/login/mfa', {
        body: { mfaToken: first.mfaToken, totp: totp.generateToken(resetTeacher.secret) }
    })).json();
    assert.ok(full.token);
    assert.strictEqual((await call('GET', '/users/me', { token: full.token })).status, 200);

    // Un auditor no puede reiniciar el MFA de nadie.
    const auditorRes = await call('POST', `/staff/teachers/${resetTeacher.id}/reset-mfa`, { token: await staffToken(auditorStaff) });
    assert.strictEqual(auditorRes.status, 403);

    // Sin token de personal, tampoco.
    assert.strictEqual((await call('POST', `/staff/teachers/${resetTeacher.id}/reset-mfa`)).status, 401);

    const token = await staffToken(accessManager);
    assert.strictEqual((await call('POST', '/staff/teachers/abc/reset-mfa', { token })).status, 400);
    assert.strictEqual((await call('POST', '/staff/teachers/999999999/reset-mfa', { token })).status, 404);
    assert.strictEqual((await call('POST', `/staff/teachers/${student.id}/reset-mfa`, { token })).status, 404,
        'solo aplica a docentes, no a estudiantes');

    const ok = await call('POST', `/staff/teachers/${resetTeacher.id}/reset-mfa`, { token });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual((await ok.json()).mfaReset, true);

    // La sesion que tenia el docente queda revocada.
    assert.strictEqual((await call('GET', '/users/me', { token: full.token })).status, 401);

    // En su siguiente inicio de sesion debe vincular un autenticador nuevo.
    const again = await (await login(resetTeacher)).json();
    assert.strictEqual(again.mfaSetupRequired, true);
    assert.ok(!again.token && !again.mfaRequired);

    const [rows] = await pool.query('SELECT mfa_secret_enc, mfa_pending_enc FROM users WHERE id = ?', [resetTeacher.id]);
    assert.strictEqual(rows[0].mfa_secret_enc, null);
    assert.strictEqual(rows[0].mfa_pending_enc, null);

    const { rows: auditRows } = await audit.list({ action: 'staff.teacher.reset_mfa', limit: 5 });
    assert.ok(auditRows.some((r) => r.target.startsWith(`teacher#${resetTeacher.id}:`)),
        'el reinicio debe quedar en la auditoria');
});
