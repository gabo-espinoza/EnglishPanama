// Aislamiento de datos y reglas del servidor.
//
// Comprueba tres cosas que un atacante suele intentar:
//   1) Que un docente solo vea los estudiantes de SU clase (no los de otra clase).
//   2) Que un estudiante no pueda leer datos de otro cambiando el id (IDOR).
//   3) Que la respuesta correcta y el XP se calculen en el servidor y no se puedan
//      inyectar desde el cliente.
//
// Los tokens se firman directamente con JWT_SECRET para no depender del login ni
// gastar el limite de intentos. Se omiten solas si no hay MySQL.
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const app = require('../src/app');
const pool = require('../src/config/db');

let server;
let baseUrl;
let ready = false;

const suffix = String(Date.now()).slice(-7);
const created = { users: [] };
let teacherA;
let teacherB;
let studentA;
let studentB;
let activityId;
let questionId;

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

test.before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    if (!process.env.JWT_SECRET) return;
    try { await pool.query('SELECT 1'); } catch { return; }

    async function makeUser(role, username) {
        const [r] = await pool.query(
            'INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)',
            [role, username, 'x']
        );
        created.users.push(r.insertId);
        return r.insertId;
    }

    teacherA = await makeUser('teacher', `t.a.${suffix}`);
    teacherB = await makeUser('teacher', `t.b.${suffix}`);
    studentA = await makeUser('student', `s.a.${suffix}`);
    studentB = await makeUser('student', `s.b.${suffix}`);

    // El docente A declara grado 3 (nivel A1.1): su clase solo ve actividades de ese nivel.
    await pool.query('INSERT INTO teachers (user_id, display_name, class_code, grade, grade_locked_at) VALUES (?, ?, ?, 3, NOW())', [teacherA, 'Docente A', 'A' + suffix]);
    await pool.query('INSERT INTO teachers (user_id, display_name, class_code) VALUES (?, ?, ?)', [teacherB, 'Docente B', 'B' + suffix]);
    await pool.query('INSERT INTO students (user_id, teacher_id) VALUES (?, ?)', [studentA, teacherA]);
    await pool.query('INSERT INTO students (user_id, teacher_id) VALUES (?, ?)', [studentB, teacherB]);

    // Contenido minimo para poder probar XP y respuestas. Se reutiliza el modulo
    // grammar si ya existiera; la actividad se borra al final (y con ella sus
    // preguntas e intentos, por las claves foraneas).
    let [mods] = await pool.query("SELECT id FROM modules WHERE slug = 'grammar'");
    let moduleId;
    if (mods.length === 0) {
        const [m] = await pool.query("INSERT INTO modules (slug, name) VALUES ('grammar', 'Grammar')");
        moduleId = m.insertId;
    } else {
        moduleId = mods[0].id;
    }

    const [act] = await pool.query(
        "INSERT INTO activities (module_id, title, game_type, sort_order, level) VALUES (?, ?, 'multiple_choice', 0, 'A1.1')",
        [moduleId, `Actividad aislamiento ${suffix}`]
    );
    activityId = act.insertId;

    const [q1] = await pool.query(
        'INSERT INTO questions (activity_id, topic, prompt, options, correct_answer) VALUES (?, ?, ?, ?, ?)',
        [activityId, 'aislamiento', 'I ___ a student.', JSON.stringify(['am', 'is', 'are']), JSON.stringify('am')]
    );
    questionId = q1.insertId;
    await pool.query(
        'INSERT INTO questions (activity_id, topic, prompt, options, correct_answer) VALUES (?, ?, ?, ?, ?)',
        [activityId, 'aislamiento', 'She ___ happy.', JSON.stringify(['am', 'is', 'are']), JSON.stringify('is')]
    );

    ready = true;
});

test.after(async () => {
    if (ready) {
        await pool.query('DELETE FROM activities WHERE id = ?', [activityId]);
        await pool.query('DELETE FROM students WHERE user_id IN (?)', [created.users]);
        await pool.query('DELETE FROM teachers WHERE user_id IN (?)', [created.users]);
        await pool.query('DELETE FROM users WHERE id IN (?)', [created.users]);
    }
    server.close();
    try { await pool.end(); } catch { /* sin conexiones */ }
});

test('el docente solo ve los estudiantes de su propia clase', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const a = await (await get('/teacher/students', token(teacherA, 'teacher'))).json();
    const b = await (await get('/teacher/students', token(teacherB, 'teacher'))).json();

    const aliasA = a.map((s) => s.alias);
    const aliasB = b.map((s) => s.alias);
    assert.ok(aliasA.includes(`s.a.${suffix}`), 'el docente A debe ver a su estudiante');
    assert.ok(!aliasA.includes(`s.b.${suffix}`), 'el docente A NO debe ver al estudiante de otra clase');
    assert.ok(aliasB.includes(`s.b.${suffix}`), 'el docente B debe ver a su estudiante');
    assert.ok(!aliasB.includes(`s.a.${suffix}`), 'el docente B NO debe ver al estudiante de otra clase');
});

test('un estudiante no puede entrar al panel docente (403)', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const res = await get('/teacher/students', token(studentA, 'student'));
    assert.strictEqual(res.status, 403);
});

test('no hay IDOR: /users/me ignora cualquier id ajeno', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const propio = await (await get('/users/me', token(studentA, 'student'))).json();
    assert.strictEqual(propio.alias, `s.a.${suffix}`, 'debe devolver el perfil propio');

    // Se intenta colar el id del otro estudiante por la query: no debe cambiar nada.
    const ajeno = await (await get(`/users/me?id=${studentB}&userId=${studentB}`, token(studentA, 'student'))).json();
    assert.strictEqual(ajeno.alias, `s.a.${suffix}`, 'no debe devolver el perfil ajeno');
});

test('las preguntas no revelan la respuesta correcta al cliente', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const res = await get(`/activities/${activityId}/questions`, token(studentA, 'student'));
    assert.strictEqual(res.status, 200);

    const texto = await res.text();
    assert.ok(!/correctAnswer/i.test(texto), 'no debe aparecer correctAnswer');
    assert.ok(!/correct_answer/i.test(texto), 'no debe aparecer correct_answer');

    const body = JSON.parse(texto);
    assert.ok(Array.isArray(body.questions) && body.questions.length === 2);
    for (const q of body.questions) {
        assert.ok(q.options, 'la pregunta debe traer opciones');
        assert.strictEqual(q.correctAnswer, undefined);
    }
});

test('el puntaje y el XP los calcula el servidor, no el cliente', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const antes = (await pool.query('SELECT xp FROM students WHERE user_id = ?', [studentA]))[0][0].xp;

    // Solo una respuesta, y correcta. Ademas se intenta inyectar score y XP falsos.
    const res = await post(`/activities/${activityId}/attempts`, token(studentA, 'student'), {
        answers: [{ questionId, answer: 'am' }],
        score: 9999,
        xpEarned: 9999,
        totalXp: 999999
    });
    assert.strictEqual(res.status, 201);

    const body = await res.json();
    assert.strictEqual(body.score, 1, 'el score real es 1 (una respuesta correcta)');
    assert.strictEqual(body.xpEarned, 5, 'el XP real es 5 (5 por acierto)');

    const despues = (await pool.query('SELECT xp FROM students WHERE user_id = ?', [studentA]))[0][0].xp;
    assert.strictEqual(despues - antes, 5, 'solo se sumaron los 5 XP calculados en el servidor');
});
