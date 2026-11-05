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
        `SELECT s.user_id AS studentId, u.username AS alias, s.avatar, s.xp, s.alias_hidden AS aliasHidden
         FROM students s
         JOIN users u ON u.id = s.user_id
         WHERE s.teacher_id = ?
         ORDER BY s.xp DESC, u.username ASC`,
        [teacherId]
    );

    return buildRanking(rows, studentId);
}

// Funcion pura (sin base) para poder probar el orden y que no se filtren datos.
// El SQL ya ordena por xp DESC, username ASC; aqui solo se asignan posiciones.
// `isMe` marca la fila del estudiante autenticado (se calcula aqui, con el id, porque un
// alias oculto se muestra como 'Jugador oculto' para todos, incluido uno mismo: el cliente
// no puede reconocerse por el alias). El id nunca sale en la respuesta.
function buildRanking(rows, viewerId) {
    return rows.map((row, index) => ({
        position: index + 1,
        isMe: viewerId !== undefined && viewerId !== null && row.studentId === viewerId,
        alias: row.aliasHidden ? 'Jugador oculto' : row.alias,
        avatar: row.avatar,
        xp: row.xp,
        ...progressForXp(row.xp)
    }));
}

module.exports = { getClassRanking, buildRanking };
