// Borradores solo del autor: otro content_manager recibe 403 NOT_AUTHOR. Usa MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');

let ctx; let author; let other; let reviewer;
const Q = { topic: 'colores', prompt: 'El color del cielo', options: ['azul', 'rojo'], correctAnswer: 'azul' };

test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    author = await fx.createStaff('content_manager');
    other = await fx.createStaff('content_manager');
    reviewer = await fx.createStaff('content_reviewer');
});
test.after(async () => { await fx.stop(ctx.server); });

const call = (who, method, path, body) => fx.http(ctx.baseUrl, who.token, method, `/staff/content${path}`, body);

async function newDraft() {
    const res = await call(author, 'POST', '/activities', {
        moduleSlug: 'vocabulary', title: `Autoria ${fx.suffix}`, gameType: 'multiple_choice', level: 'A1.1'
    });
    assert.equal(res.status, 200);
    const activity = await res.json();
    fx.created.activities.push(activity.id);
    assert.equal((await call(author, 'POST', `/activities/${activity.id}/questions`, Q)).status, 200);
    return activity.id;
}

async function assertNotAuthor(res) {
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'NOT_AUTHOR');
    assert.equal(body.error, 'Solo quien creo el borrador puede modificarlo.');
}

test('otro gestor no puede editar, tocar preguntas, enviar ni borrar el borrador', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const id = await newDraft();
    const detail = await (await call(author, 'GET', `/activities/${id}`)).json();
    const qid = detail.questions[0].id;
    await assertNotAuthor(await call(other, 'PUT', `/activities/${id}`, { title: 'Ajeno' }));
    await assertNotAuthor(await call(other, 'POST', `/activities/${id}/questions`, Q));
    await assertNotAuthor(await call(other, 'PUT', `/activities/${id}/questions/${qid}`, Q));
    await assertNotAuthor(await call(other, 'DELETE', `/activities/${id}/questions/${qid}`));
    await assertNotAuthor(await call(other, 'POST', `/activities/${id}/submit`));
    await assertNotAuthor(await call(other, 'DELETE', `/activities/${id}`));
    const after = await (await call(author, 'GET', `/activities/${id}`)).json();
    assert.equal(after.title, detail.title);
    assert.equal(after.status, 'draft');
    assert.equal(after.questions.length, 1);
});

test('el autor sigue editando, enviando y retirando; otro no retira', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const id = await newDraft();
    assert.equal((await call(author, 'PUT', `/activities/${id}`, { title: 'Propio' })).status, 200);
    assert.equal((await call(author, 'POST', `/activities/${id}/submit`)).status, 200);
    await assertNotAuthor(await call(other, 'POST', `/activities/${id}/withdraw`));
    assert.equal((await call(author, 'POST', `/activities/${id}/withdraw`)).status, 200);
    assert.equal((await call(author, 'DELETE', `/activities/${id}`)).status, 200);
});

test('el estado se comprueba antes que la autoria (409 aunque no sea el autor)', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const id = await newDraft();
    assert.equal((await call(author, 'POST', `/activities/${id}/submit`)).status, 200);
    const res = await call(other, 'PUT', `/activities/${id}`, { title: 'x' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'INVALID_STATE');
});

test('una actividad sin autor (sembrada) no se edita por estas rutas', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const id = await fx.createActivity(); // borrador con author_id NULL
    await assertNotAuthor(await call(author, 'PUT', `/activities/${id}`, { title: 'x' }));
    await assertNotAuthor(await call(author, 'DELETE', `/activities/${id}`));
});

test('archivar y crear revision siguen abiertos a cualquier gestor; la revision es de quien la crea', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const id = await newDraft();
    assert.equal((await call(author, 'POST', `/activities/${id}/submit`)).status, 200);
    assert.equal((await call(reviewer, 'POST', `/activities/${id}/approve`)).status, 200);
    const rev = await call(other, 'POST', `/activities/${id}/revision`);
    assert.equal(rev.status, 200);
    const draft = await rev.json();
    fx.created.activities.push(draft.id);
    assert.equal(draft.authorId, other.id);
    assert.equal((await call(other, 'PUT', `/activities/${draft.id}`, { title: 'Mi revision' })).status, 200);
    await assertNotAuthor(await call(author, 'PUT', `/activities/${draft.id}`, { title: 'x' }));
    assert.equal((await call(other, 'POST', `/activities/${id}/archive`)).status, 200);
});

test('el revisor lee cualquier actividad (incluso un borrador ajeno)', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const id = await newDraft();
    assert.equal((await call(reviewer, 'GET', `/activities/${id}`)).status, 200);
});
