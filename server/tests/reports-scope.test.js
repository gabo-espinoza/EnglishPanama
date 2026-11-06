// B2: PATCH /api/staff/reports/:id solo actua sobre la bandeja del rol. Usa MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');

let ctx;
const staff = {};
let teacher; let student; let activityId;

test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    for (const role of ['support', 'moderator', 'content_manager']) staff[role] = await fx.createStaff(role);
    teacher = await fx.createTeacher();
    student = await fx.createStudent(teacher.id);
    activityId = await fx.createActivity();
});

test.after(async () => {
    if (ctx.ready) await fx.pool.query('DELETE FROM content_reports WHERE reporter_id = ?', [student.id]);
    await fx.stop(ctx.server);
});

async function newReport(kind, status = 'open') {
    const [res] = await fx.pool.query(
        `INSERT INTO content_reports (kind, activity_id, reporter_id, reporter_role, status)
         VALUES (?, ?, ?, 'student', ?)`, [kind, activityId, student.id, status]
    );
    return res.insertId;
}
const decide = (who, id, decision) =>
    fx.http(ctx.baseUrl, staff[who].token, 'PATCH', `/staff/reports/${id}`, { decision });
const statusOf = async (id) =>
    (await fx.pool.query('SELECT status FROM content_reports WHERE id = ?', [id]))[0][0].status;

test('support no puede decidir reportes de moderacion (inappropriate)', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const id = await newReport('inappropriate');
    for (const d of ['dismiss', 'resolve', 'escalate']) {
        const res = await decide('support', id, d);
        assert.equal(res.status, 404, d);
    }
    assert.equal(await statusOf(id), 'open');
});

test('moderator no puede decidir reportes de error', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const id = await newReport('error');
    assert.equal((await decide('moderator', id, 'dismiss')).status, 404);
    assert.equal(await statusOf(id), 'open');
});

test('content_manager solo decide reportes escalados', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const open = await newReport('error', 'open');
    assert.equal((await decide('content_manager', open, 'resolve')).status, 404);
    assert.equal(await statusOf(open), 'open');

    const escalated = await newReport('error', 'escalated');
    const ok = await decide('content_manager', escalated, 'resolve');
    assert.equal(ok.status, 200);
    assert.equal(await statusOf(escalated), 'resolved');
});

test('support y moderator no tocan un reporte ya escalado; los propios abiertos si', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const esc = await newReport('error', 'escalated');
    const res = await decide('support', esc, 'dismiss');
    assert.equal(res.status, 409);
    assert.equal(await statusOf(esc), 'escalated');

    const own = await newReport('error');
    assert.equal((await decide('support', own, 'escalate')).status, 200);
    assert.equal(await statusOf(own), 'escalated');
    const mine = await newReport('inappropriate');
    assert.equal((await decide('moderator', mine, 'dismiss')).status, 200);
    assert.equal(await statusOf(mine), 'dismissed');
});

test('un reporte inexistente responde 404 igual que uno fuera de la bandeja', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    assert.equal((await decide('support', 999999999, 'dismiss')).status, 404);
});
