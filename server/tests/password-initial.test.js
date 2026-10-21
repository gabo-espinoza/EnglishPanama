// Pruebas del cambio obligatorio de contrasena en el primer inicio de sesion de un docente
// recien creado por el gestor de accesos.
//
// Se omiten solas si no hay MySQL, JWT_SECRET o STAFF_MFA_KEY.
const test = require('node:test');
const assert = require('node:assert');
// Este archivo hace muchas llamadas de autenticacion que fallan a proposito: sube el limite
// (el limiter lo lee al cargar su modulo, asi que debe fijarse antes de requerir la app).
process.env.AUTH_RATE_LIMIT_MAX ??= '200';
const bcrypt = require('bcrypt');
const mfaCrypto = require('../src/utils/mfaCrypto');
const totp = require('../src/utils/totp');

require('dotenv').config();

// Las pruebas sin base de datos necesitan firmar tokens: si no hay JWT_SECRET se usa uno de
// prueba, pero `ready` (pruebas con MySQL) solo cuenta el JWT_SECRET real del entorno.
const hadJwtSecret = Boolean(process.env.JWT_SECRET);
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-secret-password-initial';
const jwt = require('jsonwebtoken');
const express = require('express');
const { requireAuth, requireAuthOrEnroll, requirePasswordToken } = require('../src/middleware/auth');

const app = require('../src/app');
const pool = require('../src/config/db');
const staffAccounts = require('../src/services/staffAccounts.service');
const audit = require('../src/services/audit.service');
const { closeAuditPool } = require('../src/config/auditDb');

let server;
let ready = false;
let mini;

const suffix = String(Date.now()).slice(-7);
const userIds = [];

test.before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));

    const miniApp = express();
    miniApp.get('/auth', requireAuth, (req, res) => res.json({ ok: true }));
    miniApp.get('/auth-or-enroll', requireAuthOrEnroll, (req, res) => res.json({ ok: true }));
    miniApp.get('/pwd', requirePasswordToken, (req, res) => res.json({ ok: true }));
    mini = miniApp.listen(0, '127.0.0.1');
    await new Promise((r) => mini.once('listening', r));

    if (!hadJwtSecret || !process.env.STAFF_MFA_KEY) return;
    try { await pool.query('SELECT 1'); } catch { return; }
    ready = true;
});

test.after(async () => {
    if (ready && userIds.length) {
        await pool.query('DELETE FROM students WHERE user_id IN (?)', [userIds]);
        await pool.query('DELETE FROM teachers WHERE user_id IN (?)', [userIds]);
        await pool.query('DELETE FROM users WHERE id IN (?)', [userIds]);
    }
    server.close();
    if (mini) mini.close();
    try { await pool.end(); } catch { /* sin conexiones */ }
    try { await closeAuditPool(); } catch { /* sin conexiones */ }
});

test('createTeacher deja must_change_password en 1', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const created = await staffAccounts.createTeacher({
        username: `prof.ini.${suffix}`, displayName: 'Docente Nuevo', actorId: 1
    });
    userIds.push(created.id);
    const [rows] = await pool.query('SELECT must_change_password FROM users WHERE id = ?', [created.id]);
    assert.strictEqual(Number(rows[0].must_change_password), 1);

    // Un usuario insertado sin la columna queda en 0 (compatibilidad con cuentas existentes).
    const hash = await bcrypt.hash('ClaveCualquiera-1', 4);
    const [plain] = await pool.query(
        "INSERT INTO users (role, username, password_hash) VALUES ('student', ?, ?)",
        [`estu.ini.${suffix}`, hash]
    );
    userIds.push(plain.insertId);
    const [plainRows] = await pool.query('SELECT must_change_password FROM users WHERE id = ?', [plain.insertId]);
    assert.strictEqual(Number(plainRows[0].must_change_password), 0);
});

const signTyp = (typ, extra = {}) =>
    jwt.sign({ id: 1, typ, tv: 0, ...extra }, process.env.JWT_SECRET, { expiresIn: '5m' });
