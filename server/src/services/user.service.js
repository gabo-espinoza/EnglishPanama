const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { progressForXp } = require('./xp.service');
const { levelForGrade } = require('../config/classLevels');

// El avatar es un identificador corto (ej. "default", "zorro-1"); no se guarda
// HTML ni rutas, para evitar inyeccion en el cliente.
const AVATAR_PATTERN = /^[a-z0-9_-]{1,50}$/;
const MAX_DISPLAY_NAME_LENGTH = 100;

// Perfil del usuario autenticado. Cada quien ve solo lo suyo: nunca
// password_hash ni datos de otros usuarios.
async function getProfile(userId, role) {
    if (role === 'student') {
        const [rows] = await pool.query(
            `SELECT u.username AS alias, s.avatar, s.xp,
                    s.teacher_id AS teacherId, t.class_code AS classCode, t.grade AS classGrade
             FROM students s
             JOIN users u ON u.id = s.user_id
             JOIN teachers t ON t.user_id = s.teacher_id
             WHERE s.user_id = ?`,
            [userId]
        );
        if (rows.length === 0) {
            throw new AppError('El estudiante no existe.', 404);
        }
        const student = rows[0];
        return {
            id: userId,
            role: 'student',
            alias: student.alias,
            avatar: student.avatar,
            xp: student.xp,
            teacherId: student.teacherId,
            classCode: student.classCode,
            classGrade: student.classGrade ?? null,
            classLevel: levelForGrade(student.classGrade),
            ...progressForXp(student.xp)
        };
    }

    if (role === 'teacher') {
        const [rows] = await pool.query(
            `SELECT u.username AS alias, t.display_name AS displayName, t.class_code AS classCode,
                    t.grade AS classGrade
             FROM teachers t
             JOIN users u ON u.id = t.user_id
             WHERE t.user_id = ?`,
            [userId]
        );
        if (rows.length === 0) {
            throw new AppError('El docente no existe.', 404);
        }
        const teacher = rows[0];
        return {
            id: userId,
            role: 'teacher',
            alias: teacher.alias,
            displayName: teacher.displayName,
            classCode: teacher.classCode,
            classGrade: teacher.classGrade ?? null,
            classLevel: levelForGrade(teacher.classGrade)
        };
    }

    throw new AppError('Rol de usuario desconocido.', 403);
}

// Actualiza el perfil propio: el estudiante puede cambiar su avatar y el
// docente su nombre para mostrar. El nombre de usuario (login) nunca cambia.
async function updateProfile(userId, role, data) {
    const body = data || {};

    if (role === 'student') {
        if (body.avatar === undefined) {
            throw new AppError('No hay campos validos para actualizar (avatar).');
        }
        const avatar = String(body.avatar).trim().toLowerCase();
        if (!AVATAR_PATTERN.test(avatar)) {
            throw new AppError('El avatar debe ser un identificador corto (letras, numeros, guion o guion bajo).');
        }
        const [result] = await pool.query(
            'UPDATE students SET avatar = ? WHERE user_id = ?',
            [avatar, userId]
        );
        if (result.affectedRows === 0) {
            throw new AppError('El estudiante no existe.', 404);
        }
    } else if (role === 'teacher') {
        if (body.displayName === undefined) {
            throw new AppError('No hay campos validos para actualizar (displayName).');
        }
        const displayName = String(body.displayName).trim();
        if (!displayName) {
            throw new AppError('El nombre para mostrar es obligatorio.');
        }
        if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
            throw new AppError('El nombre para mostrar es demasiado largo.');
        }
        const [result] = await pool.query(
            'UPDATE teachers SET display_name = ? WHERE user_id = ?',
            [displayName, userId]
        );
        if (result.affectedRows === 0) {
            throw new AppError('El docente no existe.', 404);
        }
    } else {
        throw new AppError('Rol de usuario desconocido.', 403);
    }

    return getProfile(userId, role);
}

module.exports = { getProfile, updateProfile };
