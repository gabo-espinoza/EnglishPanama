// B7: mfa/setup y mfa/confirm de plataforma aplican el bloqueo 3 intentos / 10 s igual que el
// login, y consumen el contador TOTP (anti-replay). Usa MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');
const totp = require('../src/utils/totp');
const mfaCrypto = require('../src/utils/mfaCrypto');

let ctx;
test.before(async () => { ctx = await fx.start(); });
test.after(async () => { await fx.stop(ctx.server); });

const wrong = (secret) => String((Number(totp.generateToken(secret)) + 1) % 1000000).padStart(6, '0');
const setup = (t, code) => fx.http(ctx.baseUrl, t.token, 'POST', '/auth/mfa/setup', code === undefined ? {} : { totp: code });
const confirm = (t, code) => fx.http(ctx.baseUrl, t.token, 'POST', '/auth/mfa/confirm', { totp: code });
const row = async (id) => (await fx.pool.query(
    'SELECT mfa_secret_enc, mfa_pending_enc, mfa_last_counter, failed_attempts, (locked_until > NOW()) AS is_locked FROM users WHERE id = ?', [id]
))[0][0];

// Docente sin MFA con una vinculacion pendiente (el secreto pendiente se conoce).
async function teacherWithPending() {
    const teacher = await fx.createTeacher();
    const secret = totp.generateSecret();
    await fx.pool.query(
        'UPDATE users SET mfa_pending_enc = ?, mfa_pending_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?',
        [mfaCrypto.encrypt(secret), teacher.id]
    );
    return { ...teacher, pendingSecret: secret };
}

test('confirm: tras 3 codigos malos la cuenta queda bloqueada aunque el siguiente sea correcto', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const teacher = await teacherWithPending();
    for (let i = 0; i < 3; i += 1) {
        assert.equal((await confirm(teacher, wrong(teacher.pendingSecret))).status, 401);
    }
    assert.equal((await row(teacher.id)).is_locked, 1);
    const res = await confirm(teacher, totp.generateToken(teacher.pendingSecret));
    assert.equal(res.status, 401);
    assert.equal((await row(teacher.id)).mfa_secret_enc, null, 'el MFA no debe activarse bloqueado');

    // Control: al vencer el bloqueo, el codigo correcto activa el MFA.
    await fx.pool.query('UPDATE users SET locked_until = NULL WHERE id = ?', [teacher.id]);
    assert.equal((await confirm(teacher, totp.generateToken(teacher.pendingSecret))).status, 200);
});

test('setup con MFA activo: tras 3 codigos malos queda bloqueado aunque el siguiente sea correcto', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const secret = totp.generateSecret();
    const teacher = await fx.createTeacher({ mfaSecret: secret });
    for (let i = 0; i < 3; i += 1) assert.equal((await setup(teacher, wrong(secret))).status, 401);
    const res = await setup(teacher, totp.generateToken(secret));
    assert.equal(res.status, 401);
    assert.equal((await row(teacher.id)).mfa_pending_enc, null, 'no debe generarse un secreto pendiente');

    await fx.pool.query('UPDATE users SET locked_until = NULL WHERE id = ?', [teacher.id]);
    assert.equal((await setup(teacher, totp.generateToken(secret))).status, 200);
});

test('setup: un codigo ya usado no sirve para reemplazar el autenticador (anti-replay)', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const secret = totp.generateSecret();
    const teacher = await fx.createTeacher({ mfaSecret: secret });
    const code = totp.generateToken(secret);
    assert.equal((await setup(teacher, code)).status, 200);
    assert.ok((await row(teacher.id)).mfa_last_counter !== null, 'el contador debe quedar consumido');
    const again = await setup(teacher, code);
    assert.equal(again.status, 401, 'el mismo codigo no puede usarse dos veces');
});

test('confirm: un codigo ya usado no confirma la vinculacion (anti-replay)', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const teacher = await teacherWithPending();
    const code = totp.generateToken(teacher.pendingSecret);
    // Un codigo de ese mismo intervalo ya fue consumido por esta cuenta.
    await fx.pool.query('UPDATE users SET mfa_last_counter = ? WHERE id = ?',
        [totp.matchCounter(teacher.pendingSecret, code), teacher.id]);
    const res = await confirm(teacher, code);
    assert.equal(res.status, 401);
    assert.equal((await row(teacher.id)).mfa_secret_enc, null);
});

test('confirm correcto consume el contador de la cuenta', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const teacher = await teacherWithPending();
    const code = totp.generateToken(teacher.pendingSecret);
    assert.equal((await confirm(teacher, code)).status, 200);
    assert.equal(Number((await row(teacher.id)).mfa_last_counter), totp.matchCounter(teacher.pendingSecret, code));
});
