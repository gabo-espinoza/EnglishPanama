// Metricas agregadas y anonimas para el gestor de usuarios y accesos.
// Nunca devuelve alias, nombres ni datos personales: solo totales.
const pool = require('../config/db');

async function dashboard() {
    const [totalsRows] = await pool.query(
        `SELECT
            (SELECT COUNT(*) FROM users WHERE role = 'student') AS students,
            (SELECT COUNT(*) FROM users WHERE role = 'teacher') AS teachers,
            (SELECT COUNT(*) FROM activities)                     AS activities,
            (SELECT COUNT(*) FROM questions)                      AS questions,
            (SELECT COUNT(*) FROM attempts)                       AS attempts,
            (SELECT COUNT(*) FROM daily_completions)              AS dailyCompletions`
    );
    const [staffRows] = await pool.query(
        'SELECT role, COUNT(*) AS total FROM staff_accounts GROUP BY role ORDER BY role ASC'
    );

    return { ...totalsRows[0], staffByRole: staffRows };
}

module.exports = { dashboard };
