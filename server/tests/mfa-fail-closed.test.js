// B6: el anti-replay del TOTP falla CERRADO. Si el UPDATE del contador da error, el login
// con MFA no acepta el codigo (plataforma y personal). Usa MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');
const totp = require('../src/utils/totp');

let ctx; let teacher; let staff;
const PASSWORD = 'PruebaFixture123';

test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    teacher = await fx.createTeacher({ mfaSecret: totp.generateSecret() });
    staff = await fx.createStaff('auditor');
});
test.after(async () => { await fx.stop(ctx.server); });

// Hace fallar solo el UPDATE del contador anti-replay (como una columna ausente).
function breakCounterUpdate() {
    const real = fx.pool.query.bind(fx.pool);
    fx.pool.query = (sql, params) => {
        if (/SET mfa_last_counter/.test(sql)) {
            const err = new Error("Unknown column 'mfa_last_counter' in 'field list'");
            err.code = 'ER_BAD_FIELD_ERROR';
            return Promise.reject(err);
        }
        return real(sql, params);
    };
    return () => { fx.pool.query = real; };
}

test('plataforma: si falla el UPDATE del contador, /auth/login/mfa no entrega sesion', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const first = await (await fx.http(ctx.baseUrl, null, 'POST', '/auth/login',
        { username: teacher.username, password: PASSWORD })).json();
    assert.ok(first.mfaToken);
    const code = totp.generateToken(teacher.secret);

    const restore = breakCounterUpdate();
    let res; let body;
    try {
        res = await fx.http(ctx.baseUrl, null, 'POST', '/auth/login/mfa', { mfaToken: first.mfaToken, totp: code });
        body = await res.json();
    } finally { restore(); }
    assert.ok(res.status >= 400, `debio rechazar, respondio ${res.status}`);
    assert.equal(body.token, undefined);

    // Control: sin el fallo, el mismo codigo (que no se consumio) si entra.
    const ok = await fx.http(ctx.baseUrl, null, 'POST', '/auth/login/mfa', { mfaToken: first.mfaToken, totp: code });
    assert.equal(ok.status, 200);
});

test('personal: si falla el UPDATE del contador, /staff/auth/login no entrega sesion', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const code = totp.generateToken(staff.secret);
    const restore = breakCounterUpdate();
    let res; let body;
    try {
        res = await fx.http(ctx.baseUrl, null, 'POST', '/staff/auth/login',
            { username: staff.username, password: PASSWORD, totp: code });
        body = await res.json();
    } finally { restore(); }
    assert.ok(res.status >= 400, `debio rechazar, respondio ${res.status}`);
    assert.equal(body.token, undefined);

    const ok = await fx.http(ctx.baseUrl, null, 'POST', '/staff/auth/login',
        { username: staff.username, password: PASSWORD, totp: code });
    assert.equal(ok.status, 200);
});
