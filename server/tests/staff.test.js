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
let analyst = null;  // analyst
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
    analyst = await createAccount('anl', 'analyst');
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

test('las metricas son solo del analista: access_manager 403, analyst 200', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves de gestion'); return; }

    const asAccess = await call('GET', '/staff/analytics/dashboard', { token: access.token });
    assert.strictEqual(asAccess.status, 403);

    const res = await login(analyst, code(analyst));
    assert.strictEqual(res.status, 200);
    analyst.token = (await res.json()).token;

    const asAnalyst = await call('GET', '/staff/analytics/dashboard', { token: analyst.token });
    assert.strictEqual(asAnalyst.status, 200);
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

// ---------------------------------------------------------------- politica de bloqueo
//
// Regla acordada para esta fase: 3 intentos fallidos y despues 10 segundos de
// espera. La cuenta de bloqueo es propia para no interferir con las demas pruebas.

test('bloqueo: 3 intentos fallidos y luego 10 segundos de espera', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves de gestion'); return; }

    const secret = totp.generateSecret();
    const username = `test.lock.${suffix}`;
    const [res] = await pool.query(
        `INSERT INTO staff_accounts (username, password_hash, role, mfa_secret_enc)
         VALUES (?, ?, ?, ?)`,
        [username, await bcrypt.hash(PASSWORD, 10), 'support', mfaCrypto.encrypt(secret)]
    );
    const locked = { id: res.insertId, username, role: 'support', secret };
    created.push(locked);

    // Dos fallos todavia no bloquean: la cuenta sigue pudiendo entrar.
    await login(locked, '000000');
    await login(locked, '000000');
    const [[stillActive]] = await pool.query('SELECT locked_until FROM staff_accounts WHERE id = ?', [locked.id]);
    assert.ok(!stillActive.locked_until, 'con 1 o 2 fallos no debe haber bloqueo');

    // Tercer fallo: aqui se activa el bloqueo de 10 segundos.
    const third = await login(locked, '000000');
    assert.strictEqual(third.status, 401);
    const [[row]] = await pool.query('SELECT locked_until FROM staff_accounts WHERE id = ?', [locked.id]);
    assert.ok(row.locked_until, 'tras el 3er fallo la cuenta debe quedar bloqueada');

    // Con la cuenta bloqueada ni siquiera la contrasena y el codigo CORRECTOS valen:
    // demuestra que el control esta en el servidor y no depende del cliente.
    const duringLock = await login(locked, totp.generateToken(secret));
    assert.strictEqual(duringLock.status, 401, 'durante el bloqueo se rechaza incluso con credenciales validas');

    // Espera a que venza el bloqueo: con credenciales correctas vuelve a entrar y
    // el contador queda reiniciado.
    await new Promise((r) => setTimeout(r, 10500));
    const afterLock = await login(locked, totp.generateToken(secret));
    assert.strictEqual(afterLock.status, 200, 'vencido el bloqueo debe volver a entrar con credenciales correctas');

    const [[cleared]] = await pool.query('SELECT failed_attempts, locked_until FROM staff_accounts WHERE id = ?', [locked.id]);
    assert.strictEqual(Number(cleared.failed_attempts), 0, 'el contador debe reiniciarse tras un login valido');
    assert.ok(!cleared.locked_until, 'el bloqueo debe limpiarse tras un login valido');
});

test('bloqueo: la espera corta de 10 s no es un bloqueo largo (5 o 15 minutos)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves de gestion'); return; }

    const secret = totp.generateSecret();
    const username = `test.lockshort.${suffix}`;
    const [res] = await pool.query(
        `INSERT INTO staff_accounts (username, password_hash, role, mfa_secret_enc)
         VALUES (?, ?, ?, ?)`,
        [username, await bcrypt.hash(PASSWORD, 10), 'support', mfaCrypto.encrypt(secret)]
    );
    const acct = { id: res.insertId, username, role: 'support', secret };
    created.push(acct);

    for (let i = 0; i < 3; i += 1) await login(acct, '000000');

    const [[row]] = await pool.query('SELECT locked_until FROM staff_accounts WHERE id = ?', [acct.id]);
    const seconds = Math.round((new Date(row.locked_until) - new Date()) / 1000);
    assert.ok(seconds > 5 && seconds <= 12,
        `el bloqueo debe ser de unos 10 segundos, no de 5 o 15 minutos (quedan ${seconds}s)`);
});

// ---------------------------------------------------------------- MFA sin bypass
//
// Se llama al servicio directamente para probar la logica del servidor sin gastar
// el limite de peticiones de autenticacion del router.

