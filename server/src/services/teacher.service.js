const pool = require('../config/db');
const { levelForXp } = require('./xp.service');
const { GRADE_LEVELS, isValidGrade, levelForGrade } = require('../config/classLevels');
const { getClassLevelForTeacher } = require('./classLevel.service');
const AppError = require('../utils/AppError');

// Panel docente: lista de estudiantes de la clase del docente autenticado,
// con nivel, XP, actividades completadas y promedio (%) por modulo.
async function getStudents(teacherId) {
    const [students] = await pool.query(
        `SELECT s.user_id AS userId, u.username AS alias, s.avatar, s.xp
         FROM students s
         JOIN users u ON u.id = s.user_id
         WHERE s.teacher_id = ?
         ORDER BY s.xp DESC, u.username ASC`,
        [teacherId]
    );

    // Intentos de la clase solo sobre actividades del nivel actual de la clase, ya con el modulo
    // y el total de preguntas de cada actividad (para poder sacar el porcentaje de acierto).
    // Sin grado no hay nivel y no se cuenta ningun intento.
    const level = await getClassLevelForTeacher(teacherId);
    const [attemptRows] = level === null ? [[]] : await pool.query(
        `SELECT att.student_id AS studentId,
                att.activity_id AS activityId,
                m.slug AS module,
                att.score AS score,
                q.total AS total
         FROM attempts att
         JOIN activities a ON a.id = att.activity_id
         JOIN modules m ON m.id = a.module_id
         JOIN (SELECT activity_id, COUNT(*) AS total FROM questions GROUP BY activity_id) q
              ON q.activity_id = a.id
         JOIN students s ON s.user_id = att.student_id
         WHERE s.teacher_id = ? AND a.level = ?`,
        [teacherId, level]
    );

    const byStudent = new Map();
    for (const student of students) {
        byStudent.set(student.userId, {
            userId: student.userId,
            alias: student.alias,
            avatar: student.avatar,
            xp: student.xp,
            level: levelForXp(student.xp),
            completedActivities: 0,
            averages: { vocabulary: null, grammar: null, reading: null }
        });
    }

    const completedSets = new Map();     // studentId -> Set(activityId)
    const moduleAccumulator = new Map(); // studentId -> { module -> { sum, count } }

    for (const attempt of attemptRows) {
        if (!byStudent.has(attempt.studentId)) continue;

        if (!completedSets.has(attempt.studentId)) completedSets.set(attempt.studentId, new Set());
        completedSets.get(attempt.studentId).add(attempt.activityId);

        if (!moduleAccumulator.has(attempt.studentId)) moduleAccumulator.set(attempt.studentId, {});
        const perModule = moduleAccumulator.get(attempt.studentId);
        if (!perModule[attempt.module]) perModule[attempt.module] = { sum: 0, count: 0 };

        const percent = attempt.total > 0 ? (attempt.score / attempt.total) * 100 : 0;
        perModule[attempt.module].sum += percent;
        perModule[attempt.module].count += 1;
    }

    const result = [];
    for (const student of byStudent.values()) {
        student.completedActivities = completedSets.get(student.userId)?.size || 0;

        const perModule = moduleAccumulator.get(student.userId) || {};
        for (const module of Object.keys(student.averages)) {
            const acc = perModule[module];
            student.averages[module] = acc && acc.count > 0
                ? Math.round((acc.sum / acc.count) * 10) / 10
                : null;
        }
        result.push(student);
    }

    return result;
}

// Temas con mayor tasa de error entre los estudiantes de la clase.
async function getDifficultTopics(teacherId, limit = 10) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

    // Solo respuestas sobre actividades del nivel actual de la clase; sin grado, lista vacia.
    const level = await getClassLevelForTeacher(teacherId);
    if (level === null) return [];

    const [rows] = await pool.query(
        `SELECT q.topic AS topic,
                COUNT(*) AS attempts,
                SUM(CASE WHEN aa.is_correct = 0 THEN 1 ELSE 0 END) AS errors
         FROM attempt_answers aa
         JOIN attempts att ON att.id = aa.attempt_id
         JOIN students s ON s.user_id = att.student_id
         JOIN questions q ON q.id = aa.question_id
         JOIN activities a ON a.id = q.activity_id
         WHERE s.teacher_id = ? AND a.level = ?
         GROUP BY q.topic
         ORDER BY (SUM(CASE WHEN aa.is_correct = 0 THEN 1 ELSE 0 END) / COUNT(*)) DESC, attempts DESC
         LIMIT ?`,
        [teacherId, level, safeLimit]
    );

    return rows.map((row) => ({
        topic: row.topic,
        attempts: Number(row.attempts),
        errors: Number(row.errors),
        errorRate: row.attempts > 0 ? Math.round((Number(row.errors) / Number(row.attempts)) * 1000) / 10 : 0
    }));
}

// Datos de la clase del docente: nombre, codigo, grado declarado (o null) y los grados posibles.
async function getClass(teacherId) {
    const [rows] = await pool.query(
        'SELECT display_name, class_code, grade, grade_locked_at FROM teachers WHERE user_id = ?',
        [teacherId]
    );
    if (rows.length === 0) {
        throw new AppError('El docente no existe.', 404);
    }
    const row = rows[0];
    return {
        displayName: row.display_name,
        classCode: row.class_code,
        classGrade: row.grade,
        classLevel: levelForGrade(row.grade),
        gradeLocked: row.grade_locked_at !== null,
        grades: Object.entries(GRADE_LEVELS).map(([grade, level]) => ({ grade: Number(grade), level }))
    };
}

// Declara el grado de la clase una sola vez. La escritura es atomica (UPDATE condicionado a
// grade IS NULL): si dos peticiones compiten, solo una cambia filas y la otra recibe 409.
async function declareGrade(teacherId, { grade, confirm } = {}) {
    if (confirm !== true) {
        throw new AppError('Debes confirmar que entiendes que el grado no se puede cambiar.', 400);
    }
    if (!isValidGrade(grade)) {
        throw new AppError('El grado debe ser 3, 4 o 5.', 400);
    }

    const [result] = await pool.query(
        'UPDATE teachers SET grade = ?, grade_locked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND grade IS NULL',
        [grade, teacherId]
    );
    if (result.affectedRows === 0) {
        const [rows] = await pool.query('SELECT 1 FROM teachers WHERE user_id = ?', [teacherId]);
        if (rows.length === 0) {
            throw new AppError('El docente no existe.', 404);
        }
        throw new AppError(
            'El grado ya fue declarado y no se puede cambiar. Si fue un error, pide ayuda al gestor de cuentas.',
            409,
            'GRADE_LOCKED'
        );
    }
    return getClass(teacherId);
}

module.exports = { getStudents, getDifficultTopics, getClass, declareGrade };
