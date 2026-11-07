// Alias solo para soporte y un reporte abierto por persona y pregunta (atomico). MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');
const reports = require('../src/services/reports.service');

let ctx; let teacher; let student; let activityId; let q1; let q2;
const staff = {};

test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    for (const role of ['support', 'moderator', 'content_manager']) staff[role] = await fx.createStaff(role);
    teacher = await fx.createTeacher();
    student = await fx.createStudent(teacher.id);
    // Solo se puede reportar una actividad publicada. Sin preguntas propias salvo las de esta prueba.
    activityId = await fx.createActivity({ status: 'published' });
    const ins = async (n) => (await fx.pool.query(
        'INSERT INTO questions (activity_id, topic, prompt, options, correct_answer) VALUES (?, ?, ?, ?, ?)',
        [activityId, 't', `p${n}`, JSON.stringify(['a', 'b']), JSON.stringify('a')]
    ))[0].insertId;
    q1 = await ins(1);
    q2 = await ins(2);
});
test.after(async () => {
    if (ctx.ready) {
        await fx.pool.query('DELETE FROM content_reports WHERE activity_id = ?', [activityId]);
        await fx.pool.query('DELETE FROM questions WHERE activity_id = ?', [activityId]);
    }
    await fx.stop(ctx.server);
});

const count = async () => (await fx.pool.query(
    'SELECT COUNT(*) AS n FROM content_reports WHERE reporter_id = ?', [student.id]
))[0][0].n;
const create = (over = {}) => reports.createReport({
    userId: student.id, role: 'student', kind: 'error', activityId, questionId: q1, note: null, ...over
});

test('alias del reportante: solo support lo recibe', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const insert = async (kind, status) => (await fx.pool.query(
        'INSERT INTO content_reports (kind, activity_id, reporter_id, reporter_role, status) VALUES (?, ?, ?, ?, ?)',
        [kind, activityId, student.id, 'student', status]
    ))[0].insertId;
    const errId = await insert('error', 'escalated');
    const inapId = await insert('inappropriate', 'open');
    const find = async (who, id) => {
        const res = await fx.http(ctx.baseUrl, staff[who].token, 'GET', '/staff/reports');
        assert.equal(res.status, 200);
        return (await res.json()).find((x) => x.id === id);
    };
    assert.equal((await find('support', errId)).reporterAlias, student.username);
    const manager = await find('content_manager', errId);
    assert.ok(manager);
    assert.ok(!('reporterAlias' in manager));
    const moderator = await find('moderator', inapId);
    assert.ok(moderator);
    assert.ok(!('reporterAlias' in moderator));
    await fx.pool.query('DELETE FROM content_reports WHERE reporter_id = ?', [student.id]);
});

test('8 reportes simultaneos del mismo objetivo: solo se crea uno', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => create()));
    const ok = results.filter((r) => r.status === 'fulfilled');
    const dup = results.filter((r) => r.status === 'rejected');
    assert.equal(ok.length, 1);
    assert.equal(dup.length, 7);
    for (const d of dup) {
        assert.equal(d.reason.status, 409);
        assert.equal(d.reason.apiCode, 'ALREADY_REPORTED');
    }
    assert.equal(await count(), 1);
    await fx.pool.query('DELETE FROM content_reports WHERE reporter_id = ?', [student.id]);
});

test('por HTTP: 5 simultaneos (el limite por cuenta es 5 por hora) dan un exito y cuatro 409', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const s = await fx.createStudent(teacher.id);
    const body = { kind: 'error', activityId, questionId: q2 };
    const res = await Promise.all(Array.from({ length: 5 }, () => fx.http(ctx.baseUrl, s.token, 'POST', '/reports', body)));
    assert.deepEqual(res.map((r) => r.status).sort(), [200, 409, 409, 409, 409]);
    const [rows] = await fx.pool.query('SELECT COUNT(*) AS n FROM content_reports WHERE reporter_id = ?', [s.id]);
    assert.equal(rows[0].n, 1);
});

test('otra pregunta, otro tipo o sin pregunta se permiten; tras cerrar se permite de nuevo', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const first = await create({ questionId: q2 });
    await create({ questionId: q2, kind: 'inappropriate' });
    await create({ questionId: null });
    await assert.rejects(create({ questionId: null }), { apiCode: 'ALREADY_REPORTED' });
    await assert.rejects(create({ questionId: q2 }), { apiCode: 'ALREADY_REPORTED' });
    await fx.pool.query("UPDATE content_reports SET status = 'dismissed' WHERE id = ?", [first.id]);
    const again = await create({ questionId: q2 });
    assert.notEqual(again.id, first.id);
    await fx.pool.query("UPDATE content_reports SET status = 'resolved' WHERE id = ?", [again.id]);
    await create({ questionId: q2 });
});