const staffAuth = require('../src/services/staffAuth.service');

function makeStaff(prefix) {
    const secret = totp.generateSecret();
    const username = `test.mfa.${prefix}.${suffix}`;
    return pool.query(
        `INSERT INTO staff_accounts (username, password_hash, role, mfa_secret_enc)
         VALUES (?, ?, ?, ?)`,
        [username, bcrypt.hashSync(PASSWORD, 8), 'support', mfaCrypto.encrypt(secret)]
    ).then(([res]) => {
        const acct = { id: res.insertId, username, role: 'support', secret };
        created.push(acct);
        return acct;
    });
}

test('MFA: la contrasena sola no abre sesion (sin campo totp no hay bypass)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves de gestion'); return; }
    const acct = await makeStaff('nototp');

    await assert.rejects(
        () => staffAuth.login({ username: acct.username, password: PASSWORD, ip: '127.0.0.1' }),
        (err) => err.status === 401
    );
    await assert.rejects(
        () => staffAuth.login({ username: acct.username, password: PASSWORD, totp: '', ip: '127.0.0.1' }),
        (err) => err.status === 401
    );
});

test('MFA: el codigo TOTP de otra cuenta no sirve', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves de gestion'); return; }
    const a = await makeStaff('cross');
    const b = await makeStaff('cross2');

    //密码 correcta de A pero codigo generado con el secreto de B.
    await assert.rejects(
        () => staffAuth.login({ username: a.username, password: PASSWORD, totp: totp.generateToken(b.secret), ip: '127.0.0.1' }),
        (err) => err.status === 401
    );
});

test('MFA: un codigo caducado no sirve (ventana de 30 s)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves de gestion'); return; }
    const acct = await makeStaff('expired');

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const stale = totp.generateToken(acct.secret, fiveMinutesAgo);

    await assert.rejects(
        () => staffAuth.login({ username: acct.username, password: PASSWORD, totp: stale, ip: '127.0.0.1' }),
        (err) => err.status === 401
    );

    // El codigo vigente de la misma cuenta si entra: comprueba que el rechazo
    // anterior era por caducidad y no por un fallo general del MFA.
    const fresh = await staffAuth.login({ username: acct.username, password: PASSWORD, totp: totp.generateToken(acct.secret), ip: '127.0.0.1' });
    assert.ok(fresh.token, 'el codigo vigente debe abrir sesion');
});

test('MFA: un secreto que no se puede descifrar rechaza el login (sin bypass)', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves de gestion'); return; }

    const username = `test.corrupt.${suffix}`;
    const [res] = await pool.query(
        `INSERT INTO staff_accounts (username, password_hash, role, mfa_secret_enc)
         VALUES (?, ?, ?, ?)`,
        [username, bcrypt.hashSync(PASSWORD, 8), 'support', Buffer.from('esto-no-es-un-secretocifrado')]
    );
    const broken = { id: res.insertId, username, role: 'support', secret: totp.generateSecret() };
    created.push(broken);

    // El descifrado falla y el catch marca totpOk=false: la sesion NO se abre ni
    // con la contrasena correcta. Un fallo de MFA no puede convertirse en bypass.
    await assert.rejects(
        () => staffAuth.login({ username: broken.username, password: PASSWORD, totp: totp.generateToken(broken.secret), ip: '127.0.0.1' }),
        (err) => err.status === 401
    );
});

test('MFA: el token de gestion solo se emite tras validar los dos factores', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves de gestion'); return; }
    const acct = await makeStaff('twofactor');

    const ok = await staffAuth.login({ username: acct.username, password: PASSWORD, totp: totp.generateToken(acct.secret), ip: '127.0.0.1' });
    assert.ok(ok.token, 'con los dos factores se emite token');
    assert.strictEqual(ok.role, 'support');
    assert.strictEqual(ok.expiresIn, 20 * 60, 'la sesion de gestion debe durar 20 minutos');

    // Firma verificable con el secreto de gestion y marcada como tipo staff.
    const decoded = jwt.verify(ok.token, process.env.STAFF_JWT_SECRET);
    assert.strictEqual(decoded.typ, 'staff');
    const life = decoded.exp - decoded.iat;
    assert.ok(life <= 20 * 60, `el token no debe vivir mas de 20 minutos (vive ${life}s)`);

    // Ese mismo token de gestion no sirve contra las rutas de plataforma.
    const asPlatform = await call('GET', '/users/me', { token: ok.token });
    assert.strictEqual(asPlatform.status, 401);
});
