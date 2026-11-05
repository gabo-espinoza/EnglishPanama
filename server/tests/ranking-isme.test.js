// Alias oculto: el ranking marca la fila propia con `isMe` aunque el alias se muestre como
// 'Jugador oculto'. MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');
const { buildRanking } = require('../src/services/ranking.service');

let ctx;
test.before(async () => { ctx = await fx.start(); });
test.after(async () => { await fx.stop(ctx.server); });

const ranking = async (who) => {
    const res = await fx.http(ctx.baseUrl, who.token, 'GET', '/ranking');
    assert.equal(res.status, 200);
    return res.json();
};

test('un estudiante oculto se reconoce a si mismo y no a otros ocultos', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const teacher = await fx.createTeacher();
    const me = await fx.createStudent(teacher.id, { hidden: true, xp: 50 });
    const otherHidden = await fx.createStudent(teacher.id, { hidden: true, xp: 40 });
    const visible = await fx.createStudent(teacher.id, { xp: 30 });

    const rows = await ranking(me);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => r.isMe), [true, false, false]);
    assert.deepEqual(rows.map((r) => r.alias), ['Jugador oculto', 'Jugador oculto', visible.username]);
    assert.deepEqual(rows.map((r) => r.position), [1, 2, 3]);
    assert.equal(JSON.stringify(rows).includes('studentId'), false, 'no debe exponerse el id');

    // Desde el otro oculto, la marca cae en su propia fila.
    assert.deepEqual((await ranking(otherHidden)).map((r) => r.isMe), [false, true, false]);
    // Un estudiante visible se reconoce con su alias real.
    const rowsVisible = await ranking(visible);
    assert.deepEqual(rowsVisible.map((r) => r.isMe), [false, false, true]);
    assert.equal(rowsVisible[2].alias, visible.username);
});

test('buildRanking sin viewer no marca a nadie', () => {
    const r = buildRanking([{ studentId: 1, alias: 'a', avatar: 'x', xp: 1, aliasHidden: false }]);
    assert.equal(r[0].isMe, false);
});
