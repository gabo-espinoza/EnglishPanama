const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { progressForXp, XP_PER_LEVEL } = require('./xp.service');
const game = require('./game.service');
const { levelForGrade } = require('../config/classLevels');

// El avatar es un identificador corto (ej. "default", "zorro-1"); no se guarda
// HTML ni rutas, para evitar inyeccion en el cliente.
const AVATAR_PATTERN = /^[a-z0-9_-]{1,50}$/;
const MAX_DISPLAY_NAME_LENGTH = 100;

// Validacion pura del texto que escribe el docente en su perfil (diseno §5.6):
// el backend no debe guardar caracteres de control ni marcado HTML. React escapa
// la salida, pero la validacion se hace aqui, antes de escribir en la base.
function validateDisplayName(value) {
    if (typeof value !== 'string') {
        throw new AppError('El nombre para mostrar no es valido.', 400);
    }
    const name = value.trim();
    if (!name) {
        throw new AppError('El nombre para mostrar es obligatorio.', 400);
    }
    if (name.length > MAX_DISPLAY_NAME_LENGTH) {
        throw new AppError('El nombre para mostrar es demasiado largo.', 400);
    }
    if (/[\x00-\x1f\x7f<>]/.test(name)) {
        throw new AppError('El nombre para mostrar tiene caracteres no permitidos.', 400);
    }
    return name;
}

// Funcion pura (sin base): arma el perfil del estudiante con el nivel segun `rules.xpPerLevel`.
function buildStudentProfile(userId, student, rules = {}) {
    const perLevel = rules.xpPerLevel ?? XP_PER_LEVEL;
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
        ...progressForXp(student.xp, perLevel)
    };
}

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
        // Una sola lectura de reglas por peticion.
        const rules = await game.getRules();
        return buildStudentProfile(userId, rows[0], rules);
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
        const displayName = validateDisplayName(body.displayName);
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

module.exports = { getProfile, updateProfile, validateDisplayName, buildStudentProfile };
