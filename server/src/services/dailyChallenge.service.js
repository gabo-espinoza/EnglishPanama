const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { getDemoDayOffset } = require('./settings.service');
const { progressForXp } = require('./xp.service');
const { getClassLevelForStudent } = require('./classLevel.service');

// XP que otorga completar el reto diario.
const DAILY_CHALLENGE_XP = 10;

function addDays(date, days) {
    const copy = new Date(date.getTime());
    copy.setDate(copy.getDate() + days);
    return copy;
}

function toDateOnly(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function dayOfYear(date) {
    const startOfYear = new Date(date.getFullYear(), 0, 0);
    const diff = date - startOfYear;
    return Math.floor(diff / 86400000);
}

// Fecha "efectiva": la fecha real desplazada por el offset del modo demo.
// Tanto el reto de hoy como la fecha de completado usan siempre esta fecha,
// de modo que el modo demo mueve las dos cosas a la vez.
// El conjunto de retos se filtra por el nivel de la clase del estudiante; sin grado o sin
// retos de ese nivel el conjunto queda vacio y se responde igual que con el pool vacio.
async function resolveTodayChallenge(studentId) {
    const offset = await getDemoDayOffset();
    const effectiveDate = addDays(new Date(), offset);
    const completedOn = toDateOnly(effectiveDate);

    const level = await getClassLevelForStudent(studentId);
    let poolRows = [];
    if (level) {
        [poolRows] = await pool.query(
            `SELECT dc.id, dc.question_id AS questionId, dc.position
             FROM daily_challenges dc
             JOIN questions q ON q.id = dc.question_id
             JOIN activities a ON a.id = q.activity_id
             WHERE a.level = ?
             ORDER BY dc.position, dc.id`,
            [level]
        );
    }
    if (poolRows.length === 0) {
        throw new AppError('No hay retos diarios configurados.', 404);
    }

    const index = dayOfYear(effectiveDate) % poolRows.length;
    const challenge = poolRows[index];

    return { challenge, completedOn, offset };
}

async function getDailyChallenge(studentId) {
    const { challenge, completedOn } = await resolveTodayChallenge(studentId);

    const [questionRows] = await pool.query(
        'SELECT id, prompt, options, topic FROM questions WHERE id = ?',
        [challenge.questionId]
    );
    if (questionRows.length === 0) {
        throw new AppError('El reto de hoy no tiene una pregunta valida.', 409);
    }

    const [completionRows] = await pool.query(
        'SELECT id FROM daily_completions WHERE student_id = ? AND completed_on = ?',
        [studentId, completedOn]
    );

    return {
        date: completedOn,
        challengeId: challenge.id,
        question: questionRows[0],
        completed: completionRows.length > 0
    };
}

async function completeDailyChallenge(studentId) {
    const { challenge, completedOn } = await resolveTodayChallenge(studentId);
    const xpEarned = DAILY_CHALLENGE_XP;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        try {
            await connection.query(
                'INSERT INTO daily_completions (student_id, challenge_id, completed_on) VALUES (?, ?, ?)',
                [studentId, challenge.id, completedOn]
            );
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                throw new AppError('Ya completaste el reto de hoy.', 409);
            }
            throw err;
        }

        const [studentRows] = await connection.query(
            'SELECT xp FROM students WHERE user_id = ? FOR UPDATE',
            [studentId]
        );
        if (studentRows.length === 0) {
            throw new AppError('El estudiante no existe.', 404);
        }

        const totalXp = studentRows[0].xp + xpEarned;
        await connection.query('UPDATE students SET xp = ? WHERE user_id = ?', [totalXp, studentId]);

        await connection.commit();

        return { completed: true, completedOn, xpEarned, totalXp, ...progressForXp(totalXp) };
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

module.exports = { getDailyChallenge, completeDailyChallenge, DAILY_CHALLENGE_XP };
