// Buscador de preguntas del game_manager y reglas de alta en el pool del reto diario. MySQL real.
// La actividad solo queda publicada dentro de cada prueba (otras pruebas leen las publicadas).
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');

let ctx; let gm; let cm; let publishedId; let draftId; let publishedQ; let draftQ; let markerQ;
const marker = `zqx${fx.suffix}`;
const challenges = [];

async function addQuestion(activityId, prompt) {
    const [q] = await fx.pool.query(
        "INSERT INTO questions (activity_id, topic, prompt, options, correct_answer) VALUES (?, 'x', ?, ?, ?)",
        [activityId, prompt, JSON.stringify(['uno', 'dos']), JSON.stringify('uno')]
    );
    return q.insertId;
}
const setStatus = (id, status) => fx.pool.query('UPDATE activities SET status = ? WHERE id = ?', [status, id]);
const get = (path, who = gm) => fx.http(ctx.baseUrl, who.token, 'GET', `/staff/game/questions${path}`);
const post = (body) => fx.http(ctx.baseUrl, gm.token, 'POST', '/staff/game/daily-challenges', body);

test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    gm = await fx.createStaff('game_manager');
    cm = await fx.createStaff('content_manager');
    publishedId = await fx.createActivity({ level: 'A1.2' });
    draftId = await fx.createActivity();
    publishedQ = await addQuestion(publishedId, `Pregunta ${marker} 100% lista_ok`);
    markerQ = await addQuestion(publishedId, `Otra ${marker} distinta`);
    draftQ = await addQuestion(draftId, `Borrador ${marker}`);
});
test.after(async () => {
    if (ctx.ready) {
        await setStatus(publishedId, 'draft');
        if (challenges.length) await fx.pool.query('DELETE FROM daily_challenges WHERE id IN (?)', [challenges]);
    }
    await fx.stop(ctx.server);
});

test('el buscador solo lo ve el game_manager', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    assert.equal((await get('', cm)).status, 403);
    assert.equal((await fx.http(ctx.baseUrl, null, 'GET', '/staff/game/questions')).status, 401);
});

test('lista solo preguntas publicadas y nunca la respuesta correcta ni las opciones', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    await setStatus(publishedId, 'published');
    try {
        const res = await get(`?q=${marker}`);
        assert.equal(res.status, 200);
        const rows = await res.json();
        assert.deepEqual(rows.map((r) => r.id).sort(), [publishedQ, markerQ].sort());
        assert.ok(!rows.some((r) => r.id === draftQ), 'una pregunta de borrador no debe listarse');
        const row = rows.find((r) => r.id === publishedQ);
        assert.deepEqual(Object.keys(row).sort(),
            ['activityId', 'activityTitle', 'gameType', 'id', 'level', 'module', 'text']);
        assert.equal(row.activityId, publishedId);
        assert.equal(row.module, 'vocabulary');
        assert.equal(row.level, 'A1.2');
        assert.equal(row.gameType, 'multiple_choice');
        assert.ok(!JSON.stringify(rows).includes('correct'));
        assert.ok(!('options' in row));
    } finally {
        await setStatus(publishedId, 'draft');
    }
    const after = await (await get(`?q=${marker}`)).json();
    assert.equal(after.length, 0, 'con la actividad en borrador no debe aparecer nada');
});

test('filtros por modulo, nivel y texto (sin distinguir mayusculas, con comodines escapados) y limite', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    await setStatus(publishedId, 'published');
    try {
        const ids = async (qs) => (await (await get(qs)).json()).map((r) => r.id);
        assert.deepEqual(await ids(`?q=${marker.toUpperCase()}&level=A1.2&module=vocabulary`).then((a) => a.sort()),
            [publishedQ, markerQ].sort());
        assert.deepEqual(await ids(`?q=${marker}&level=A1.1`), []);
        assert.deepEqual(await ids(`?q=${marker}&module=grammar`), []);
        assert.deepEqual(await ids(`?q=${encodeURIComponent('100% lista_ok')}`), [publishedQ]);
        assert.deepEqual(await ids(`?q=${encodeURIComponent('100_ lista')}`), [], '_ no debe ser comodin');
        assert.deepEqual(await ids(`?q=${encodeURIComponent("'; DROP TABLE questions;--")}`), []);
        assert.equal((await ids(`?q=${marker}&limit=1`)).length, 1);
        const big = await get('?limit=100000');
        assert.equal(big.status, 400);
        assert.ok((await (await get('?limit=100')).json()).length <= 100);
        assert.ok((await (await get('')).json()).length <= 50, 'sin limit el maximo es 50');
    } finally {
        await setStatus(publishedId, 'draft');
    }
});

test('parametros invalidos dan 400', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    for (const qs of ['?module=otro', '?level=B2', `?q=${'a'.repeat(101)}`, '?limit=0', '?limit=abc',
        '?q=a&q=b', '?module=grammar&module=reading']) {
        assert.equal((await get(qs)).status, 400, qs);
    }
    assert.equal((await get(`?q=${'a'.repeat(100)}`)).status, 200);
});

test('agregar al pool: rechaza actividades no publicadas y duplicados', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const draftRes = await post({ questionId: draftQ });
    assert.equal(draftRes.status, 409);
    assert.equal((await draftRes.json()).code, 'QUESTION_NOT_PUBLISHED');
    assert.equal((await post({ questionId: 999999999 })).status, 404);
    const [[none]] = await fx.pool.query('SELECT COUNT(*) AS n FROM daily_challenges WHERE question_id = ?', [draftQ]);
    assert.equal(none.n, 0);

    await setStatus(publishedId, 'published');
    try {
        const ok = await post({ questionId: publishedQ });
        assert.equal(ok.status, 201);
        challenges.push((await ok.json()).id);
        const dup = await post({ questionId: publishedQ });
        assert.equal(dup.status, 409);
        assert.equal((await dup.json()).code, 'QUESTION_ALREADY_IN_POOL');
        const [[count]] = await fx.pool.query('SELECT COUNT(*) AS n FROM daily_challenges WHERE question_id = ?', [publishedQ]);
        assert.equal(count.n, 1);
    } finally {
        await setStatus(publishedId, 'draft');
    }
});