const miniGet = (path, token) =>
    fetch(`http://127.0.0.1:${mini.address().port}${path}`, { headers: { Authorization: `Bearer ${token}` } });

test('un pwd_change no abre rutas con requireAuth', async () => {
    const res = await miniGet('/auth', signTyp('pwd_change'));
    assert.strictEqual(res.status, 401);
    assert.strictEqual((await res.json()).error, 'Token invalido o expirado.');
});

test('un pwd_change no abre rutas con requireAuthOrEnroll', async () => {
    const res = await miniGet('/auth-or-enroll', signTyp('pwd_change'));
    assert.strictEqual(res.status, 401);
});

test('un pwd_change vencido no abre la ruta del cambio inicial', async () => {
    const expired = jwt.sign({ id: 1, typ: 'pwd_change', tv: 0 }, process.env.JWT_SECRET, { expiresIn: -10 });
    const res = await miniGet('/pwd', expired);
    assert.strictEqual(res.status, 401);
});

test('un mfa_enroll no abre la ruta del cambio inicial', async () => {
    const res = await miniGet('/pwd', signTyp('mfa_enroll'));
    assert.strictEqual(res.status, 401);
});

test('un mfa_pending no abre la ruta del cambio inicial', async () => {
    const res = await miniGet('/pwd', signTyp('mfa_pending'));
    assert.strictEqual(res.status, 401);
});

test('un token sin typ no abre la ruta del cambio inicial', async () => {
    const token = jwt.sign({ id: 1, tv: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const res = await miniGet('/pwd', token);
    assert.strictEqual(res.status, 401);
});

test('un token typ user no abre la ruta del cambio inicial', async () => {
    const res = await miniGet('/pwd', signTyp('user'));
    assert.strictEqual(res.status, 401);
});

// Con la app real: el rechazo por typ ocurre antes de tocar la base, asi que no necesita MySQL.
const apiPost = (path, token, body = {}) =>
    fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
    });

test('el passwordToken no abre /auth/mfa/setup ni /auth/change-password (app real)', async () => {
    for (const path of ['/api/auth/mfa/setup', '/api/auth/mfa/confirm', '/api/auth/change-password']) {
        const res = await apiPost(path, signTyp('pwd_change'));
        assert.strictEqual(res.status, 401, path);
    }
});

