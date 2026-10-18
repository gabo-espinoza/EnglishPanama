// Pruebas de integracion del backend (casos que no dependen de la base de datos).
// Se ejecutan con el runner nativo de Node: `npm test`.
//
// Verifican lo que un atacante intentaria primero: entrar sin token, con rol
// equivocado, mandar basura o forzar el modo demo. No necesitan MySQL porque
// todas estas validaciones ocurren antes de tocar la base.

const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

// Carga el .env si existe (para poder revalidar contra MySQL local). Si no hay
// .env o no hay MySQL, las pruebas que dependen de la base se omiten solas.
require('dotenv').config();

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-no-usar-en-produccion';
process.env.DEMO_MODE = 'false';

const app = require('../src/app');
const pool = require('../src/config/db');

let server;
let baseUrl;
let dbUp = false;
let studentToken = null;

test.before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    // La revalidacion de zero trust consulta la base: si MySQL esta disponible se
    // obtiene un estudiante real para probar los roles; si no, esas pruebas se omiten.
    try {
        const [rows] = await pool.query(
            "SELECT u.id, u.token_version FROM users u WHERE u.role = 'student' LIMIT 1"
        );
        if (rows.length > 0) {
            dbUp = true;
            studentToken = jwt.sign(
                { id: rows[0].id, role: 'student', tv: rows[0].token_version },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );
        }
    } catch {
        dbUp = false;
    }
});

test.after(async () => {
    server.close();
    try { await pool.end(); } catch { /* sin conexiones */ }
});

function token(role, id = 1) {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

test('rechaza rutas protegidas sin token (401)', async () => {
    const res = await fetch(`${baseUrl}/ranking`);
    assert.strictEqual(res.status, 401);
    assert.ok((await res.json()).error);
});

test('el perfil de usuario exige token (401)', async () => {
    const res = await fetch(`${baseUrl}/users/me`);
    assert.strictEqual(res.status, 401);
    assert.ok((await res.json()).error);
});

test('actualizar el perfil exige token (401)', async () => {
    const res = await fetch(`${baseUrl}/users/me`, { method: 'PATCH' });
    assert.strictEqual(res.status, 401);
    assert.ok((await res.json()).error);
});

test('rechaza un rol equivocado (403)', async (t) => {
    if (!dbUp) { t.skip('sin MySQL disponible'); return; }
    const res = await fetch(`${baseUrl}/teacher/students`, {
        headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert.strictEqual(res.status, 403);
});

test('un token invalido responde 401', async () => {
    const res = await fetch(`${baseUrl}/ranking`, {
        headers: { Authorization: 'Bearer esto.no.es.un.jwt' }
    });
    assert.strictEqual(res.status, 401);
});

test('el modo demo apagado responde 403', async (t) => {
    if (!dbUp) { t.skip('sin MySQL disponible'); return; }
    const res = await fetch(`${baseUrl}/demo/advance-day`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert.strictEqual(res.status, 403);
});

test('las rutas de gestion exigen token (401)', async () => {
    const res = await fetch(`${baseUrl}/staff/me`);
    assert.strictEqual(res.status, 401);
    assert.ok((await res.json()).error);
});

test('un token de estudiante no sirve en las rutas de gestion (401)', async () => {
    const res = await fetch(`${baseUrl}/staff/me`, {
        headers: { Authorization: `Bearer ${token('student', 2)}` }
    });
    assert.strictEqual(res.status, 401);
});

test('un token de gestion no sirve en las rutas de estudiante (401)', async () => {
    const staffToken = jwt.sign(
        { sub: 1, typ: 'staff', role: 'auditor', aud: 'audit', tv: 0 },
        process.env.STAFF_JWT_SECRET || 'otro-secreto',
        { expiresIn: '20m' }
    );
    const res = await fetch(`${baseUrl}/ranking`, {
        headers: { Authorization: `Bearer ${staffToken}` }
    });
    assert.strictEqual(res.status, 401);
});

test('login sin datos responde 400 con formato de error', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 400);
    assert.ok((await res.json()).error);
});

test('registro de docente sin displayName responde 400', async () => {
    const res = await fetch(`${baseUrl}/auth/register/teacher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'profe', password: '1234' })
    });
    assert.strictEqual(res.status, 400);
});

test('username invalido responde 400', async () => {
    const res = await fetch(`${baseUrl}/auth/register/student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'a', password: '1234', classCode: 'ABC123' })
    });
    assert.strictEqual(res.status, 400);
});

test('JSON invalido responde 400', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ esto no es json'
    });
    assert.strictEqual(res.status, 400);
    assert.ok((await res.json()).error);
});

test('body demasiado grande responde 413', async () => {
    const big = 'x'.repeat(200 * 1024);
    const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: big, password: big })
    });
    assert.strictEqual(res.status, 413);
});

test('helmet agrega cabeceras de seguridad', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    assert.ok(res.headers.get('x-content-type-options'));
    assert.ok(res.headers.get('x-dns-prefetch-control') !== undefined);
});

test('helmet agrega una politica de seguridad de contenido (CSP)', async () => {
    const res = await fetch(`${baseUrl}/ranking`);
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, 'debe venir la cabecera Content-Security-Policy');
    assert.match(csp, /default-src 'self'/, 'debe restringir las fuentes por defecto');
});

test('inyeccion SQL en el login: no entra ni rompe la base (400/401)', async (t) => {
    const payloads = [
        "' OR '1'='1",
        "admin'--",
        "'; DROP TABLE users; --",
        '" OR ""="',
        "estudiante01' UNION SELECT 1,2,3 --"
    ];
    for (const username of payloads) {
        const res = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: "' OR 1=1 --" })
        });
        // 400/401 esperado; 429 solo si el limite de intentos ya se disparo en esta corrida.
        assert.ok([400, 401, 429].includes(res.status), `payload ${username} -> ${res.status}`);
        assert.ok(!(await res.json()).token, 'una inyeccion no debe entregar sesion');
    }

    if (dbUp) {
        // La tabla sigue existiendo y con datos: el payload no se ejecuto como SQL.
        const [rows] = await pool.query('SELECT COUNT(*) AS n FROM users');
        assert.ok(Number(rows[0].n) >= 1, 'la tabla users debe seguir existiendo');
    }
});
