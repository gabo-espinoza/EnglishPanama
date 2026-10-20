const pool = require('../config/db');
const { levelForGrade } = require('../config/classLevels');

// Nivel (A1.x) de la clase del estudiante, o null si el docente aun no declaro grado
// (o el estudiante no existe). Es la unica fuente para filtrar actividades por clase.
async function getClassLevelForStudent(studentId) {
    const [rows] = await pool.query(
        'SELECT t.grade FROM students s JOIN teachers t ON t.user_id = s.teacher_id WHERE s.user_id = ?',
        [studentId]
    );
    if (rows.length === 0) return null;
    return levelForGrade(rows[0].grade);
}

module.exports = { getClassLevelForStudent };
