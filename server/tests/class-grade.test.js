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
const bcrypt = require('bcrypt');

require('dotenv').config();

const app = require('../src/app');
const pool = require('../src/config/db');
const { closeAuditPool } = require('../src/config/auditDb');
const totp = require('../src/utils/totp');
const mfaCrypto = require('../src/utils/mfaCrypto');
const audit = require('../src/services/audit.service');

let server;
let baseUrl;
let ready = false;

const suffix = String(Date.now()).slice(-7);
const created = { users: [], activities: [], challenges: [], staff: [], moduleId: null, moduleCreated: false };

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
let promptSeq = 0;
async function makeActivity(level, { title, isExample = 0, topic = 'grado' } = {}) {
    const [act] = await pool.query(
        "INSERT INTO activities (module_id, title, game_type, sort_order, level, is_example) " +
        "VALUES (?, ?, 'multiple_choice', 0, ?, ?)",
        [created.moduleId, title || `Actividad ${level} ${suffix}`, level, isExample]
    );
    created.activities.push(act.insertId);
    const questionIds = [];
    // Enunciados unicos por llamada: la siembra de ejemplo busca la pregunta 'I ___ a student.'
    // para su reto diario y no debe terminar ligada a una pregunta de esta prueba.
    promptSeq += 1;
    const tag = `${level} ${suffix}-${promptSeq}`;
    for (const [prompt, answer] of [[`I ___ a student (${tag}).`, 'am'], [`She ___ happy (${tag}).`, 'is']]) {
        const [q] = await pool.query(
            'INSERT INTO questions (activity_id, topic, prompt, options, correct_answer) VALUES (?, ?, ?, ?, ?)',
            [act.insertId, topic, prompt, JSON.stringify(['am', 'is', 'are']), JSON.stringify(answer)]
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
    // La limpieza depende de lo realmente sembrado, no de `ready`: un fallo parcial tambien limpia.
    try {
        if (created.users.length) {
            await pool.query('DELETE FROM daily_completions WHERE student_id IN (?)', [created.users]);
        }
        if (created.challenges.length) {
            await pool.query('DELETE FROM daily_challenges WHERE id IN (?)', [created.challenges]);
        }
        // Las preguntas e intentos se borran en cascada con la actividad.
        if (created.activities.length) {
            await pool.query('DELETE FROM activities WHERE id IN (?)', [created.activities]);
        }
        if (created.staff.length) await pool.query('DELETE FROM staff_accounts WHERE id IN (?)', [created.staff]);
        if (created.moduleCreated) await pool.query('DELETE FROM modules WHERE id = ?', [created.moduleId]);
        if (created.users.length) {
            await pool.query('DELETE FROM students WHERE user_id IN (?)', [created.users]);
            await pool.query('DELETE FROM teachers WHERE user_id IN (?)', [created.users]);
            await pool.query('DELETE FROM users WHERE id IN (?)', [created.users]);
        }
    } catch (err) {
        console.error('Fallo la limpieza de class-grade.test.js:', err.message);
    }
    server?.close();
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

test('una actividad inexistente da 404 en preguntas y en intentos', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const [rows] = await pool.query('SELECT COALESCE(MAX(id), 0) + 1000000 AS id FROM activities');
    const missing = rows[0].id;
    const q = await get(`/activities/${missing}/questions`, token(studentA, 'student'));
    assert.strictEqual(q.status, 404);
    const a = await post(`/activities/${missing}/attempts`, token(studentA, 'student'), {
        answers: [{ questionId: actA1.questionIds[0], answer: 'am' }]
    });
    assert.strictEqual(a.status, 404);
});

test('answers vacio en una actividad del mismo nivel da 400', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const intentosAntes = await countAttempts(studentA);
    const res = await post(`/activities/${actA1.id}/attempts`, token(studentA, 'student'), { answers: [] });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(await countAttempts(studentA), intentosAntes);
});

// ---- Reto diario, panel docente y perfil ----

async function seedChallenge(questionId, position) {
    const [r] = await pool.query('INSERT INTO daily_challenges (question_id, position) VALUES (?, ?)', [questionId, position]);
    created.challenges.push(r.insertId);
    return r.insertId;
}

async function levelOfQuestion(questionId) {
    const [rows] = await pool.query(
        'SELECT a.level FROM questions q JOIN activities a ON a.id = q.activity_id WHERE q.id = ?', [questionId]);
    return rows[0].level;
}

test('el reto diario solo devuelve preguntas del nivel de la clase', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    for (const [i, qid] of actA1.questionIds.entries()) await seedChallenge(qid, 900000 + i);
    for (const [i, qid] of actA2.questionIds.entries()) await seedChallenge(qid, 900010 + i);

    const resA = await get('/daily-challenge', token(studentA, 'student'));
    assert.strictEqual(resA.status, 200);
    const bodyA = await resA.json();
    assert.ok(!actA2.questionIds.includes(bodyA.question.id), 'A1.1 nunca recibe una pregunta A1.2');
    assert.strictEqual(await levelOfQuestion(bodyA.question.id), 'A1.1');

    const resB = await get('/daily-challenge', token(studentB, 'student'));
    assert.strictEqual(resB.status, 200);
    const bodyB = await resB.json();
    assert.strictEqual(await levelOfQuestion(bodyB.question.id), 'A1.2');
});

