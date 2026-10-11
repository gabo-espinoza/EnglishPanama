// Pruebas de las cuentas de gestion (Fase A): login con TOTP, permisos por area y
// rol, separacion de funciones y auditoria. Se omiten solas si no hay MySQL o si
// falta STAFF_MFA_KEY (por ejemplo en una maquina sin .env).
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

require('dotenv').config();

const app = require('../src/app');
const pool = require('../src/config/db');
const totp = require('../src/utils/totp');
const mfaCrypto = require('../src/utils/mfaCrypto');
const { closeAuditPool } = require('../src/config/auditDb');

let server;
let baseUrl;
let ready = false;

const PASSWORD = 'PruebaGestion12345';
const suffix = String(Date.now()).slice(-7);
const created = [];
let access = null;   // access_manager
let auditor = null;  // auditor
let victim = null;   // support (se suspende)

test.before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    if (!process.env.STAFF_MFA_KEY || !process.env.STAFF_JWT_SECRET) return;
    try {
        await pool.query('SELECT 1');
    } catch {
        return;
    }

    async function createAccount(prefix, role) {
        const secret = totp.generateSecret();
        const username = `test.${prefix}.${suffix}`;
        const [res] = await pool.query(
            `INSERT INTO staff_accounts (username, password_hash, role, mfa_secret_enc)
             VALUES (?, ?, ?, ?)`,
            [username, await bcrypt.hash(PASSWORD, 10), role, mfaCrypto.encrypt(secret)]
        );
        const account = { id: res.insertId, username, role, secret };
        created.push(account);
        return account;
    }

    access = await createAccount('acc', 'access_manager');
    auditor = await createAccount('aud', 'auditor');
    victim = await createAccount('sup', 'support');
    ready = true;
});

test.after(async () => {
    if (ready) {
        const ids = created.map((a) => a.id);
        await pool.query('DELETE FROM staff_change_requests WHERE target_id IN (?) OR requested_by IN (?) OR decided_by IN (?)', [ids, ids, ids]);
        await pool.query('DELETE FROM staff_accounts WHERE id IN (?)', [ids]);
    }
    server.close();
    await closeAuditPool();
    try { await pool.end(); } catch { /* sin conexiones */ }
});

function code(account) {
    return totp.generateToken(account.secret);
}

async function login(account, totpCode) {
    const res = await fetch(`${baseUrl}/staff/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: account.username, password: PASSWORD, totp: totpCode })
    });
    return res;
}

async function call(method, url, { token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(baseUrl + url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
}

test('login de gestion: TOTP incorrecto -> 401', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves de gestion'); return; }
    const res = await login(access, '000000');
    assert.strictEqual(res.status, 401);
});

test('login de gestion correcto devuelve token con rol y area', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves de gestion'); return; }
    const res = await login(access, code(access));
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    access.token = body.token;
    assert.strictEqual(body.role, 'access_manager');
    assert.strictEqual(body.area, 'access');
});

test('el auditor inicia sesion', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves de gestion'); return; }
    const res = await login(auditor, code(auditor));
    assert.strictEqual(res.status, 200);
    auditor.token = (await res.json()).token;
});

test('un access_manager no puede leer la auditoria (403)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves de gestion'); return; }
    const res = await call('GET', '/staff/audit', { token: access.token });
    assert.strictEqual(res.status, 403);
});

test('el auditor verifica la cadena de auditoria', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves de gestion'); return; }
    const res = await call('GET', '/staff/audit/verify', { token: auditor.token });
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).ok, true);
});

test('un token de estudiante no sirve en la API de gestion (401)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves de gestion'); return; }
    const studentToken = jwt.sign({ id: 1, role: 'student', tv: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const res = await call('GET', '/staff/me', { token: studentToken });
    assert.strictEqual(res.status, 401);
});

test('separacion de funciones: solicitar, no decidir, y suspender', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves de gestion'); return; }

    const self = await call('POST', '/staff/change-requests', {
        token: access.token, body: { targetId: access.id, action: 'suspend' }
    });
    assert.strictEqual(self.status, 400);

    const created2 = await call('POST', '/staff/change-requests', {
        token: access.token, body: { targetId: victim.id, action: 'suspend' }
    });
    assert.strictEqual(created2.status, 201);
    const requestId = (await created2.json()).id;

    const asAccess = await call('POST', `/staff/change-requests/${requestId}/decision`, {
        token: access.token, body: { decision: 'approved' }
    });
    assert.strictEqual(asAccess.status, 403);

    const decided = await call('POST', `/staff/change-requests/${requestId}/decision`, {
        token: auditor.token, body: { decision: 'approved' }
    });
    assert.strictEqual(decided.status, 200);

    const suspended = await login(victim, code(victim));
    assert.strictEqual(suspended.status, 401);
});
