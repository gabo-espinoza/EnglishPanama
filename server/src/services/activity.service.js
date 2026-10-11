const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { xpForScore, progressForXp } = require('./xp.service');

const VALID_MODULES = ['vocabulary', 'grammar', 'reading'];

// Compara la respuesta del estudiante con la guardada, sin importar el formato
// (string, número o arreglo). La respuesta correcta vive SOLO en el servidor:
// nunca se envía al cliente antes de que responda.
function normalizeAnswer(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(normalizeAnswer).join('|');
    if (typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .map((key) => `${key}:${normalizeAnswer(value[key])}`)
            .join('|');
    }
    return String(value).trim().toLowerCase();
}

async function listActivitiesByModule(moduleSlug) {
    if (!VALID_MODULES.includes(moduleSlug)) {
        throw new AppError('Módulo inválido. Usa vocabulary, grammar o reading.', 404);
    }

    const [moduleRows] = await pool.query('SELECT id FROM modules WHERE slug = ?', [moduleSlug]);
    if (moduleRows.length === 0) {
        throw new AppError('El módulo no existe.', 404);
    }

    const [rows] = await pool.query(
        'SELECT id, title, game_type AS gameType, sort_order AS sortOrder ' +
        'FROM activities WHERE module_id = ? ORDER BY sort_order, id',
        [moduleRows[0].id]
    );
    return rows;
}

async function getActivityQuestions(activityId) {
    const [activityRows] = await pool.query(
        'SELECT id, passage_text AS passageText FROM activities WHERE id = ?',
        [activityId]
    );
    if (activityRows.length === 0) {
        throw new AppError('La actividad no existe.', 404);
    }

    // Solo columnas públicas: correct_answer nunca sale de aquí.
    const [questionRows] = await pool.query(
        'SELECT id, prompt, options FROM questions WHERE activity_id = ? ORDER BY id',
        [activityId]
    );

    return {
        activityId: activityRows[0].id,
        passageText: activityRows[0].passageText,
        questions: questionRows
    };
}

async function submitAttempt(studentId, activityId, answers) {
    if (!Array.isArray(answers) || answers.length === 0) {
        throw new AppError('Debes enviar al menos una respuesta (answers).');
    }

    const [activityRows] = await pool.query('SELECT id FROM activities WHERE id = ?', [activityId]);
    if (activityRows.length === 0) {
        throw new AppError('La actividad no existe.', 404);
    }

    const [questionRows] = await pool.query(
        'SELECT id, correct_answer AS correctAnswer FROM questions WHERE activity_id = ?',
        [activityId]
    );
    if (questionRows.length === 0) {
        throw new AppError('La actividad no tiene preguntas configuradas.', 409);
    }

    // Indexa lo que envió el estudiante por id de pregunta.
    const answerByQuestion = new Map();
    for (const item of answers) {
        if (item && item.questionId !== undefined) {
            answerByQuestion.set(Number(item.questionId), item.answer);
        }
    }

    // La corrección se hace siempre aquí, en el servidor.
    const results = questionRows.map((question) => ({
        questionId: question.id,
        isCorrect:
            normalizeAnswer(answerByQuestion.get(question.id)) ===
            normalizeAnswer(question.correctAnswer)
    }));

    const score = results.filter((result) => result.isCorrect).length;
    const xpEarned = xpForScore(score);

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

        const [attemptResult] = await connection.query(
            'INSERT INTO attempts (student_id, activity_id, score, xp_earned) VALUES (?, ?, ?, ?)',
            [studentId, activityId, score, xpEarned]
        );
        const attemptId = attemptResult.insertId;

        for (const result of results) {
            await connection.query(
                'INSERT INTO attempt_answers (attempt_id, question_id, is_correct) VALUES (?, ?, ?)',
                [attemptId, result.questionId, result.isCorrect]
            );
        }

        const totalXp = studentRows[0].xp + xpEarned;
        await connection.query('UPDATE students SET xp = ? WHERE user_id = ?', [totalXp, studentId]);

        await connection.commit();

        return { score, xpEarned, totalXp, ...progressForXp(totalXp) };
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

module.exports = { listActivitiesByModule, getActivityQuestions, submitAttempt };
