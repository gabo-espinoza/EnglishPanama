const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { progressForXp } = require('./xp.service');

// Ranking de la clase del estudiante autenticado.
// Expone solo alias (username), avatar, XP y nivel: nunca nombres reales ni datos personales.
async function getClassRanking(studentId) {
    const [studentRows] = await pool.query(
        'SELECT teacher_id AS teacherId FROM students WHERE user_id = ?',
        [studentId]
    );
    if (studentRows.length === 0) {
        throw new AppError('El estudiante no existe.', 404);
    }
    const teacherId = studentRows[0].teacherId;

    const [rows] = await pool.query(
        `SELECT u.username AS alias, s.avatar, s.xp
         FROM students s
         JOIN users u ON u.id = s.user_id
         WHERE s.teacher_id = ?
         ORDER BY s.xp DESC, u.username ASC`,
        [teacherId]
    );

    return rows.map((row, index) => ({
        position: index + 1,
        alias: row.alias,
        avatar: row.avatar,
        xp: row.xp,
        ...progressForXp(row.xp)
    }));
}

module.exports = { getClassRanking };