test('sin grado el reto diario responde como con el conjunto vacio (404)', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const res = await get('/daily-challenge', token(studentC, 'student'));
    assert.strictEqual(res.status, 404);
    assert.strictEqual((await res.json()).error, 'No hay retos diarios configurados.');
    const done = await post('/daily-challenge/complete', token(studentC, 'student'), {});
    assert.strictEqual(done.status, 404);
});

test('completar el reto diario usa el conjunto filtrado por nivel', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    // Se comprueban dos estudiantes de niveles distintos: si el filtro fallara, al menos uno
    // recibiria un reto de otro nivel, asi que el resultado no depende del azar.
    const extraA1 = await makeActivity('A1.1', { title: `Reto extra A1.1 ${suffix}` });
    const extraA2 = await makeActivity('A1.2', { title: `Reto extra A1.2 ${suffix}` });
    await seedChallenge(extraA1.questionIds[0], 900020);
    await seedChallenge(extraA2.questionIds[0], 900021);

    for (const [student, level] of [[studentA, 'A1.1'], [studentB, 'A1.2']]) {
        const res = await post('/daily-challenge/complete', token(student, 'student'), {});
        assert.strictEqual(res.status, 201);
        const [rows] = await pool.query(
            `SELECT a.level FROM daily_completions dc
             JOIN daily_challenges ch ON ch.id = dc.challenge_id
             JOIN questions q ON q.id = ch.question_id
             JOIN activities a ON a.id = q.activity_id
             WHERE dc.student_id = ?`, [student]);
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].level, level);
    }
    const again = await post('/daily-challenge/complete', token(studentA, 'student'), {});
    assert.strictEqual(again.status, 409);
});

test('el panel docente cuenta solo intentos y temas del nivel actual de la clase', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const panelStudent = await makeStudent('panel', teacherA);
    const own = await makeActivity('A1.1', { title: `Panel A1.1 ${suffix}`, topic: `tema-propio-${suffix}` });
    const other = await makeActivity('A1.2', { title: `Panel A1.2 ${suffix}`, topic: `tema-ajeno-${suffix}` });
    for (const act of [own, other]) {
        const [att] = await pool.query(
            'INSERT INTO attempts (student_id, activity_id, score, xp_earned) VALUES (?, ?, 1, 5)', [panelStudent, act.id]);
        await pool.query('INSERT INTO attempt_answers (attempt_id, question_id, is_correct) VALUES (?, ?, 0), (?, ?, 1)',
            [att.insertId, act.questionIds[0], att.insertId, act.questionIds[1]]);
    }

    const res = await get('/teacher/students', token(teacherA, 'teacher'));
    assert.strictEqual(res.status, 200);
    const row = (await res.json()).find((s) => s.userId === panelStudent);
    assert.strictEqual(row.completedActivities, 1, 'solo cuenta la actividad A1.1');
    assert.strictEqual(row.averages.vocabulary, 50);

    const topicsRes = await get('/teacher/difficult-topics', token(teacherA, 'teacher'));
    assert.strictEqual(topicsRes.status, 200);
    const topics = (await topicsRes.json()).map((x) => x.topic);
    assert.ok(topics.includes(`tema-propio-${suffix}`));
    assert.ok(!topics.includes(`tema-ajeno-${suffix}`));
});

