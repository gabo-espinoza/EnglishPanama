// Pruebas del cambio obligatorio de contrasena en el primer inicio de sesion de un docente
// recien creado por el gestor de accesos.
//
// Se omiten solas si no hay MySQL, JWT_SECRET o STAFF_MFA_KEY.
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');

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
    mini = miniApp.listen(0);
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

test('un mfa_enroll no abre la ruta del cambio inicial', async () => {
    const res = await miniGet('/pwd', signTyp('mfa_enroll'));
    assert.strictEqual(res.status, 401);
});

test('un mfa_pending no abre la ruta del cambio inicial', async () => {
    const res = await miniGet('/pwd', signTyp('mfa_pending'));
    assert.strictEqual(res.status, 401);
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
    for (const path of ['/api/users/me', '/api/auth/change-password']) {
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
