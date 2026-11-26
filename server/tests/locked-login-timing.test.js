// Una cuenta bloqueada no debe distinguirse por tiempo de una contrasena incorrecta: el login de
// la plataforma y el de gestion hacen la comparacion bcrypt (contra el hash de relleno) tambien
// en el camino de cuenta bloqueada, antes de responder con el mismo error generico.
// No se mide el tiempo (seria fragil): se cuenta cuantas veces se llama a bcrypt.compare
// reemplazando la funcion del modulo compartido durante la prueba. Usa MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const fx = require('./helpers/fixtures');
const authService = require('../src/services/auth.service');
const staffAuth = require('../src/services/staffAuth.service');

let ctx;
test.before(async () => { ctx = await fx.start(); });
test.after(async () => { await fx.stop(ctx.server); });

// Ejecuta fn contando las llamadas a bcrypt.compare; siempre restaura la funcion original.
async function countCompares(fn) {
    const original = bcrypt.compare;
    let calls = 0;
    bcrypt.compare = function countedCompare(...args) {
        calls += 1;
        return original.apply(this, args);
    };
    let error = null;
    try {
        await fn();
    } catch (err) {
        error = err;
    } finally {
        bcrypt.compare = original;
    }
    return { calls, error };
}

test('plataforma: la cuenta bloqueada hace la comparacion bcrypt y responde el error generico', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const teacher = await fx.createTeacher();
    await fx.pool.query('UPDATE users SET locked_until = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?', [teacher.id]);

    const locked = await countCompares(() => authService.login({ username: teacher.username, password: 'ClaveIncorrecta99' }));
    assert.ok(locked.error, 'el login bloqueado debe fallar');
    assert.equal(locked.error.status, 401);
    assert.equal(locked.error.message, 'Usuario o contrasena incorrectos.');
    assert.ok(locked.calls >= 1, 'el camino de cuenta bloqueada debe llamar a bcrypt.compare');

    // Mismo mensaje y misma cantidad de comparaciones que una contrasena incorrecta.
    await fx.pool.query('UPDATE users SET locked_until = NULL, failed_attempts = 0 WHERE id = ?', [teacher.id]);
    const wrong = await countCompares(() => authService.login({ username: teacher.username, password: 'ClaveIncorrecta99' }));
    assert.equal(wrong.error.status, 401);
    assert.equal(wrong.error.message, locked.error.message);
    assert.equal(locked.calls, wrong.calls);
});

test('gestion: la cuenta bloqueada hace la comparacion bcrypt y responde el error generico', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const staff = await fx.createStaff('support');
    await fx.pool.query('UPDATE staff_accounts SET locked_until = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?', [staff.id]);

    const locked = await countCompares(() => staffAuth.login({ username: staff.username, password: 'ClaveIncorrecta99', totp: '000000', ip: '127.0.0.1' }));
    assert.ok(locked.error, 'el login bloqueado debe fallar');
    assert.ok(locked.calls >= 1, 'el camino de cuenta bloqueada debe llamar a bcrypt.compare');

    await fx.pool.query('UPDATE staff_accounts SET locked_until = NULL, failed_attempts = 0 WHERE id = ?', [staff.id]);
    const wrong = await countCompares(() => staffAuth.login({ username: staff.username, password: 'ClaveIncorrecta99', totp: '000000', ip: '127.0.0.1' }));
    assert.equal(wrong.error.status, locked.error.status);
    assert.equal(wrong.error.message, locked.error.message);
    assert.equal(locked.calls, wrong.calls);
});

test('gestion: la cuenta suspendida tambien hace la comparacion bcrypt', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const staff = await fx.createStaff('support');
    await fx.pool.query("UPDATE staff_accounts SET status = 'suspended' WHERE id = ?", [staff.id]);
    const suspended = await countCompares(() => staffAuth.login({ username: staff.username, password: 'ClaveIncorrecta99', totp: '000000', ip: '127.0.0.1' }));
    assert.ok(suspended.error);
    assert.ok(suspended.calls >= 1);
});
