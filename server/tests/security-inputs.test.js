// Pruebas de entradas maliciosas (diseno §5.6). No necesitan MySQL: todas estas
// validaciones ocurren ANTES de tocar la base de datos, asi que un 500 seria un
// error de validacion y no una caida de la conexion.
const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();
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

test.after(async () => {
    server.close();
});

function post(path, body) {
    return fetch(baseUrl + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

test('classCode con tipo raro responde 400, nunca 500', async () => {
    for (const classCode of [{}, 123, [], null, '   ', 'x'.repeat(500)]) {
        const res = await post('/auth/register/student', {
            username: 'alumno_valido', password: 'clave123', classCode
        });
        assert.ok(res.status < 500, `classCode ${JSON.stringify(classCode)} -> ${res.status}`);
        assert.ok([400, 401, 404].includes(res.status));
    }
});

test('payloads de inyeccion SQL y XSS no rompen el registro', async () => {
    const payloads = [
        "' OR 1=1 --",
        "'; DROP TABLE users; --",
        '" OR ""="',
        'estudiante01\' UNION SELECT 1,2,3 --',
        '<script>alert(1)</script>',
        '" onmouseover="alert(1)',
        '<img src=x onerror=alert(1)>'
    ];
    for (const payload of payloads) {
        const res = await post('/auth/register/student', {
            username: payload, password: 'clave123', classCode: 'XXXXXX'
        });
        assert.ok(res.status < 500, `payload ${payload} -> ${res.status}`);
        assert.equal(res.status, 400, 'username invalido debe ser 400');
    }
});

test('password no texto responde 401, nunca 500', async () => {
    for (const password of [12345, {}, [], true]) {
        const res = await post('/auth/login', { username: 'alumno_valido', password });
        assert.ok(res.status < 500, `password ${JSON.stringify(password)} -> ${res.status}`);
        assert.ok([400, 401].includes(res.status));
    }
});

test('JSON mal formado responde 400 y el body grande 413', async () => {
    const bad = await fetch(baseUrl + '/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{no-json'
    });
    assert.equal(bad.status, 400);

    const big = await fetch(baseUrl + '/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'a'.repeat(200000), password: 'clave123' })
    });
    assert.equal(big.status, 413);
});

test('rutas protegidas sin token siguen respondiendo 401', async () => {
    for (const path of ['/users/me', '/ranking', '/daily-challenge', '/activities/vocabulary']) {
        const res = await fetch(baseUrl + path);
        assert.equal(res.status, 401, path);
    }
});