test('set-initial-password rechaza tokens que no son pwd_change (app real)', async () => {
    for (const token of [
        signTyp('user'), signTyp('mfa_enroll'), signTyp('mfa_pending'),
        jwt.sign({ id: 1, tv: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' })
    ]) {
        const res = await apiPost('/api/auth/set-initial-password', token,
            { newPassword: 'NuevaClave-1', confirmPassword: 'NuevaClave-1' });
        assert.strictEqual(res.status, 401);
    }
    const noAuth = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/set-initial-password`, { method: 'POST' });
    assert.strictEqual(noAuth.status, 401);
});

async function sessionFor(username) {
    const created = await staffAccounts.createTeacher({ username, displayName: 'Docente Flag', actorId: 1 });
    userIds.push(created.id);
    const [rows] = await pool.query('SELECT token_version FROM users WHERE id = ?', [created.id]);
    const token = jwt.sign(
        { id: created.id, tv: Number(rows[0].token_version) },
        process.env.JWT_SECRET, { expiresIn: '5m' }
    );
    return { id: created.id, token };
}
const apiGet = (path, token) =>
    fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers: { Authorization: `Bearer ${token}` } });

test('una sesion valida con must_change_password=1 recibe 403 con code', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const { token } = await sessionFor(`prof.flag1.${suffix}`);
    for (const path of ['/api/users/me', '/api/teacher/students', '/api/teacher/class']) {
        const res = await apiGet(path, token);
        assert.strictEqual(res.status, 403, path);
        const body = await res.json();
        assert.strictEqual(body.code, 'PASSWORD_CHANGE_REQUIRED');
        assert.strictEqual(body.error, 'Debes crear tu contrasena antes de continuar.');
    }
});

test('con la bandera en 0 la misma sesion pasa', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const { id, token } = await sessionFor(`prof.flag0.${suffix}`);
    await pool.query('UPDATE users SET must_change_password = 0 WHERE id = ?', [id]);
    const res = await apiGet('/api/users/me', token);
    assert.notStrictEqual(res.status, 403);
    assert.notStrictEqual(res.status, 401);
});

// --- Cambio inicial de contrasena (con MySQL) ---

const TEMP = 'Temporal-12345';
const NEW_PW = 'NuevaClave-67890';
const pwdTokenFor = (id, tv = 0) =>
    jwt.sign({ id, typ: 'pwd_change', tv }, process.env.JWT_SECRET, { expiresIn: '15m' });
const setInitial = (token, body) => apiPost('/api/auth/set-initial-password', token, body);
const loginApi = (username, password) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

// Crea un usuario con la contrasena TEMP, la bandera indicada y, opcionalmente, MFA vinculado.
async function makeUser(tag, { role = 'teacher', flag = 1, mfa = false } = {}) {
    const username = `ini.${tag}.${suffix}`;
    const hash = await bcrypt.hash(TEMP, 4);
    const secretEnc = mfa ? mfaCrypto.encrypt(totp.generateSecret()) : null;
    const [r] = await pool.query(
        'INSERT INTO users (role, username, password_hash, must_change_password, mfa_secret_enc) VALUES (?, ?, ?, ?, ?)',
        [role, username, hash, flag, secretEnc]
    );
    userIds.push(r.insertId);
    return { id: r.insertId, username };
}

test('login con la bandera en 1 devuelve passwordChangeRequired y no da sesion', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const u = await makeUser('login1');
    const res = await loginApi(u.username, TEMP);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.passwordChangeRequired, true);
    assert.ok(body.passwordToken);
    assert.strictEqual(body.expiresIn, 900);
    for (const k of ['token', 'mfaToken', 'enrollToken']) assert.strictEqual(body[k], undefined, k);
    assert.strictEqual(jwt.verify(body.passwordToken, process.env.JWT_SECRET).typ, 'pwd_change');
});

test('login con la bandera en 1 y MFA ya vinculado tampoco da reto de MFA', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const u = await makeUser('loginmfa', { mfa: true });
    const body = await (await loginApi(u.username, TEMP)).json();
    assert.strictEqual(body.passwordChangeRequired, true);
    for (const k of ['token', 'mfaToken', 'mfaRequired', 'enrollToken']) assert.strictEqual(body[k], undefined, k);
});

test('login con la bandera en 0 no cambia (estudiante recibe sesion)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const u = await makeUser('stud', { role: 'student', flag: 0 });
    const body = await (await loginApi(u.username, TEMP)).json();
    assert.ok(body.token);
    assert.strictEqual(body.passwordChangeRequired, undefined);
});

test('set-initial-password sin MFA devuelve enrollToken y deja la bandera en 0; la temporal deja de servir', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const u = await makeUser('nomfa');
    const res = await setInitial(pwdTokenFor(u.id), { newPassword: NEW_PW, confirmPassword: NEW_PW });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.mfaSetupRequired, true);
    assert.ok(body.enrollToken);
    assert.strictEqual(body.token, undefined);
    const [rows] = await pool.query('SELECT must_change_password, token_version FROM users WHERE id = ?', [u.id]);
    assert.strictEqual(Number(rows[0].must_change_password), 0);
    // El enrollToken lleva la token_version nueva.
    assert.strictEqual(jwt.verify(body.enrollToken, process.env.JWT_SECRET).tv, Number(rows[0].token_version));

    assert.strictEqual((await loginApi(u.username, TEMP)).status, 401);
    const next = await (await loginApi(u.username, NEW_PW)).json();
    assert.strictEqual(next.mfaSetupRequired, true);
});

test('set-initial-password con MFA ya vinculado devuelve mfaToken', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const u = await makeUser('withmfa', { mfa: true });
    const res = await setInitial(pwdTokenFor(u.id), { newPassword: NEW_PW, confirmPassword: NEW_PW });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.mfaRequired, true);
    assert.ok(body.mfaToken);
    assert.strictEqual(body.token, undefined);
});

test('usar dos veces el mismo passwordToken falla con 401', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const u = await makeUser('twice');
    const token = pwdTokenFor(u.id);
    assert.strictEqual((await setInitial(token, { newPassword: NEW_PW, confirmPassword: NEW_PW })).status, 200);
    assert.strictEqual((await setInitial(token, { newPassword: 'Otra-Clave-1', confirmPassword: 'Otra-Clave-1' })).status, 401);
});

test('un passwordToken con la bandera en 0 devuelve 409 PASSWORD_ALREADY_SET', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const u = await makeUser('already', { flag: 0 });
    const res = await setInitial(pwdTokenFor(u.id), { newPassword: NEW_PW, confirmPassword: NEW_PW });
    assert.strictEqual(res.status, 409);
    assert.strictEqual((await res.json()).code, 'PASSWORD_ALREADY_SET');
    // La contrasena no cambio.
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [u.id]);
    assert.ok(await bcrypt.compare(TEMP, rows[0].password_hash));
});

test('set-initial-password rechaza entradas invalidas sin cambiar nada', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const u = await makeUser('invalid');
    const token = pwdTokenFor(u.id);
    const cases = [
        { name: 'igual a la temporal', body: { newPassword: TEMP, confirmPassword: TEMP }, msg: 'La contrasena nueva debe ser distinta de la temporal.' },
        { name: 'distintas', body: { newPassword: NEW_PW, confirmPassword: 'Otra-Clave-1' }, msg: 'Las contrasenas no coinciden.' },
        { name: 'vacia', body: { newPassword: '', confirmPassword: '' } },
        { name: 'sin cuerpo', body: {} },
        { name: 'numeros en vez de texto', body: { newPassword: 12345, confirmPassword: 12345 } },
        { name: 'arreglos en vez de texto', body: { newPassword: ['a', 'b'], confirmPassword: ['a', 'b'] } },
        { name: 'de mas de 72', body: { newPassword: 'x'.repeat(73), confirmPassword: 'x'.repeat(73) } }
    ];
    for (const c of cases) {
        const res = await setInitial(token, c.body);
        assert.strictEqual(res.status, 400, c.name);
        if (c.msg) assert.strictEqual((await res.json()).error, c.msg, c.name);
    }
    const [rows] = await pool.query('SELECT must_change_password FROM users WHERE id = ?', [u.id]);
    assert.strictEqual(Number(rows[0].must_change_password), 1);
});

test('el passwordToken no abre /auth/mfa/setup ni /auth/change-password con usuario real', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const u = await makeUser('notopen');
    for (const path of ['/api/auth/mfa/setup', '/api/auth/change-password']) {
        assert.strictEqual((await apiPost(path, pwdTokenFor(u.id))).status, 401, path);
    }
});

test('dos peticiones simultaneas: solo una tiene exito', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const u = await makeUser('race');
    const token = pwdTokenFor(u.id);
    const results = await Promise.all([
        setInitial(token, { newPassword: NEW_PW, confirmPassword: NEW_PW }),
        setInitial(token, { newPassword: 'Otra-Clave-1', confirmPassword: 'Otra-Clave-1' })
    ]);
    const statuses = results.map((r) => r.status).sort();
    assert.strictEqual(statuses.filter((s) => s === 200).length, 1, statuses.join(','));
    assert.ok(statuses.every((s) => s === 200 || s === 401 || s === 409), statuses.join(','));
});

test('queda registrado en la auditoria', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const u = await makeUser('audit');
    assert.strictEqual((await setInitial(pwdTokenFor(u.id), { newPassword: NEW_PW, confirmPassword: NEW_PW })).status, 200);
    const { rows } = await audit.list({ action: 'user.password.initial_set', limit: 20 });
    assert.ok(rows.some((r) => r.actor_id === u.id && r.outcome === 'ok'),
        'debe existir una fila user.password.initial_set de este usuario');
});
