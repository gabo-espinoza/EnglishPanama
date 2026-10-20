// Grado de la clase: el estudiante solo ve y juega actividades del nivel de su clase.
//
// Bootstrap reutilizable (las tareas siguientes amplian este archivo): siembra docentes con y
// sin grado, un estudiante por docente, un modulo y una actividad con preguntas por nivel.
// Los tokens se firman directo con JWT_SECRET. Se omite solo si no hay MySQL o JWT_SECRET.
const test = require('node:test');
const assert = require('node:assert');
// El limiter lee su limite al cargar su modulo: debe fijarse antes de requerir la app.
process.env.AUTH_RATE_LIMIT_MAX ??= '200';
const jwt = require('jsonwebtoken');

require('dotenv').config();

const app = require('../src/app');
const pool = require('../src/config/db');
const { closeAuditPool } = require('../src/config/auditDb');

let server;
let baseUrl;
let ready = false;

const suffix = String(Date.now()).slice(-7);
const created = { users: [], activities: [], moduleId: null, moduleCreated: false };

// Se rellenan en test.before.
let teacherA; // grado 3 -> A1.1
let teacherB; // grado 4 -> A1.2
let teacherC; // sin grado
let studentA;
let studentB;
let studentC;
let actA1; // { id, questionIds } nivel A1.1
let actA2; // nivel A1.2

function token(userId, role) {
    return jwt.sign({ id: userId, role, tv: 0, typ: 'user' }, process.env.JWT_SECRET, {
        expiresIn: '2h'
    });
}

