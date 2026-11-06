// El "dia" del reto diario es el de Panama (UTC-5 fijo), no el UTC. Con el dia UTC el reto
// cambiaba a las 19:00 de Panama. Estas pruebas congelan el reloj (utils/clock) y usan MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');
const clock = require('../src/utils/clock');

let ctx; let gm; let student; let other; let activityId;

test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    gm = await fx.createStaff('game_manager');
    const teacher = await fx.createTeacher();
    await fx.pool.query('UPDATE teachers SET grade = 3, grade_locked_at = NOW() WHERE user_id = ?', [teacher.id]);
    student = await fx.createStudent(teacher.id);
    other = await fx.createStudent(teacher.id);
    activityId = await fx.createActivity({ status: 'published', level: 'A1.1' });
    const [q] = await fx.pool.query(
        "INSERT INTO questions (activity_id, topic, prompt, options, correct_answer) VALUES (?, 'x', 'p', ?, ?)",
        [activityId, JSON.stringify(['a', 'b']), JSON.stringify('a')]
    );
    await fx.pool.query('INSERT INTO daily_challenges (question_id, position) VALUES (?, 9998)', [q.insertId]);
});
test.after(async () => {
    clock.setNow(null);
    await fx.stop(ctx.server);
});
test.afterEach(() => clock.setNow(null));

const getToday = async () => {
    const res = await fx.http(ctx.baseUrl, student.token, 'GET', '/daily-challenge');
    assert.equal(res.status, 200);
    return res.json();
};

// Responde con la respuesta correcta de la pregunta asignada (otros archivos de prueba pueden
// ampliar el conjunto del nivel en paralelo: se lee la asignada con GET y se reintenta si cambio).
async function completeCorrectly() {
    let res;
    for (let i = 0; i < 5; i += 1) {
        const body = await getToday();
        const [[row]] = await fx.pool.query('SELECT correct_answer AS a FROM questions WHERE id = ?', [body.question.id]);
        res = await fx.http(ctx.baseUrl, student.token, 'POST', '/daily-challenge/complete', { answer: row.a });
        // 200 con correct:false = la pregunta asignada cambio entre el GET y el POST: reintentar.
        if (res.status !== 200) return res;
    }
    return res;
}

test('GET /daily-challenge: a las 22:00 de Panama (03:00Z) el dia sigue siendo el 4; a las 00:00 (05:00Z) pasa al 5', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    clock.setNow('2026-11-05T03:00:00Z');
    assert.equal((await getToday()).date, '2026-11-04');
    clock.setNow('2026-11-05T04:59:59Z');
    assert.equal((await getToday()).date, '2026-11-04');
    clock.setNow('2026-11-05T05:00:00Z');
    assert.equal((await getToday()).date, '2026-11-05');
});

test('completar a las 22:00 de Panama bloquea a las 23:30 y se libera a las 00:30 de Panama', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');

    clock.setNow('2026-11-05T03:00:00Z'); // 22:00 del 4 en Panama
    const first = await completeCorrectly();
    assert.equal(first.status, 201);
    assert.equal((await first.json()).completedOn, '2026-11-04');

    clock.setNow('2026-11-05T04:30:00Z'); // 23:30 del 4 en Panama (ya es 5 en UTC)
    assert.equal((await getToday()).completed, true);
    const second = await completeCorrectly();
    assert.equal(second.status, 409);

    clock.setNow('2026-11-05T05:30:00Z'); // 00:30 del 5 en Panama
    assert.equal((await getToday()).completed, false);
    const third = await completeCorrectly();
    assert.equal(third.status, 201);
    assert.equal((await third.json()).completedOn, '2026-11-05');

    const [rows] = await fx.pool.query(
        "SELECT DATE_FORMAT(completed_on, '%Y-%m-%d') AS d FROM daily_completions WHERE student_id = ? ORDER BY completed_on",
        [student.id]
    );
    assert.deepEqual(rows.map((r) => r.d), ['2026-11-04', '2026-11-05']);
});

test('quitar un reto: el guard "completado hoy" usa el dia de Panama', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const [q] = await fx.pool.query(
        "INSERT INTO questions (activity_id, topic, prompt, options, correct_answer) VALUES (?, 'x', 'p', ?, ?)",
        [activityId, JSON.stringify(['a', 'b']), JSON.stringify('a')]
    );
    const [c] = await fx.pool.query('INSERT INTO daily_challenges (question_id, position) VALUES (?, 9997)', [q.insertId]);
    await fx.pool.query(
        "INSERT INTO daily_completions (student_id, challenge_id, completed_on) VALUES (?, ?, '2026-11-04')",
        [other.id, c.insertId]
    );
    const del = () => fx.http(ctx.baseUrl, gm.token, 'DELETE', `/staff/game/daily-challenges/${c.insertId}`);

    clock.setNow('2026-11-05T04:30:00Z'); // 23:30 del 4 en Panama: "hoy" es el 4
    const blocked = await del();
    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json()).code, 'CHALLENGE_COMPLETED_TODAY');

    clock.setNow('2026-11-05T05:30:00Z'); // ya es el 5 en Panama
    assert.equal((await del()).status, 200);
});
