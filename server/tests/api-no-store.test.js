// D-007: las respuestas de la API no llevaban Cache-Control. Ahora todas llevan no-store.
// No necesita MySQL (un 401 y un 404 no tocan la base); si hay base tambien se comprueba /users/me.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');

let ctx;
test.before(async () => { ctx = await fx.start(); });
test.after(async () => { await fx.stop(ctx.server); });

test('un 401 y un 404 de la API llevan Cache-Control: no-store', async () => {
    const unauthorized = await fx.http(ctx.baseUrl, null, 'GET', '/users/me');
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.headers.get('cache-control'), 'no-store');
    const missing = await fx.http(ctx.baseUrl, null, 'GET', '/no-existe');
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('cache-control'), 'no-store');
});

test('un JSON malformado (400) tambien lleva no-store', async () => {
    const res = await fetch(`${ctx.baseUrl}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{ roto'
    });
    assert.equal(res.status, 400);
    assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('GET /users/me autenticado lleva Cache-Control: no-store', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const teacher = await fx.createTeacher();
    const res = await fx.http(ctx.baseUrl, teacher.token, 'GET', '/users/me');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('GET /health tambien lleva no-store', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const res = await fx.http(ctx.baseUrl, null, 'GET', '/health');
    assert.equal(res.headers.get('cache-control'), 'no-store');
});