test('docente sin grado: lista de estudiantes con ceros y temas vacios', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const act = await makeActivity('A1.1', { title: `Sin grado ${suffix}`, topic: `tema-sg-${suffix}` });
    const [att] = await pool.query(
        'INSERT INTO attempts (student_id, activity_id, score, xp_earned) VALUES (?, ?, 1, 5)', [studentC, act.id]);
    await pool.query('INSERT INTO attempt_answers (attempt_id, question_id, is_correct) VALUES (?, ?, 0)',
        [att.insertId, act.questionIds[0]]);

    const res = await get('/teacher/students', token(teacherC, 'teacher'));
    assert.strictEqual(res.status, 200);
    const row = (await res.json()).find((s) => s.userId === studentC);
    assert.ok(row, 'el estudiante sigue apareciendo');
    assert.strictEqual(row.completedActivities, 0);
    assert.deepStrictEqual(row.averages, { vocabulary: null, grammar: null, reading: null });

    const topics = await (await get('/teacher/difficult-topics', token(teacherC, 'teacher'))).json();
    assert.deepStrictEqual(topics, []);
});

test('/users/me trae classGrade y classLevel y conserva level numerico de XP', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const sA = await (await get('/users/me', token(studentA, 'student'))).json();
    assert.strictEqual(sA.classGrade, 3);
    assert.strictEqual(sA.classLevel, 'A1.1');
    assert.strictEqual(typeof sA.level, 'number');

    const sC = await (await get('/users/me', token(studentC, 'student'))).json();
    assert.strictEqual(sC.classGrade, null);
    assert.strictEqual(sC.classLevel, null);
    assert.strictEqual(typeof sC.level, 'number');

    const tB = await (await get('/users/me', token(teacherB, 'teacher'))).json();
    assert.strictEqual(tB.classGrade, 4);
    assert.strictEqual(tB.classLevel, 'A1.2');

    const tC = await (await get('/users/me', token(teacherC, 'teacher'))).json();
    assert.strictEqual(tC.classGrade, null);
    assert.strictEqual(tC.classLevel, null);
});

// ---- Declarar el grado (docente) ----

function put(path, tok, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (tok) headers.Authorization = `Bearer ${tok}`;
    return fetch(`${baseUrl}${path}`, { method: 'PUT', headers, body: JSON.stringify(body) });
}

async function gradeOf(teacherId) {
    const [rows] = await pool.query('SELECT grade, grade_locked_at FROM teachers WHERE user_id = ?', [teacherId]);
    return rows[0];
}

// Docente nuevo sin grado para cada prueba que lo declara.
let freshCount = 0;
async function freshTeacher(name) {
    freshCount += 1;
    return makeTeacher(`d${name}`, `F${freshCount}`, null);
}

const MSG_CONFIRM = 'Debes confirmar que entiendes que el grado no se puede cambiar.';
const MSG_GRADE = 'El grado debe ser 3, 4 o 5.';
const MSG_LOCKED = 'El grado ya fue declarado y no se puede cambiar. Si fue un error, pide ayuda al gestor de cuentas.';

test('GET /teacher/class y PUT /teacher/class/grade sin token dan 401', async () => {
    const g = await fetch(`${baseUrl}/teacher/class`);
    assert.strictEqual(g.status, 401);
    const p = await put('/teacher/class/grade', null, { grade: 3, confirm: true });
    assert.strictEqual(p.status, 401);
});

test('GET /teacher/class antes y despues de declarar', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const id = await freshTeacher('get');
    const tok = token(id, 'teacher');
    const before = await (await get('/teacher/class', tok)).json();
    assert.deepStrictEqual(before, {
        displayName: 'Docente dget',
        classCode: `F${freshCount}${suffix}`,
        classGrade: null,
        classLevel: null,
        gradeLocked: false,
        grades: [
            { grade: 3, level: 'A1.1' },
            { grade: 4, level: 'A1.2' },
            { grade: 5, level: 'A1.3' }
        ]
    });
    const res = await put('/teacher/class/grade', tok, { grade: 4, confirm: true });
    assert.strictEqual(res.status, 200);
    const after = await (await get('/teacher/class', tok)).json();
    assert.strictEqual(after.classGrade, 4);
    assert.strictEqual(after.classLevel, 'A1.2');
    assert.strictEqual(after.gradeLocked, true);
});

