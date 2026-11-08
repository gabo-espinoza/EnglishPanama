// D-005: el registro y los cambios de contrasena aceptaban 4 caracteres. El minimo es 8.
// Usa MySQL real (el registro necesita un docente con codigo de clase).
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const fx = require('./helpers/fixtures');

let ctx; let teacher; let teacherRow;
const registered = [];
test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    teacher = await fx.createTeacher();
    [[teacherRow]] = await fx.pool.query('SELECT class_code FROM teachers WHERE user_id = ?', [teacher.id]);
});
test.after(async () => {
    if (ctx.ready) fx.created.users.push(...registered);
    await fx.stop(ctx.server);
});

const register = (username, password) =>
    fx.http(ctx.baseUrl, null, 'POST', '/auth/register/student', { username, password, classCode: teacherRow.class_code });

test('registro: contrasenas de menos de 8 caracteres dan 400 y no crean la cuenta', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    for (const password of ['1234', 'abcdefg', 'siete77']) {
        const username = `fx.pw.${fx.suffix}.${password.length}`;
        const res = await register(username, password);
        assert.equal(res.status, 400, password);
        assert.match((await res.json()).error, /al menos 8 caracteres/);
        const [rows] = await fx.pool.query('SELECT id FROM users WHERE username = ?', [username]);
        assert.equal(rows.length, 0);
    }
});

test('registro: 8 caracteres exactos es valido', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const username = `fx.pw.${fx.suffix}.ok`;
    const res = await register(username, 'ocho-8ch');
    assert.equal(res.status, 201);
    const [[u]] = await fx.pool.query('SELECT id FROM users WHERE username = ?', [username]);
    registered.push(u.id);
});

test('change-password: la contrasena nueva de 4 a 7 caracteres da 400 y la clave no cambia', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const student = await fx.createStudent(teacher.id);
    const res = await fx.http(ctx.baseUrl, student.token, 'POST', '/auth/change-password',
        { currentPassword: 'PruebaFixture123', newPassword: '1234567' });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /al menos 8 caracteres/);
    const [[row]] = await fx.pool.query('SELECT password_hash FROM users WHERE id = ?', [student.id]);
    assert.equal(await bcrypt.compare('PruebaFixture123', row.password_hash), true);
});

test('set-initial-password: la contrasena nueva de menos de 8 caracteres da 400', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const student = await fx.createStudent(teacher.id);
    await fx.pool.query('UPDATE users SET must_change_password = 1 WHERE id = ?', [student.id]);
    const login = await fx.http(ctx.baseUrl, null, 'POST', '/auth/login',
        { username: student.username, password: 'PruebaFixture123' });
    const { passwordToken } = await login.json();
    assert.ok(passwordToken, 'el login debe pedir el cambio de contrasena');
    const res = await fx.http(ctx.baseUrl, passwordToken, 'POST', '/auth/set-initial-password',
        { newPassword: 'corta12', confirmPassword: 'corta12' });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /al menos 8 caracteres/);
});

test('el login con una contrasena corta sigue respondiendo 401 (no se aplica el minimo)', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const res = await fx.http(ctx.baseUrl, null, 'POST', '/auth/login', { username: `fx.nadie.${fx.suffix}`, password: '1234' });
    assert.equal(res.status, 401);
});
