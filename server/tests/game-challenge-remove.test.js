// Revision del PR #26: quitar un reto diario no debe borrar por cascada los completados de hoy
// (quien ya lo hizo podria repetirlo y cobrar el XP otra vez). MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');
const { effectiveDay } = require('../src/utils/day');
const clock = require('../src/utils/clock');
const { getDemoDayOffset } = require('../src/services/settings.service');

let ctx; let gm; let teacher; let student; let activityId;

test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    gm = await fx.createStaff('game_manager');
    teacher = await fx.createTeacher();
    student = await fx.createStudent(teacher.id);
    activityId = await fx.createActivity();
});
test.after(async () => { await fx.stop(ctx.server); });

async function newChallenge() {
    const [q] = await fx.pool.query(
        "INSERT INTO questions (activity_id, topic, prompt, options, correct_answer) VALUES (?, 'x', 'p', ?, ?)",
        [activityId, JSON.stringify(['a', 'b']), JSON.stringify('a')]
    );
    const [c] = await fx.pool.query('INSERT INTO daily_challenges (question_id, position) VALUES (?, 9999)', [q.insertId]);
    return c.insertId;
}
const todayEffective = async () => effectiveDay(clock.now(), await getDemoDayOffset()).date;

test('quitar un reto completado hoy se rechaza y conserva los registros', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const id = await newChallenge();
    await fx.pool.query('INSERT INTO daily_completions (student_id, challenge_id, completed_on) VALUES (?, ?, ?)',
        [student.id, id, await todayEffective()]);
    const res = await fx.http(ctx.baseUrl, gm.token, 'DELETE', `/staff/game/daily-challenges/${id}`);
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'CHALLENGE_COMPLETED_TODAY');
    const [[c]] = await fx.pool.query('SELECT COUNT(*) AS n FROM daily_challenges WHERE id = ?', [id]);
    const [[d]] = await fx.pool.query('SELECT COUNT(*) AS n FROM daily_completions WHERE challenge_id = ?', [id]);
    assert.equal(c.n, 1);
    assert.equal(d.n, 1, 'el registro de completado no debe borrarse por cascada');
});

test('un reto sin completados de hoy si se puede quitar', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const id = await newChallenge();
    await fx.pool.query("INSERT INTO daily_completions (student_id, challenge_id, completed_on) VALUES (?, ?, '2020-01-01')",
        [student.id, id]);
    assert.equal((await fx.http(ctx.baseUrl, gm.token, 'DELETE', `/staff/game/daily-challenges/${id}`)).status, 200);
});
