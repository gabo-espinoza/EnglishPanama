// D-006: una ruta inexistente de la API respondia 404 en HTML ("Cannot GET ..."). Ahora es JSON.
// No necesita MySQL: las rutas inexistentes no tocan la base.
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

let server; let baseUrl;
test.before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); });

test('GET y POST a una ruta de la API inexistente: 404 JSON con mensaje', async () => {
    for (const [method, path] of [['GET', '/api/no-existe'], ['POST', '/api/auth/no-existe'], ['DELETE', '/api/staff/x/y/z'], ['GET', '/api/']]) {
        const res = await fetch(`${baseUrl}${path}`, { method });
        assert.equal(res.status, 404, `${method} ${path}`);
        assert.match(res.headers.get('content-type'), /application\/json/);
        assert.deepEqual(await res.json(), { error: 'Ruta no encontrada.' });
    }
});

test('fuera de /api el comportamiento no cambia (la app no sirve el cliente)', async () => {
    const res = await fetch(`${baseUrl}/otra-cosa`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type'), /text\/html/);
});

test('una ruta real sigue respondiendo lo suyo (401 sin token, no 404)', async () => {
    const res = await fetch(`${baseUrl}/api/users/me`);
    assert.equal(res.status, 401);
});
