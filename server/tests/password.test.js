// Pruebas del cambio de contrasena propio (POST /auth/change-password): pensado para que un
// docente cambie la contrasena temporal con la que el gestor de accesos le creo la cuenta.
//
// Se omiten solas si no hay MySQL, JWT_SECRET o STAFF_MFA_KEY.
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

const OLD = 'ClaveTemporal-123';
const NEW = 'ClaveNueva-456789';
const suffix = String(Date.now()).slice(-7);
const userIds = [];
let teacher;   // docente con MFA activo, cuenta recien creada con "contrasena temporal"
let student;   // estudiante sin MFA

test.before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    if (!process.env.JWT_SECRET || !process.env.STAFF_MFA_KEY) return;
    try { await pool.query('SELECT 1'); } catch { return; }

    const hash = await bcrypt.hash(OLD, 10);
    const secret = totp.generateSecret();
    const [t] = await pool.query(
        "INSERT INTO users (role, username, password_hash, mfa_secret_enc) VALUES ('teacher', ?, ?, ?)",
        [`prof.pw.${suffix}`, hash, mfaCrypto.encrypt(secret)]
    );
    await pool.query('INSERT INTO teachers (user_id, display_name, class_code) VALUES (?, ?, ?)',
        [t.insertId, 'Docente Clave', 'P' + suffix.slice(-5)]);
    teacher = { id: t.insertId, username: `prof.pw.${suffix}`, secret };

    const [s] = await pool.query("INSERT INTO users (role, username, password_hash) VALUES ('student', ?, ?)",
        [`estu.pw.${suffix}`, hash]);
    await pool.query('INSERT INTO students (user_id, teacher_id) VALUES (?, ?)', [s.insertId, t.insertId]);
    student = { id: s.insertId, username: `estu.pw.${suffix}` };
    userIds.push(t.insertId, s.insertId);
    ready = true;
});

test.after(async () => {
    if (ready) {
        await pool.query('DELETE FROM students WHERE user_id IN (?)', [userIds]);
        await pool.query('DELETE FROM teachers WHERE user_id IN (?)', [userIds]);
        await pool.query('DELETE FROM users WHERE id IN (?)', [userIds]);
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

// El limite de intentos de autenticacion es de 20 por IP: las sesiones de los casos que no
// prueban el login se firman directamente (un JWT de plataforma valido) en vez de iniciar
// sesion por HTTP cada vez.
async function sessionFor(user, role) {
    const [rows] = await pool.query('SELECT token_version FROM users WHERE id = ?', [user.id]);
    return jwt.sign({ id: user.id, role, tv: Number(rows[0].token_version) }, process.env.JWT_SECRET, { expiresIn: '2h' });
}

async function passwordIs(user, plain) {
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [user.id]);
    return bcrypt.compare(plain, rows[0].password_hash);
}

// Inicio de sesion completo del docente por HTTP (contrasena + codigo TOTP).
async function teacherLogin(password) {
    const first = await (await call('POST', '/auth/login', { body: { username: teacher.username, password } })).json();
    if (!first.mfaToken) return { first };
    const second = await (await call('POST', '/auth/login/mfa', {
        body: { mfaToken: first.mfaToken, totp: totp.generateToken(teacher.secret) }
    })).json();
    return { first, token: second.token };
}

const change = (token, currentPassword, newPassword) =>
    call('POST', '/auth/change-password', { token, body: { currentPassword, newPassword } });

test('cambiar la contrasena exige sesion: sin token -> 401', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    assert.strictEqual((await change(undefined, OLD, NEW)).status, 401);
});

test('el reto de MFA y el token de vinculacion no sirven para cambiar la contrasena (401)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const challenge = (await (await call('POST', '/auth/login', { body: { username: teacher.username, password: OLD } })).json()).mfaToken;
    assert.ok(challenge);
    assert.strictEqual((await change(challenge, OLD, NEW)).status, 401);
    const enroll = jwt.sign({ id: teacher.id, typ: 'mfa_enroll', tv: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
    assert.strictEqual((await change(enroll, OLD, NEW)).status, 401);
});

test('validaciones: faltan datos, contrasena nueva corta o igual a la actual (400)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const token = await sessionFor(teacher, 'teacher');
    assert.strictEqual((await call('POST', '/auth/change-password', { token, body: {} })).status, 400);
    assert.strictEqual((await change(token, OLD, 'abc')).status, 400, 'contrasena nueva demasiado corta');
    assert.strictEqual((await change(token, OLD, OLD)).status, 400, 'debe ser distinta de la actual');
    assert.ok(await passwordIs(teacher, OLD), 'nada de lo anterior cambio la contrasena');
});

test('contrasena actual incorrecta: 401, no cambia nada y deja rastro en la auditoria', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const token = await sessionFor(teacher, 'teacher');
    const res = await change(token, 'esta-no-es', NEW);
    assert.strictEqual(res.status, 401);
    assert.match((await res.json()).error, /contrasena actual/);
    assert.ok(await passwordIs(teacher, OLD), 'la contrasena sigue siendo la anterior');
    assert.ok(!(await passwordIs(teacher, NEW)), 'la nueva no debe haber quedado activa');

    const { rows } = await audit.list({ action: 'user.password.change', limit: 20 });
    assert.ok(rows.some((r) => r.actor_id === teacher.id && r.outcome === 'denied'));
});

test('cambio correcto: entrega sesion nueva, revoca las anteriores y la nueva contrasena entra', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const oldSession = await sessionFor(teacher, 'teacher');
    const otherSession = await sessionFor(teacher, 'teacher'); // otra sesion abierta (por ejemplo, de quien conocia la temporal)
    assert.strictEqual((await call('GET', '/users/me', { token: otherSession })).status, 200);

    const res = await change(oldSession, OLD, NEW);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.token && body.role === 'teacher');

    assert.strictEqual((await call('GET', '/users/me', { token: body.token })).status, 200, 'la sesion nueva sirve');
    assert.strictEqual((await call('GET', '/users/me', { token: oldSession })).status, 401, 'la sesion usada queda revocada');
    assert.strictEqual((await call('GET', '/users/me', { token: otherSession })).status, 401, 'las demas sesiones tambien');

    assert.ok((await teacherLogin(NEW)).token, 'la contrasena nueva entra (con su MFA)');
    const old = await teacherLogin(OLD);
    assert.ok(!old.token && !old.first.mfaToken, 'la contrasena temporal ya no sirve');

    const { rows } = await audit.list({ action: 'user.password.change', limit: 20 });
    assert.ok(rows.some((r) => r.actor_id === teacher.id && r.outcome === 'ok'));
});

test('tres intentos con contrasena actual incorrecta bloquean la cuenta unos segundos', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const token = await sessionFor(student, 'student');
    for (let i = 0; i < 3; i += 1) {
        assert.strictEqual((await change(token, 'incorrecta-' + i, NEW)).status, 401);
    }
    // Bloqueada: incluso la contrasena correcta responde 401 hasta que pasen los 10 segundos.
    const blocked = await change(token, OLD, NEW);
    assert.strictEqual(blocked.status, 401);
    assert.match((await blocked.json()).error, /Demasiados intentos/);
});

test('un estudiante tambien puede cambiar su propia contrasena', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [student.id]);
    const res = await change(await sessionFor(student, 'student'), OLD, NEW);
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).role, 'student');
    const again = await (await call('POST', '/auth/login', { body: { username: student.username, password: NEW } })).json();
    assert.ok(again.token);
});