test('la primera declaracion funciona para los grados 3, 4 y 5', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    for (const [grade, level] of [[3, 'A1.1'], [4, 'A1.2'], [5, 'A1.3']]) {
        const id = await freshTeacher(`first${grade}`);
        const res = await put('/teacher/class/grade', token(id, 'teacher'), { grade, confirm: true });
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.strictEqual(body.classGrade, grade);
        assert.strictEqual(body.classLevel, level);
        assert.strictEqual(body.gradeLocked, true);
        assert.strictEqual((await gradeOf(id)).grade, grade);
    }
});

test('un segundo intento (otro grado o el mismo) da 409 GRADE_LOCKED y no cambia el grado', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const id = await freshTeacher('lock');
    const tok = token(id, 'teacher');
    assert.strictEqual((await put('/teacher/class/grade', tok, { grade: 4, confirm: true })).status, 200);
    for (const grade of [5, 4]) {
        const res = await put('/teacher/class/grade', tok, { grade, confirm: true });
        assert.strictEqual(res.status, 409);
        const body = await res.json();
        assert.strictEqual(body.code, 'GRADE_LOCKED');
        assert.strictEqual(body.error, MSG_LOCKED);
        assert.strictEqual((await gradeOf(id)).grade, 4);
    }
});

test('un docente con grado ya sembrado tambien recibe 409', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const res = await put('/teacher/class/grade', token(teacherA, 'teacher'), { grade: 5, confirm: true });
    assert.strictEqual(res.status, 409);
    assert.strictEqual((await gradeOf(teacherA)).grade, 3);
});

test('confirm distinto de true da 400 y no escribe nada', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const id = await freshTeacher('conf');
    const tok = token(id, 'teacher');
    for (const body of [{ grade: 3 }, { grade: 3, confirm: false }, { grade: 3, confirm: 'true' }, { grade: 3, confirm: 1 }]) {
        const res = await put('/teacher/class/grade', tok, body);
        assert.strictEqual(res.status, 400, JSON.stringify(body));
        assert.strictEqual((await res.json()).error, MSG_CONFIRM);
    }
    const row = await gradeOf(id);
    assert.strictEqual(row.grade, null);
    assert.strictEqual(row.grade_locked_at, null);
});

test('grados invalidos dan 400 y no escriben nada', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const id = await freshTeacher('inv');
    const tok = token(id, 'teacher');
    const bodies = [
        { grade: '4', confirm: true }, { grade: 4.5, confirm: true }, { grade: true, confirm: true },
        { grade: 0, confirm: true }, { grade: 6, confirm: true }, { grade: null, confirm: true },
        { confirm: true }
    ];
    for (const body of bodies) {
        const res = await put('/teacher/class/grade', tok, body);
        assert.strictEqual(res.status, 400, JSON.stringify(body));
        assert.strictEqual((await res.json()).error, MSG_GRADE);
    }
    const row = await gradeOf(id);
    assert.strictEqual(row.grade, null);
    assert.strictEqual(row.grade_locked_at, null);
});

test('dos peticiones simultaneas con grados distintos: una 200, otra 409, gana la primera', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const id = await freshTeacher('race');
    const tok = token(id, 'teacher');
    const [r3, r5] = await Promise.all([
        put('/teacher/class/grade', tok, { grade: 3, confirm: true }),
        put('/teacher/class/grade', tok, { grade: 5, confirm: true })
    ]);
    assert.deepStrictEqual([r3.status, r5.status].sort(), [200, 409]);
    const winner = r3.status === 200 ? 3 : 5;
    assert.strictEqual((await gradeOf(id)).grade, winner);
    const loser = r3.status === 200 ? r5 : r3;
    assert.strictEqual((await loser.json()).code, 'GRADE_LOCKED');
});

test('un estudiante en las rutas de clase recibe 403', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const tok = token(studentC, 'student');
    assert.strictEqual((await get('/teacher/class', tok)).status, 403);
    assert.strictEqual((await put('/teacher/class/grade', tok, { grade: 3, confirm: true })).status, 403);
    assert.strictEqual((await gradeOf(teacherC)).grade, null);
});

