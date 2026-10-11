// Pruebas de integración del backend (casos que no dependen de la base de datos).
// Se ejecutan con el runner nativo de Node: `npm test`.
//
// Verifican lo que un atacante intentaría primero: entrar sin token, con rol
// equivocado, mandar basura o forzar el modo demo. No necesitan MySQL porque
// todas estas validaciones ocurren antes de tocar la base.

const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-no-usar-en-produccion';
process.env.DEMO_MODE = 'false';

const app = require('../src/app');

let server;
let baseUrl;

test.before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(() => {
    server.close();
});

function token(role, id = 1) {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

test('rechaza rutas protegidas sin token (401)', async () => {
    const res = await fetch(`${baseUrl}/ranking`);
    assert.strictEqual(res.status, 401);
    assert.ok((await res.json()).error);
});

test('rechaza un rol equivocado (403)', async () => {
    const res = await fetch(`${baseUrl}/teacher/students`, {
        headers: { Authorization: `Bearer ${token('student')}` }
    });
    assert.strictEqual(res.status, 403);
});

test('un token inválido responde 401', async () => {
    const res = await fetch(`${baseUrl}/ranking`, {
        headers: { Authorization: 'Bearer esto.no.es.un.jwt' }
    });
    assert.strictEqual(res.status, 401);
});

test('el modo demo apagado responde 403', async () => {
    const res = await fetch(`${baseUrl}/demo/advance-day`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token('student')}` }
    });
    assert.strictEqual(res.status, 403);
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

test('username inválido responde 400', async () => {
    const res = await fetch(`${baseUrl}/auth/register/student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'a', password: '1234', classCode: 'ABC123' })
    });
    assert.strictEqual(res.status, 400);
});

test('JSON inválido responde 400', async () => {
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
