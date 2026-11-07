const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { xpForScore, progressForXp } = require('./xp.service');
const { getClassLevelForStudent } = require('./classLevel.service');
const { normalizeAnswer } = require('../utils/answers');
const game = require('./game.service');

const VALID_MODULES = ['vocabulary', 'grammar', 'reading'];
const MAX_ANSWER_LENGTH = 200;
const MAX_ANSWER_ITEMS = 50;

// Funcion pura: valida la forma de las respuestas ANTES de corregir. Se exporta
// para poder probarla sin base de datos (diseno §5.6, validacion en el servidor).
// Una respuesta ausente cuenta como incorrecta; lo que se rechaza aqui son tipos
// y tamanos que no deberian llegar a normalizeAnswer.
function assertValidAnswers(answers) {
    if (!Array.isArray(answers) || answers.length === 0) {
        throw new AppError('Debes enviar al menos una respuesta (answers).', 400);
    }
    const byQuestion = new Map();
    for (const item of answers) {
        if (!item || typeof item !== 'object' || Array.isArray(item) || item.questionId === undefined) {
            throw new AppError('Cada respuesta debe incluir questionId.', 400);
        }
        const qid = Number(item.questionId);
        if (!Number.isInteger(qid) || qid <= 0) {
            throw new AppError('questionId no es valido.', 400);
        }
        const answer = item.answer;
        if (typeof answer === 'string' && answer.length > MAX_ANSWER_LENGTH) {
            throw new AppError('La respuesta es demasiado larga.', 400);
        }
        if (Array.isArray(answer) && answer.length > MAX_ANSWER_ITEMS) {
            throw new AppError('La respuesta tiene demasiados elementos.', 400);
        }
        if (typeof answer === 'function' || typeof answer === 'symbol' || typeof answer === 'bigint') {
            throw new AppError('La respuesta no es valida.', 400);
        }
        byQuestion.set(qid, answer);
    }
    return byQuestion;
}

async function listActivitiesByModule(studentId, moduleSlug) {
    if (!VALID_MODULES.includes(moduleSlug)) {
        throw new AppError('Modulo invalido. Usa vocabulary, grammar o reading.', 404);
    }

    const [moduleRows] = await pool.query('SELECT id FROM modules WHERE slug = ?', [moduleSlug]);
    if (moduleRows.length === 0) {
        throw new AppError('El modulo no existe.', 404);
    }

    // Clase sin grado declarado: no hay nivel que mostrar.
    const level = await getClassLevelForStudent(studentId);
    if (level === null) return [];

    const [rows] = await pool.query(
        'SELECT id, title, game_type AS gameType, sort_order AS sortOrder, is_example AS isExample ' +
        "FROM activities WHERE module_id = ? AND level = ? AND status = 'published' ORDER BY sort_order, id",
        [moduleRows[0].id, level]
    );
    return rows.map((row) => ({ ...row, isExample: Boolean(row.isExample) }));
}

// 404 si la actividad no existe, es de otro nivel o la clase no tiene grado.
// Devuelve la fila de la actividad (id y passage_text).
async function findActivityForStudent(studentId, activityId) {
    const id = Number(activityId);
    if (!Number.isInteger(id) || id <= 0) {
        throw new AppError('La actividad no existe.', 404);
    }
    const level = await getClassLevelForStudent(studentId);
    if (level === null) {
        throw new AppError('La actividad no existe.', 404);
    }
    const [activityRows] = await pool.query(
        "SELECT id, passage_text AS passageText FROM activities WHERE id = ? AND level = ? AND status = 'published'",
        [id, level]
    );
    if (activityRows.length === 0) {
        throw new AppError('La actividad no existe.', 404);
    }
    return activityRows[0];
}

async function getActivityQuestions(studentId, activityId) {
    const activity = await findActivityForStudent(studentId, activityId);

    // Solo columnas publicas: correct_answer nunca sale de aqui.
    const [questionRows] = await pool.query(
        'SELECT id, prompt, options FROM questions WHERE activity_id = ? ORDER BY id',
        [activityId]
    );

    return {
        activityId: activity.id,
        passageText: activity.passageText,
        questions: questionRows
    };
}

async function submitAttempt(studentId, activityId, answers) {
    const answerByQuestion = assertValidAnswers(answers);

    // Antes de corregir y de abrir la transaccion: otro nivel o clase sin grado = 404.
    await findActivityForStudent(studentId, activityId);

    const [questionRows] = await pool.query(
        'SELECT id, correct_answer AS correctAnswer FROM questions WHERE activity_id = ?',
        [activityId]
    );
    if (questionRows.length === 0) {
        throw new AppError('La actividad no tiene preguntas configuradas.', 409);
    }

    // La forma de las respuestas ya se valido con assertValidAnswers.

    // La correccion se hace siempre aqui, en el servidor.
    const results = questionRows.map((question) => ({
        questionId: question.id,
        isCorrect:
            normalizeAnswer(answerByQuestion.get(question.id)) ===
            normalizeAnswer(question.correctAnswer)
    }));

    const score = results.filter((result) => result.isCorrect).length;
    const rules = await game.getRules();
    const xpEarned = xpForScore(score, rules.xpPerCorrect);

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [studentRows] = await connection.query(
            'SELECT xp FROM students WHERE user_id = ? FOR UPDATE',
            [studentId]
        );
        if (studentRows.length === 0) {
            throw new AppError('El estudiante no existe.', 404);
        }

        // El XP se otorga una sola vez por actividad: repetir el envio de la misma
        // actividad no puede inflar el XP ni el ranking (diseno §3, "que el nino no
        // pueda hacer trampa desde su navegador").
        const [priorRows] = await connection.query(
            'SELECT COUNT(*) AS n FROM attempts WHERE student_id = ? AND activity_id = ?',
            [studentId, activityId]
        );
        const awardedXp = Number(priorRows[0].n) === 0 ? xpEarned : 0;

        const [attemptResult] = await connection.query(
            'INSERT INTO attempts (student_id, activity_id, score, xp_earned) VALUES (?, ?, ?, ?)',
            [studentId, activityId, score, awardedXp]
        );
        const attemptId = attemptResult.insertId;

        for (const result of results) {
            await connection.query(
                'INSERT INTO attempt_answers (attempt_id, question_id, is_correct) VALUES (?, ?, ?)',
                [attemptId, result.questionId, result.isCorrect]
            );
        }

        const totalXp = studentRows[0].xp + awardedXp;
        await connection.query('UPDATE students SET xp = ? WHERE user_id = ?', [totalXp, studentId]);

        await connection.commit();

        return { score, xpEarned: awardedXp, totalXp, ...progressForXp(totalXp, rules.xpPerLevel) };
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

module.exports = { listActivitiesByModule, getActivityQuestions, submitAttempt, assertValidAnswers };