test('los tokens restringidos (mfa_enroll, pwd_change) dan 401', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const id = await freshTeacher('restr');
    for (const typ of ['mfa_enroll', 'pwd_change']) {
        const tok = jwt.sign({ id, role: 'teacher', tv: 0, typ }, process.env.JWT_SECRET, { expiresIn: '10m' });
        assert.strictEqual((await get('/teacher/class', tok)).status, 401, typ);
        assert.strictEqual((await put('/teacher/class/grade', tok, { grade: 3, confirm: true })).status, 401, typ);
    }
    assert.strictEqual((await gradeOf(id)).grade, null);
});

// ---- Docente sin fila en teachers ----

test('un usuario docente sin fila en teachers recibe 404 en GET y PUT de la clase', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const id = await makeUser('teacher', `cg.t.sinfila.${suffix}`);
    const tok = token(id, 'teacher');
    const g = await get('/teacher/class', tok);
    assert.strictEqual(g.status, 404);
    assert.strictEqual((await g.json()).error, 'El docente no existe.');
    const p = await put('/teacher/class/grade', tok, { grade: 3, confirm: true });
    assert.strictEqual(p.status, 404);
    assert.strictEqual((await p.json()).error, 'El docente no existe.');
});

// ---- Reinicio del grado por el gestor de cuentas ----

const STAFF_PASSWORD = 'GestorPrueba12345';
const MSG_REASON = 'El motivo debe tener entre 5 y 40 caracteres y no puede incluir |.';
const staffReady = () => Boolean(process.env.STAFF_JWT_SECRET && process.env.STAFF_MFA_KEY);
const staffCache = {};