function get(path, tok) {
    return fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${tok}` } });
}

function post(path, tok, body) {
    return fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

async function makeUser(role, username) {
    const [r] = await pool.query(
        'INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)',
        [role, username, 'x']
    );
    created.users.push(r.insertId);
    return r.insertId;
}

// Docente con grado (o sin grado si grade es null) y su codigo de clase.
async function makeTeacher(name, code, grade) {
    const id = await makeUser('teacher', `cg.t.${name}.${suffix}`);
    await pool.query(
        'INSERT INTO teachers (user_id, display_name, class_code, grade, grade_locked_at) ' +
        'VALUES (?, ?, ?, ?, ?)',
        [id, `Docente ${name}`, `${code}${suffix}`, grade, grade === null ? null : new Date()]
    );
    return id;
}

async function makeStudent(name, teacherId) {
    const id = await makeUser('student', `cg.s.${name}.${suffix}`);
    await pool.query('INSERT INTO students (user_id, teacher_id) VALUES (?, ?)', [id, teacherId]);
    return id;
}

// Actividad de un nivel con dos preguntas (respuestas correctas 'am' e 'is').
async function makeActivity(level, { title, isExample = 0 } = {}) {
    const [act] = await pool.query(
        "INSERT INTO activities (module_id, title, game_type, sort_order, level, is_example) " +
        "VALUES (?, ?, 'multiple_choice', 0, ?, ?)",
        [created.moduleId, title || `Actividad ${level} ${suffix}`, level, isExample]
    );
    created.activities.push(act.insertId);
    const questionIds = [];
    for (const [prompt, answer] of [['I ___ a student.', 'am'], ['She ___ happy.', 'is']]) {
        const [q] = await pool.query(
            'INSERT INTO questions (activity_id, topic, prompt, options, correct_answer) VALUES (?, ?, ?, ?, ?)',
            [act.insertId, 'grado', prompt, JSON.stringify(['am', 'is', 'are']), JSON.stringify(answer)]
        );
        questionIds.push(q.insertId);
    }
    return { id: act.insertId, questionIds };
}

async function countAttempts(studentId) {
    const [rows] = await pool.query('SELECT COUNT(*) AS n FROM attempts WHERE student_id = ?', [studentId]);
    return Number(rows[0].n);
}

async function xpOf(studentId) {
    const [rows] = await pool.query('SELECT xp FROM students WHERE user_id = ?', [studentId]);
    return rows[0].xp;
}

test.before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    if (!process.env.JWT_SECRET) return;
    try { await pool.query('SELECT 1'); } catch { return; }

    teacherA = await makeTeacher('a', 'GA', 3);
    teacherB = await makeTeacher('b', 'GB', 4);
    teacherC = await makeTeacher('c', 'GC', null);
    studentA = await makeStudent('a', teacherA);
    studentB = await makeStudent('b', teacherB);
    studentC = await makeStudent('c', teacherC);

    const [mods] = await pool.query("SELECT id FROM modules WHERE slug = 'vocabulary'");
    if (mods.length === 0) {
        const [m] = await pool.query("INSERT INTO modules (slug, name) VALUES ('vocabulary', 'Vocabulary')");
        created.moduleId = m.insertId;
        created.moduleCreated = true;
    } else {
        created.moduleId = mods[0].id;
    }

    actA1 = await makeActivity('A1.1', { title: `Actividad A1.1 ${suffix}`, isExample: 1 });
    actA2 = await makeActivity('A1.2', { title: `Actividad A1.2 ${suffix}` });

    ready = true;
});

test.after(async () => {
    if (ready) {
        // Las preguntas e intentos se borran en cascada con la actividad.
        if (created.activities.length) {
            await pool.query('DELETE FROM activities WHERE id IN (?)', [created.activities]);
        }
        if (created.moduleCreated) await pool.query('DELETE FROM modules WHERE id = ?', [created.moduleId]);
        await pool.query('DELETE FROM students WHERE user_id IN (?)', [created.users]);
        await pool.query('DELETE FROM teachers WHERE user_id IN (?)', [created.users]);
        await pool.query('DELETE FROM users WHERE id IN (?)', [created.users]);
    }
    server.close();
    try { await pool.end(); } catch { /* sin conexiones */ }
    try { await closeAuditPool(); } catch { /* sin conexiones */ }
});

test('el listado devuelve solo actividades del nivel de la clase', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const resA = await get('/activities/vocabulary', token(studentA, 'student'));
    assert.strictEqual(resA.status, 200);
    const idsA = (await resA.json()).map((a) => a.id);
    assert.ok(idsA.includes(actA1.id), 'grado 3 ve la actividad A1.1');
    assert.ok(!idsA.includes(actA2.id), 'grado 3 no ve la actividad A1.2');

    const idsB = (await (await get('/activities/vocabulary', token(studentB, 'student'))).json()).map((a) => a.id);
    assert.ok(idsB.includes(actA2.id), 'grado 4 ve la actividad A1.2');
    assert.ok(!idsB.includes(actA1.id), 'grado 4 no ve la actividad A1.1');
});

test('un estudiante de una clase sin grado recibe una lista vacia', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const res = await get('/activities/vocabulary', token(studentC, 'student'));
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), []);
});

test('las preguntas de una actividad de otro nivel dan 404', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const res = await get(`/activities/${actA2.id}/questions`, token(studentA, 'student'));
    assert.strictEqual(res.status, 404);
    assert.strictEqual((await res.json()).error, 'La actividad no existe.');
});

test('un intento sobre una actividad de otro nivel da 404 y no crea intento ni suma XP', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const intentosAntes = await countAttempts(studentA);
    const xpAntes = await xpOf(studentA);

    const res = await post(`/activities/${actA2.id}/attempts`, token(studentA, 'student'), {
        answers: [{ questionId: actA2.questionIds[0], answer: 'am' }]
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual((await res.json()).error, 'La actividad no existe.');
    assert.strictEqual(await countAttempts(studentA), intentosAntes, 'no se crea ningun intento');
    assert.strictEqual(await xpOf(studentA), xpAntes, 'no se suma XP');
});

test('un estudiante de una clase sin grado no puede pedir preguntas ni crear intentos (404)', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const intentosAntes = await countAttempts(studentC);
    const xpAntes = await xpOf(studentC);

    for (const act of [actA1, actA2]) {
        const q = await get(`/activities/${act.id}/questions`, token(studentC, 'student'));
        assert.strictEqual(q.status, 404);
        const a = await post(`/activities/${act.id}/attempts`, token(studentC, 'student'), {
            answers: [{ questionId: act.questionIds[0], answer: 'am' }]
        });
        assert.strictEqual(a.status, 404);
    }
    assert.strictEqual(await countAttempts(studentC), intentosAntes);
    assert.strictEqual(await xpOf(studentC), xpAntes);
});

test('el estudiante del nivel correcto sigue pudiendo jugar (200 y 201)', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const q = await get(`/activities/${actA1.id}/questions`, token(studentA, 'student'));
    assert.strictEqual(q.status, 200);
    assert.strictEqual((await q.json()).questions.length, 2);

    const xpAntes = await xpOf(studentA);
    const res = await post(`/activities/${actA1.id}/attempts`, token(studentA, 'student'), {
        answers: [
            { questionId: actA1.questionIds[0], answer: 'am' },
            { questionId: actA1.questionIds[1], answer: 'is' }
        ]
    });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.score, 2);
    assert.strictEqual((await xpOf(studentA)) - xpAntes, body.xpEarned);
});

test('isExample refleja la columna', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const extra = await makeActivity('A1.1', { title: `Actividad oficial ${suffix}`, isExample: 0 });
    const list = await (await get('/activities/vocabulary', token(studentA, 'student'))).json();
    const ejemplo = list.find((a) => a.id === actA1.id);
    const oficial = list.find((a) => a.id === extra.id);
    assert.strictEqual(ejemplo.isExample, true);
    assert.strictEqual(oficial.isExample, false);
    assert.deepStrictEqual(Object.keys(ejemplo).sort(), ['gameType', 'id', 'isExample', 'sortOrder', 'title']);
});
