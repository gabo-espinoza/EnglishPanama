// D-002: POST /staff/change-requests con targetId no numerico devolvia 500 (el INSERT fallaba
// en MySQL con "Data truncated"). Ahora es un 400 claro. Usa MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');

let ctx; let access; let target; let auditor;
test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    access = await fx.createStaff('access_manager');
    target = await fx.createStaff('analyst');
    auditor = await fx.createStaff('auditor');
});
test.after(async () => { await fx.stop(ctx.server); });

const request = (targetId) => fx.http(ctx.baseUrl, access.token, 'POST', '/staff/change-requests', { targetId, action: 'suspend' });

test('targetId no numerico, decimal, negativo o con comillas da 400 y no 500', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    for (const bad of ["2'", `${target.id}'`, `${target.id} AND SLEEP(4)`, 'abc', '1.5', '1e2', -3, 0, null, [], {}, '']) {
        const res = await request(bad);
        assert.equal(res.status, 400, `targetId=${JSON.stringify(bad)}`);
        assert.match((await res.json()).error, /identificador de la cuenta no es valido/i);
    }
});

test('targetId valido sigue creando la solicitud (numero o texto numerico)', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const res = await request(target.id);
    assert.equal(res.status, 201);
    assert.equal((await res.json()).targetId, target.id);
    const asText = await request(String(target.id));
    assert.equal(asText.status, 201);
    await fx.pool.query('DELETE FROM staff_change_requests WHERE target_id = ?', [target.id]);
});

test('id de solicitud no numerico en la decision da 400', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    for (const bad of ['abc', '1e2', '0']) {
        const res = await fx.http(ctx.baseUrl, auditor.token, 'POST', `/staff/change-requests/${bad}/decision`, { decision: 'approved' });
        assert.equal(res.status, 400, `id=${bad}`);
    }
});
