// B3: el limite de reportes se cuenta por cuenta, no por IP. Usa MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');

let ctx; let teacher; let a; let b;

test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    teacher = await fx.createTeacher();
    a = await fx.createStudent(teacher.id);
    b = await fx.createStudent(teacher.id);
});
test.after(async () => { await fx.stop(ctx.server); });

// kind invalido: responde 400 sin escribir nada, pero el limitador cuenta la peticion.
const report = (token) => fx.http(ctx.baseUrl, token, 'POST', '/reports', { kind: 'nope', activityId: 1 });

test('agotar la cuota de un estudiante no bloquea a otro de la misma IP', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    for (let i = 0; i < 5; i += 1) assert.equal((await report(a.token)).status, 400);
    assert.equal((await report(a.token)).status, 429, 'la sexta peticion de A debe limitarse');
    assert.equal((await report(b.token)).status, 400, 'B comparte IP pero tiene su propia cuota');
});

test('las peticiones sin sesion responden 401 y no gastan ninguna cuota', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const c = await fx.createStudent(teacher.id);
    for (let i = 0; i < 8; i += 1) assert.equal((await report(null)).status, 401);
    assert.equal((await report(c.token)).status, 400, 'la cuota de C sigue intacta');
});
