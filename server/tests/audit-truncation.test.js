// D-004: record() perdia en silencio las filas cuyo target (VARCHAR(100)) o username
// superaba la columna. Un acceso denegado con una URL larga no dejaba rastro. Usa MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');
const audit = require('../src/services/audit.service');
const { getAuditPool } = require('../src/config/auditDb');

let ctx; let access; let auditor;
test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    access = await fx.createStaff('access_manager');
    auditor = await fx.createStaff('auditor');
});
test.after(async () => { await fx.stop(ctx.server); });

test('un acceso denegado con URL de mas de 100 caracteres deja fila con target recortado', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const longQuery = 'x'.repeat(150);
    const res = await fx.http(ctx.baseUrl, access.token, 'GET', `/staff/audit?x=${longQuery}`);
    assert.equal(res.status, 403);

    const [rows] = await getAuditPool().query(
        "SELECT target, outcome FROM audit_log WHERE action = 'staff.access' AND actor_id = ? AND actor_type = 'staff'",
        [access.id]
    );
    assert.equal(rows.length, 1, 'la auditoria no debe perder el acceso denegado');
    assert.equal(rows[0].outcome, 'denied');
    assert.equal(rows[0].target.length, 100);
    assert.ok(rows[0].target.startsWith('/api/staff/audit?x=xxx'));
});

test('el login de gestion con usuario de 200 caracteres deja fila y responde 401', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const username = `fx.largo.${fx.suffix}.`.padEnd(200, 'u');
    const res = await fx.http(ctx.baseUrl, null, 'POST', '/staff/auth/login', { username, password: 'ClaveIncorrecta99' });
    assert.equal(res.status, 401);
    const [rows] = await getAuditPool().query(
        "SELECT target FROM audit_log WHERE action = 'staff.login' AND target = ?", [username.slice(0, 100)]
    );
    assert.equal(rows.length, 1);
});

test('la cadena sigue verificandose tras filas recortadas, con emojis y campos largos', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const hash = await audit.record({
        actorType: 'staff', actorId: auditor.id, actorRole: 'r'.repeat(80),
        action: 'a'.repeat(90), target: '\u{1F600}'.repeat(150), outcome: 'denied', ip: '9'.repeat(80)
    });
    assert.match(hash, /^[0-9a-f]{64}$/, 'record debe insertar y devolver el hash');
    const [[row]] = await getAuditPool().query(
        'SELECT actor_role, action, target, ip FROM audit_log WHERE row_hash = ?', [hash]
    );
    assert.equal(row.actor_role.length, 30);
    assert.equal(row.action.length, 60);
    assert.equal(Array.from(row.target).length, 100);
    assert.equal(row.ip.length, 45);

    assert.deepEqual((await audit.verify()).ok, true);
    const http = await fx.http(ctx.baseUrl, auditor.token, 'GET', '/staff/audit/verify');
    assert.equal((await http.json()).ok, true);
});

test('los valores cortos se guardan sin cambios', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const hash = await audit.record({
        actorType: 'staff', actorId: auditor.id, actorRole: 'auditor',
        action: 'fx.corto', target: 'staff#1:suspend', outcome: 'ok', ip: '127.0.0.1'
    });
    const [[row]] = await getAuditPool().query('SELECT target, action, ip FROM audit_log WHERE row_hash = ?', [hash]);
    assert.deepEqual({ ...row }, { target: 'staff#1:suspend', action: 'fx.corto', ip: '127.0.0.1' });
});
