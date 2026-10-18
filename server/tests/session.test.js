// Pruebas de la sesion de plataforma: duracion y revocacion (zero trust).
//
// Comprueban que la sesion de estudiante/docente dura 2 horas y que, si la cuenta
// se suspende o su version de token cambia, el token deja de servir aunque no haya
// expirado. Se omiten solas si no hay MySQL.
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

const PASSWORD = 'ProfesorPrueba12345';
const suffix = String(Date.now()).slice(-7);
let teacher; // { id, username, secret }

test.before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    if (!process.env.JWT_SECRET || !process.env.STAFF_MFA_KEY) return;
    try { await pool.query('SELECT 1'); } catch { return; }

    const hash = await bcrypt.hash(PASSWORD, 10);
    const username = `prof.sesion.${suffix}`;
    // El MFA es obligatorio para docentes: la cuenta de prueba ya tiene autenticador
    // vinculado y entra con el flujo completo (contrasena + codigo).
    const secret = totp.generateSecret();
    const [res] = await pool.query(
        "INSERT INTO users (role, username, password_hash, mfa_secret_enc) VALUES ('teacher', ?, ?, ?)",
        [username, hash, mfaCrypto.encrypt(secret)]
    );
    await pool.query(
        'INSERT INTO teachers (user_id, display_name, class_code) VALUES (?, ?, ?)',
        [res.insertId, 'Docente Sesion', 'S' + suffix.slice(-5).toUpperCase()]
    );
    teacher = { id: res.insertId, username, secret };
    ready = true;
});

test.after(async () => {
    if (ready) {
        await pool.query('DELETE FROM teachers WHERE user_id = ?', [teacher.id]);
        await pool.query('DELETE FROM users WHERE id = ?', [teacher.id]);
    }
    server.close();
    try { await pool.end(); } catch { /* sin conexiones */ }
});

function post(path, body) {
    return fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

// Inicio de sesion completo del docente: contrasena, reto de MFA y codigo TOTP.
// Devuelve el JWT de plataforma.
async function login() {
    const first = await (await post('/auth/login', { username: teacher.username, password: PASSWORD })).json();
    assert.ok(first.mfaToken, 'un docente con MFA debe recibir el reto, no la sesion');
    const second = await (await post('/auth/login/mfa', {
        mfaToken: first.mfaToken,
        totp: totp.generateToken(teacher.secret)
    })).json();
    return second.token;
}

function me(token) {
    return fetch(`${baseUrl}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
}

test('la sesion de plataforma dura 2 horas (no mas)', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const token = await login();
    assert.ok(token);

    const decoded = jwt.decode(token);
    assert.strictEqual(decoded.exp - decoded.iat, 2 * 60 * 60, 'debe durar exactamente 2 horas');
});

test('cambiar la version de token revoca un token ya emitido (401)', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const token = await login();
    assert.strictEqual((await me(token)).status, 200, 'el token recien emitido debe servir');

    // Revocacion: la cuenta sigue activa, pero cambio su version de token.
    await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [teacher.id]);
    assert.strictEqual((await me(token)).status, 401, 'el token viejo debe quedar revocado');
});

test('suspender la cuenta invalida su token aunque no haya expirado (401)', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    // Tras la revocacion anterior el token viejo ya no sirve; se pide uno nuevo con la
    // version de token ya incrementada.
    const token = await login();
    assert.strictEqual((await me(token)).status, 200);

    await pool.query('UPDATE users SET is_active = 0 WHERE id = ?', [teacher.id]);
    assert.strictEqual((await me(token)).status, 401, 'una cuenta suspendida no debe servir');
});