async function staffToken(prefix, role) {
    if (staffCache[prefix]) return staffCache[prefix];
    const secret = totp.generateSecret();
    const username = `cg.${prefix}.${suffix}`;
    const [r] = await pool.query(
        'INSERT INTO staff_accounts (username, password_hash, role, mfa_secret_enc) VALUES (?, ?, ?, ?)',
        [username, await bcrypt.hash(STAFF_PASSWORD, 10), role, mfaCrypto.encrypt(secret)]
    );
    created.staff.push(r.insertId);
    const res = await fetch(`${baseUrl}/staff/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: STAFF_PASSWORD, totp: totp.generateToken(secret) })
    });
    assert.strictEqual(res.status, 200, 'el login del personal debe funcionar');
    staffCache[prefix] = (await res.json()).token;
    return staffCache[prefix];
}

function resetGrade(id, tok, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (tok) headers.Authorization = `Bearer ${tok}`;
    return fetch(`${baseUrl}/staff/teachers/${id}/reset-grade`, {
        method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
}

async function resetAuditRows(teacherId) {
    const { rows } = await audit.list({ action: 'staff.teacher.reset_grade', limit: 200 });
    return rows.filter((r) => r.target.startsWith(`teacher#${teacherId}:`));
}

test('reset-grade: sin token 401, auditor 403, tokens de plataforma 401', async (t) => {
    if (!ready || !staffReady()) { t.skip('sin MySQL o claves de personal'); return; }
    const id = await freshTeacher('rg1');
    await pool.query('UPDATE teachers SET grade = 3, grade_locked_at = NOW() WHERE user_id = ?', [id]);
    const body = { reason: 'eligio mal el grado' };
    assert.strictEqual((await resetGrade(id, null, body)).status, 401);
    assert.strictEqual((await resetGrade(id, await staffToken('aud', 'auditor'), body)).status, 403);
    assert.strictEqual((await resetGrade(id, token(id, 'teacher'), body)).status, 401);
    assert.strictEqual((await resetGrade(id, token(studentA, 'student'), body)).status, 401);
    assert.strictEqual((await gradeOf(id)).grade, 3, 'ningun intento rechazado cambia el grado');
    assert.strictEqual((await resetAuditRows(id)).length, 0);
});

test('reset-grade: id invalido 400; id inexistente o de un estudiante 404', async (t) => {
    if (!ready || !staffReady()) { t.skip('sin MySQL o claves de personal'); return; }
    const tok = await staffToken('acc', 'access_manager');
    const body = { reason: 'eligio mal el grado' };
    const bad = await resetGrade('abc', tok, body);
    assert.strictEqual(bad.status, 400);
    assert.strictEqual((await bad.json()).error, 'Identificador de docente invalido.');
    assert.strictEqual((await resetGrade(0, tok, body)).status, 400);
    const missing = await resetGrade(999999999, tok, body);
    assert.strictEqual(missing.status, 404);
    assert.strictEqual((await missing.json()).error, 'El docente no existe.');
    assert.strictEqual((await resetGrade(studentA, tok, body)).status, 404);
});

test('reset-grade: motivo ausente, corto, largo o con | da 400 sin tocar el grado ni auditar', async (t) => {
    if (!ready || !staffReady()) { t.skip('sin MySQL o claves de personal'); return; }
    const tok = await staffToken('acc', 'access_manager');
    const id = await freshTeacher('rg2');
    await pool.query('UPDATE teachers SET grade = 4, grade_locked_at = NOW() WHERE user_id = ?', [id]);
    const bodies = [
        undefined, {}, { reason: '' }, { reason: '    ' }, { reason: 'abcd' }, { reason: 'a'.repeat(41) },
        { reason: 'motivo | roto' }, { reason: 'motivo\nroto' }, { reason: 12345678 }
    ];
    for (const body of bodies) {
        const res = await resetGrade(id, tok, body);
        assert.strictEqual(res.status, 400, JSON.stringify(body));
        assert.strictEqual((await res.json()).error, MSG_REASON);
    }
    const row = await gradeOf(id);
    assert.strictEqual(row.grade, 4);
    assert.ok(row.grade_locked_at);
    assert.strictEqual((await resetAuditRows(id)).length, 0, 'sin fila de auditoria');
});

test('reset-grade: si el grado no esta declarado da 409 GRADE_NOT_SET', async (t) => {
    if (!ready || !staffReady()) { t.skip('sin MySQL o claves de personal'); return; }
    const tok = await staffToken('acc', 'access_manager');
    const id = await freshTeacher('rg3');
    const res = await resetGrade(id, tok, { reason: 'eligio mal el grado' });
    assert.strictEqual(res.status, 409);
    assert.strictEqual((await res.json()).code, 'GRADE_NOT_SET');
    assert.strictEqual((await resetAuditRows(id)).length, 0);
});

test('reset-grade: exito, auditoria, nuevo grado y credenciales intactas', async (t) => {
    if (!ready || !staffReady()) { t.skip('sin MySQL o claves de personal'); return; }
    const tok = await staffToken('acc', 'access_manager');
    const id = await freshTeacher('rg4');
    const stu = await makeStudent('rg4', id);
    const tokT = token(id, 'teacher');
    assert.strictEqual((await put('/teacher/class/grade', tokT, { grade: 3, confirm: true })).status, 200);
    await pool.query(
        "UPDATE users SET password_hash = '$2b$10$hashdeprueba', mfa_secret_enc = 'enc-prueba', token_version = 0 WHERE id = ?", [id]);
    const readCreds = async () => (await pool.query(
        'SELECT password_hash, mfa_secret_enc, mfa_pending_enc, token_version FROM users WHERE id = ?', [id]))[0][0];
    const before = await readCreds();
    const [[{ username }]] = await pool.query('SELECT username FROM users WHERE id = ?', [id]);
    const seen = await (await get('/activities/vocabulary', token(stu, 'student'))).json();
    assert.ok(seen.some((a) => a.id === actA1.id));

    const res = await resetGrade(id, tok, { reason: '  eligio mal el grado  ' });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { id, username, gradeReset: true });

    const row = await gradeOf(id);
    assert.strictEqual(row.grade, null);
    assert.strictEqual(row.grade_locked_at, null);
    const rows = await resetAuditRows(id);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].target, `teacher#${id}:${username}:motivo=eligio mal el grado`);
    assert.strictEqual(rows[0].actor_role, 'access_manager');
    assert.strictEqual(rows[0].outcome, 'ok');

    assert.deepStrictEqual(await readCreds(), before, 'contrasena, MFA y token_version no cambian');
    assert.strictEqual((await get('/teacher/class', tokT)).status, 200, 'la sesion del docente sigue valida');

    // Sin grado sus estudiantes no ven actividades; al declarar otro grado ven el nuevo nivel.
    assert.deepStrictEqual(await (await get('/activities/vocabulary', token(stu, 'student'))).json(), []);
    assert.strictEqual((await put('/teacher/class/grade', tokT, { grade: 4, confirm: true })).status, 200);
    const ids = (await (await get('/activities/vocabulary', token(stu, 'student'))).json()).map((a) => a.id);
    assert.ok(ids.includes(actA2.id) && !ids.includes(actA1.id), 'ahora ven el nivel A1.2');

    assert.strictEqual((await audit.verify()).ok, true, 'la cadena de auditoria sigue integra');
});

