// B8: un login fallido deja la misma fila de auditoria exista o no la cuenta (mismo trabajo,
// sin diferencia que permita enumerar usuarios). Usa MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');
const { getAuditPool } = require('../src/config/auditDb');

let ctx; let teacher;
test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    teacher = await fx.createTeacher();
});
test.after(async () => { await fx.stop(ctx.server); });

const failedLogin = (username) =>
    fx.http(ctx.baseUrl, null, 'POST', '/auth/login', { username, password: 'ClaveIncorrecta99' });
const auditRows = async (username) => (await getAuditPool().query(
    "SELECT actor_type, action, outcome, target FROM audit_log WHERE action = 'user.login' AND target = ?", [username]
))[0];

test('login fallido: cuenta existente y cuenta inexistente auditan igual', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const ghost = `fx.fantasma.${fx.suffix}`;
    assert.equal((await failedLogin(ghost)).status, 401);
    assert.equal((await failedLogin(teacher.username)).status, 401);

    const ghostRows = await auditRows(ghost);
    const realRows = await auditRows(teacher.username);
    assert.equal(ghostRows.length, 1, 'el usuario inexistente tambien debe dejar fila');
    assert.equal(realRows.length, 1);
    assert.equal(ghostRows[0].outcome, 'denied');
    assert.equal(ghostRows[0].action, realRows[0].action);
    assert.equal(ghostRows[0].outcome, realRows[0].outcome);
});

test('la respuesta es identica para cuenta existente e inexistente', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const a = await failedLogin(`fx.nadie.${fx.suffix}`);
    const b = await failedLogin(teacher.username);
    assert.equal(a.status, b.status);
    assert.deepEqual(await a.json(), await b.json());
});
