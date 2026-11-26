// D-003: GET /staff/audit con from/to invalidos devolvia 500 ("Incorrect DATETIME value").
// Ahora es 400; las fechas validas siguen filtrando. Usa MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');

let ctx; let auditor;
test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    auditor = await fx.createStaff('auditor');
});
test.after(async () => { await fx.stop(ctx.server); });

const get = (query) => fx.http(ctx.baseUrl, auditor.token, 'GET', `/staff/audit${query}`);

test('from y to invalidos dan 400 con mensaje en espanol', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const bad = ['abc', 'http://www.google.com/', "2026-01-01'", '2026-02-31', '2026-13-01', '2026-01-01 25:00:00', '20260101', '1 OR 1=1'];
    for (const value of bad) {
        for (const key of ['from', 'to']) {
            const res = await get(`?${key}=${encodeURIComponent(value)}`);
            assert.equal(res.status, 400, `${key}=${value}`);
            assert.match((await res.json()).error, /no es una fecha valida/);
        }
    }
    assert.equal((await get('?from[]=2026-01-01')).status, 400, 'un arreglo tampoco es una fecha');
});

test('fechas validas (solo fecha, con hora, con T) responden 200', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    for (const value of ['2026-01-01', '2026-01-01 10:30:00', '2026-01-01T10:30:00', '2026-01-01 10:30', '2026-01-01 10:30:00.123']) {
        const res = await get(`?from=${encodeURIComponent(value)}&to=${encodeURIComponent('2999-12-31')}`);
        assert.equal(res.status, 200, value);
        assert.equal(typeof (await res.json()).total, 'number');
    }
    const empty = await get('');
    assert.equal(empty.status, 200);
});
