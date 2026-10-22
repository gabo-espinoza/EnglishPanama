// Reto diario: el servidor califica la respuesta ANTES de otorgar XP.
//
// Bootstrap al estilo de class-grade.test.js: docentes con grado, estudiantes propios, tokens
// firmados con JWT_SECRET y limpieza al final. Se omite solo si no hay MySQL o JWT_SECRET.
// El reto de hoy depende del indice del dia sobre el conjunto del nivel (que otros archivos de
// prueba pueden ampliar en paralelo), asi que las pruebas piden primero la pregunta asignada con
// GET y leen su respuesta de la BD; nunca asumen cual toca.
const test = require('node:test');
const assert = require('node:assert');
// El limiter lee su limite al cargar su modulo: debe fijarse antes de requerir la app.
process.env.AUTH_RATE_LIMIT_MAX ??= '200';
const jwt = require('jsonwebtoken');

require('dotenv').config();

const app = require('../src/app');
const pool = require('../src/config/db');
const { closeAuditPool } = require('../src/config/auditDb');
const { normalizeAnswer } = require('../src/utils/answers');

let server;
let baseUrl;
let ready = false;

const suffix = String(Date.now()).slice(-7);
const created = { users: [], activities: [], challenges: [], moduleId: null, moduleCreated: false };

let teacherA; // grado 3 -> A1.1
let teacherB; // grado 4 -> A1.2
let teacherC; // sin grado
let studentC;
// Respuestas unicas que solo existen en cada nivel (ninguna otra pregunta las usa).
let uniqueA1; // correcta en una pregunta A1.1
let uniqueA2; // correcta en una pregunta A1.2

function token(userId, role) {
    return jwt.sign({ id: userId, role, tv: 0, typ: 'user' }, process.env.JWT_SECRET, { expiresIn: '2h' });
}