test('reset-grade: motivos con tab, NUL, cero ancho o bidireccional dan 400 sin tocar el grado ni auditar', async (t) => {
    if (!ready || !staffReady()) { t.skip('sin MySQL o claves de personal'); return; }
    const tok = await staffToken('acc', 'access_manager');
    const id = await freshTeacher('rg5');
    await pool.query('UPDATE teachers SET grade = 4, grade_locked_at = NOW() WHERE user_id = ?', [id]);
    const bad = [9, 0, 0x200B, 0x202E].map((c) => `motivo${String.fromCharCode(c)}roto`);
    for (const reason of bad) {
        const res = await resetGrade(id, tok, { reason });
        assert.strictEqual(res.status, 400, JSON.stringify(reason));
        assert.strictEqual((await res.json()).error, MSG_REASON);
    }
    const row = await gradeOf(id);
    assert.strictEqual(row.grade, 4);
    assert.ok(row.grade_locked_at);
    assert.strictEqual((await resetAuditRows(id)).length, 0, 'sin fila de auditoria');
});

test('reset-grade: limites exactos del motivo (5 y 40 caracteres, y 40 con espacios que se recortan)', async (t) => {
    if (!ready || !staffReady()) { t.skip('sin MySQL o claves de personal'); return; }
    const tok = await staffToken('acc', 'access_manager');
    const id = await freshTeacher('rg6');
    const cases = [
        ['abcde', 'abcde'],
        ['b'.repeat(40), 'b'.repeat(40)],
        [`  ${'c'.repeat(40)}  `, 'c'.repeat(40)]
    ];
    for (const [sent, stored] of cases) {
        await pool.query('UPDATE teachers SET grade = 3, grade_locked_at = NOW() WHERE user_id = ?', [id]);
        const res = await resetGrade(id, tok, { reason: sent });
        assert.strictEqual(res.status, 200, JSON.stringify(sent));
        assert.strictEqual((await gradeOf(id)).grade, null);
        const rows = await resetAuditRows(id);
        assert.ok(rows.some((r) => r.target.endsWith(`:motivo=${stored}`)), `auditado: ${stored.length} caracteres`);
    }
    assert.strictEqual((await resetAuditRows(id)).length, 3);
    assert.ok((await resetAuditRows(id)).every((r) => r.target.length <= 100));
});

test('reset-grade: usuario de 45 caracteres se reinicia y la auditoria se recorta a 100 sin perder el motivo', async (t) => {
    if (!ready || !staffReady()) { t.skip('sin MySQL o claves de personal'); return; }
    const tok = await staffToken('acc', 'access_manager');
    const username = `cg.t.largo.${suffix}`.padEnd(45, 'x');
    assert.strictEqual(username.length, 45);
    const id = await makeUser('teacher', username);
    await pool.query(
        'INSERT INTO teachers (user_id, display_name, class_code, grade, grade_locked_at) VALUES (?, ?, ?, 3, NOW())',
        [id, 'Docente largo', `LU${suffix}`]
    );
    const reason = 'm'.repeat(40);
    const res = await resetGrade(id, tok, { reason });
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await gradeOf(id)).grade, null);

    const rows = await resetAuditRows(id);
    assert.strictEqual(rows.length, 1, 'la fila de auditoria existe');
    assert.ok(rows[0].target.length <= 100, `target de ${rows[0].target.length} caracteres`);
    assert.ok(rows[0].target.startsWith(`teacher#${id}:`));
    assert.ok(rows[0].target.endsWith(`:motivo=${reason}`));
    assert.strictEqual((await audit.verify()).ok, true);
});
