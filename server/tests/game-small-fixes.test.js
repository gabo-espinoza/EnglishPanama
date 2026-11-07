// Correcciones menores de la revision del PR #26: `hidden` booleano e ids numericos estrictos. MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');
const { parseId } = require('../src/utils/ids');

let ctx; let gm; let cm; let sup; let teacher; let student; let activityId;

test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    gm = await fx.createStaff('game_manager');
    cm = await fx.createStaff('content_manager');
    sup = await fx.createStaff('support');
    teacher = await fx.createTeacher();
    student = await fx.createStudent(teacher.id);
    activityId = await fx.createActivity();
});
test.after(async () => { await fx.stop(ctx.server); });

test('parseId solo acepta enteros positivos en texto plano', () => {
    assert.equal(parseId('7'), 7);
    assert.equal(parseId(12), 12);
    for (const bad of ['abc', '', '0', '-1', '1.5', '1e2', ' 3', '3 ', '99999999999', undefined, null, {}]) {
        assert.throws(() => parseId(bad), /no es valido/, String(bad));
    }
});

test('setAliasHidden exige un booleano: sin hidden no cambia nada', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const hiddenStudent = await fx.createStudent(teacher.id, { hidden: true });
    const put = (body) => fx.http(ctx.baseUrl, gm.token, 'PUT', `/staff/game/aliases/${hiddenStudent.id}`, body);
    for (const body of [{}, { hidden: 'false' }, { hidden: 0 }, { hidden: null }, { hide: false }]) {
        assert.equal((await put(body)).status, 400, JSON.stringify(body));
    }
    const [[row]] = await fx.pool.query('SELECT alias_hidden FROM students WHERE user_id = ?', [hiddenStudent.id]);
    assert.equal(row.alias_hidden, 1, 'el alias oculto no debe mostrarse por un cuerpo invalido');
    assert.equal((await put({ hidden: false })).status, 200);
    const [[after]] = await fx.pool.query('SELECT alias_hidden FROM students WHERE user_id = ?', [hiddenStudent.id]);
    assert.equal(after.alias_hidden, 0);
});

test('ids no numericos responden 400 (contenido, reportes y juego)', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const call = (who, method, path, body) => fx.http(ctx.baseUrl, who.token, method, path, body);
    assert.equal((await call(cm, 'GET', '/staff/content/activities/abc')).status, 400);
    assert.equal((await call(cm, 'POST', '/staff/content/activities/1.5/submit')).status, 400);
    assert.equal((await call(cm, 'PUT', `/staff/content/activities/${activityId}/questions/xyz`, {})).status, 400);
    assert.equal((await call(sup, 'PATCH', '/staff/reports/abc', { decision: 'dismiss' })).status, 400);
    assert.equal((await call(gm, 'PUT', '/staff/game/aliases/abc', { hidden: true })).status, 400);
    assert.equal((await call(gm, 'DELETE', '/staff/game/daily-challenges/1e2')).status, 400);
});