function get(path, tok) {
    return fetch(`${baseUrl}${path}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
}

function post(path, tok, body) {
    return fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

const COMPLETE = '/daily-challenge/complete';

async function makeUser(role, username) {
    const [r] = await pool.query('INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)', [role, username, 'x']);
    created.users.push(r.insertId);
    return r.insertId;
}

async function makeTeacher(name, code, grade) {
    const id = await makeUser('teacher', `dc.t.${name}.${suffix}`);
    await pool.query(
        'INSERT INTO teachers (user_id, display_name, class_code, grade, grade_locked_at) VALUES (?, ?, ?, ?, ?)',
        [id, `Docente ${name}`, `${code}${suffix}`, grade, grade === null ? null : new Date()]
    );
    return id;
}

let studentSeq = 0;
async function makeStudent(teacherId) {
    studentSeq += 1;
    const id = await makeUser('student', `dc.s.${studentSeq}.${suffix}`);
    await pool.query('INSERT INTO students (user_id, teacher_id) VALUES (?, ?)', [id, teacherId]);
    return id;
}

// Actividad de un nivel con una pregunta cuya respuesta correcta es `answer`, ya en el reto diario.
let seq = 0;
async function makeChallenge(level, answer) {
    seq += 1;
    const [act] = await pool.query(
        "INSERT INTO activities (module_id, title, game_type, sort_order, level, is_example) VALUES (?, ?, 'multiple_choice', 0, ?, 0)",
        [created.moduleId, `Reto ${level} ${suffix}-${seq}`, level]
    );
    created.activities.push(act.insertId);
    const [q] = await pool.query(
        'INSERT INTO questions (activity_id, topic, prompt, options, correct_answer) VALUES (?, ?, ?, ?, ?)',
        [act.insertId, 'reto', `Pregunta reto ${level} ${suffix}-${seq}`, JSON.stringify([answer, 'otra', 'ninguna']), JSON.stringify(answer)]
    );
    const [ch] = await pool.query('INSERT INTO daily_challenges (question_id, position) VALUES (?, ?)', [q.insertId, 910000 + seq]);
    created.challenges.push(ch.insertId);
    return q.insertId;
}

async function xpOf(studentId) {
    const [rows] = await pool.query('SELECT xp FROM students WHERE user_id = ?', [studentId]);
    return rows[0].xp;
}

async function completionCount(studentId) {
    const [rows] = await pool.query('SELECT COUNT(*) AS n FROM daily_completions WHERE student_id = ?', [studentId]);
    return Number(rows[0].n);
}

// Respuesta correcta de la pregunta que el servidor asigna hoy a este estudiante.
async function assignedAnswer(studentId) {
    const res = await get('/daily-challenge', token(studentId, 'student'));
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    const [rows] = await pool.query('SELECT correct_answer AS a FROM questions WHERE id = ?', [body.question.id]);
    return rows[0].a;
}

// Envia la respuesta correcta del reto asignado. Si el conjunto cambio entre pedir la pregunta y
// responder (otro archivo de prueba siembra retos en paralelo) reintenta; las respuestas
// incorrectas no escriben nada, asi que reintentar es inocuo.
async function completeCorrectly(studentId) {
    let res;
    for (let i = 0; i < 5; i += 1) {
        res = await post(COMPLETE, token(studentId, 'student'), { answer: await assignedAnswer(studentId) });
        if (res.status !== 200) return res;
    }
    return res;
}

test.before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    if (!process.env.JWT_SECRET) return;
    try { await pool.query('SELECT 1'); } catch { return; }

    teacherA = await makeTeacher('a', 'DA', 3);
    teacherB = await makeTeacher('b', 'DB', 4);
    teacherC = await makeTeacher('c', 'DC', null);
    studentC = await makeStudent(teacherC);

    const [mods] = await pool.query("SELECT id FROM modules WHERE slug = 'vocabulary'");
    if (mods.length === 0) {
        const [m] = await pool.query("INSERT INTO modules (slug, name) VALUES ('vocabulary', 'Vocabulary')");
        created.moduleId = m.insertId;
        created.moduleCreated = true;
    } else {
        created.moduleId = mods[0].id;
    }

    uniqueA1 = `qa1-${suffix}`;
    uniqueA2 = `qa2-${suffix}`;
    await makeChallenge('A1.1', uniqueA1);
    await makeChallenge('A1.2', uniqueA2);

    ready = true;
});

test.after(async () => {
    try {
        if (created.users.length) await pool.query('DELETE FROM daily_completions WHERE student_id IN (?)', [created.users]);
        if (created.challenges.length) await pool.query('DELETE FROM daily_challenges WHERE id IN (?)', [created.challenges]);
        if (created.activities.length) await pool.query('DELETE FROM activities WHERE id IN (?)', [created.activities]);
        if (created.moduleCreated) await pool.query('DELETE FROM modules WHERE id = ?', [created.moduleId]);
        if (created.users.length) {
            await pool.query('DELETE FROM students WHERE user_id IN (?)', [created.users]);
            await pool.query('DELETE FROM teachers WHERE user_id IN (?)', [created.users]);
            await pool.query('DELETE FROM users WHERE id IN (?)', [created.users]);
        }
    } catch (err) {
        console.error('Fallo la limpieza de daily-challenge.test.js:', err.message);
    }
    server?.close();
    try { await pool.end(); } catch { /* sin conexiones */ }
    try { await closeAuditPool(); } catch { /* sin conexiones */ }
});

test('normalizeAnswer: recorta, pasa a minusculas y une arreglos', () => {
    assert.strictEqual(normalizeAnswer('  AM '), 'am');
    assert.strictEqual(normalizeAnswer(5), '5');
    assert.strictEqual(normalizeAnswer(null), '');
    assert.strictEqual(normalizeAnswer(['A', ' b ']), 'a|b');
    assert.strictEqual(normalizeAnswer({ b: 'X', a: 1 }), 'a:1|b:x');
});

test('respuesta correcta: 201, correct:true, una finalizacion y +10 XP', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const student = await makeStudent(teacherA);
    const xpAntes = await xpOf(student);

    const res = await completeCorrectly(student);
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.correct, true);
    assert.strictEqual(body.completed, true);
    assert.strictEqual(body.xpEarned, 10);
    assert.strictEqual(body.totalXp, xpAntes + 10);
    for (const key of ['completedOn', 'level', 'xpIntoLevel', 'xpForNextLevel']) assert.ok(key in body, key);
    assert.strictEqual(await xpOf(student), xpAntes + 10);
    assert.strictEqual(await completionCount(student), 1);

    const today = await (await get('/daily-challenge', token(student, 'student'))).json();
    assert.strictEqual(today.completed, true);
});

test('la respuesta se compara sin importar mayusculas ni espacios', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const student = await makeStudent(teacherA);
    let res;
    for (let i = 0; i < 5; i += 1) {
        const correct = await assignedAnswer(student);
        res = await post(COMPLETE, token(student, 'student'), { answer: `  ${String(correct).toUpperCase()} ` });
        if (res.status !== 200) break;
    }
    assert.strictEqual(res.status, 201);
    assert.strictEqual((await res.json()).correct, true);
});

test('respuesta incorrecta: 200 {correct:false}, sin finalizacion, sin XP y sin revelar la respuesta', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const student = await makeStudent(teacherA);
    const xpAntes = await xpOf(student);

    const res = await post(COMPLETE, token(student, 'student'), { answer: 'zzz-respuesta-incorrecta' });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { correct: false });
    assert.strictEqual(await completionCount(student), 0);
    assert.strictEqual(await xpOf(student), xpAntes);

    // El reto sigue disponible: un intento correcto posterior si cuenta.
    const ok = await completeCorrectly(student);
    assert.strictEqual(ok.status, 201);
    assert.strictEqual(await xpOf(student), xpAntes + 10);
});

test('GET del reto no incluye la respuesta correcta', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const student = await makeStudent(teacherA);
    const body = await (await get('/daily-challenge', token(student, 'student'))).json();
    assert.deepStrictEqual(Object.keys(body.question).sort(), ['id', 'options', 'prompt', 'topic']);
    assert.ok(!JSON.stringify(body).includes('correct'));
});

test('un reto ya completado da 409 aunque la respuesta sea incorrecta', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const student = await makeStudent(teacherA);
    assert.strictEqual((await completeCorrectly(student)).status, 201);
    const xpDespues = await xpOf(student);

    for (const answer of ['zzz-respuesta-incorrecta', await assignedAnswer(student)]) {
        const res = await post(COMPLETE, token(student, 'student'), { answer });
        assert.strictEqual(res.status, 409);
        assert.strictEqual((await res.json()).error, 'Ya completaste el reto de hoy.');
    }
    assert.strictEqual(await completionCount(student), 1);
    assert.strictEqual(await xpOf(student), xpDespues);
});

test('answer ausente, vacia, de tipo invalido o demasiado larga da 400 y no escribe nada', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const student = await makeStudent(teacherA);
    const xpAntes = await xpOf(student);
    const bodies = [
        {},
        { answer: '' },
        { answer: '   ' },
        { answer: null },
        { answer: ['am'] },
        { answer: { a: 1 } },
        { answer: true },
        { answer: 'a'.repeat(201) }
    ];
    for (const body of bodies) {
        const res = await post(COMPLETE, token(student, 'student'), body);
        assert.strictEqual(res.status, 400, JSON.stringify(body).slice(0, 40));
        assert.ok(typeof (await res.json()).error === 'string');
    }
    assert.strictEqual(await completionCount(student), 0);
    assert.strictEqual(await xpOf(student), xpAntes);
});

test('una respuesta numerica valida se califica (incorrecta: 200)', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const student = await makeStudent(teacherA);
    const res = await post(COMPLETE, token(student, 'student'), { answer: 987654321 });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { correct: false });
    assert.strictEqual(await completionCount(student), 0);
});

test('envios correctos simultaneos: uno gana (201), el resto 409, un solo registro y XP una vez', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const student = await makeStudent(teacherA);
    const xpAntes = await xpOf(student);
    let statuses = [];
    for (let i = 0; i < 5; i += 1) {
        const answer = await assignedAnswer(student);
        const tok = token(student, 'student');
        const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => post(COMPLETE, tok, { answer })));
        statuses = results.map((r) => r.status).sort();
        if (!statuses.every((s) => s === 200)) break;
    }
    assert.deepStrictEqual(statuses, [201, 409, 409, 409, 409, 409]);
    assert.strictEqual(await completionCount(student), 1);
    assert.strictEqual(await xpOf(student), xpAntes + 10);
});

test('una clase sin grado recibe 404 al responder', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const res = await post(COMPLETE, token(studentC, 'student'), { answer: uniqueA1 });
    assert.strictEqual(res.status, 404);
    assert.strictEqual((await res.json()).error, 'No hay retos diarios configurados.');
    assert.strictEqual(await completionCount(studentC), 0);
});

test('la respuesta correcta de otro nivel es incorrecta y no suma XP', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const studentB = await makeStudent(teacherB); // A1.2
    const studentA = await makeStudent(teacherA); // A1.1
    for (const [student, foreign] of [[studentB, uniqueA1], [studentA, uniqueA2]]) {
        const xpAntes = await xpOf(student);
        const res = await post(COMPLETE, token(student, 'student'), { answer: foreign });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { correct: false });
        assert.strictEqual(await completionCount(student), 0);
        assert.strictEqual(await xpOf(student), xpAntes);
    }
});

test('sin token da 401 y con token de docente da 403', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const anon = await post(COMPLETE, null, { answer: uniqueA1 });
    assert.strictEqual(anon.status, 401);
    const teacher = await post(COMPLETE, token(teacherA, 'teacher'), { answer: uniqueA1 });
    assert.strictEqual(teacher.status, 403);
});
