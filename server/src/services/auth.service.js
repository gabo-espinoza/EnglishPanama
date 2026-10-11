const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const SALT_ROUNDS = 10;
const CLASS_CODE_LENGTH = 6;
const CLASS_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I, para que no se confundan al escribirlo a mano

// Validacion de entrada: el nombre de usuario solo admite caracteres seguros
// (letras, numeros, punto, guion y guion bajo) y un largo acotado.
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/;
const MAX_PASSWORD_LENGTH = 72; // bcrypt solo usa los primeros 72 bytes
const MAX_DISPLAY_NAME_LENGTH = 100;

function generateClassCode() {
    let code = '';
    for (let i = 0; i < CLASS_CODE_LENGTH; i++) {
        code += CLASS_CODE_CHARS[Math.floor(Math.random() * CLASS_CODE_CHARS.length)];
    }
    return code;
}

// Sesion de usuario de plataforma (estudiante/docente): 2 horas.
// Las cuentas de gestion tienen su propia sesion corta (20 min) en staffAuth.service.
const PLATFORM_SESSION = '2h';

function signToken(user) {
    return jwt.sign(
        { id: user.id, role: user.role, tv: user.token_version || 0 },
        process.env.JWT_SECRET,
        { expiresIn: PLATFORM_SESSION }
    );
}

class AuthError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

function validateUsername(username) {
    if (!username) {
        throw new AuthError('El nombre de usuario es obligatorio.');
    }
    if (!USERNAME_PATTERN.test(username)) {
        throw new AuthError(
            'El nombre de usuario debe tener entre 3 y 30 caracteres y solo puede incluir letras, numeros, punto, guion o guion bajo.'
        );
    }
}

function validatePassword(password) {
    if (!password) {
        throw new AuthError('La contrasena es obligatoria.');
    }
    if (password.length < 4) {
        throw new AuthError('La contrasena debe tener al menos 4 caracteres.');
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
        throw new AuthError('La contrasena es demasiado larga.');
    }
}

async function registerTeacher({ username, password, displayName }) {
    if (!displayName) {
        throw new AuthError('Faltan datos: displayName es obligatorio.');
    }
    if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
        throw new AuthError('El nombre para mostrar es demasiado largo.');
    }
    validateUsername(username);
    validatePassword(password);

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        let userId;
        try {
            const [userResult] = await connection.query(
                'INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)',
                ['teacher', username, passwordHash]
            );
            userId = userResult.insertId;
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                throw new AuthError('Ese nombre de usuario ya esta en uso.', 409);
            }
            throw err;
        }

        // Reintenta si por azar el codigo generado ya existe (muy poco probable, pero es gratis cubrirlo).
        let classCode;
        for (let attempt = 0; attempt < 5; attempt++) {
            classCode = generateClassCode();
            try {
                await connection.query(
                    'INSERT INTO teachers (user_id, display_name, class_code) VALUES (?, ?, ?)',
                    [userId, displayName, classCode]
                );
                break;
            } catch (err) {
                if (err.code === 'ER_DUP_ENTRY' && attempt < 4) continue;
                throw err;
            }
        }

        await connection.commit();
        return { token: signToken({ id: userId, role: 'teacher' }), classCode };
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

async function registerStudent({ username, password, classCode }) {
    if (!classCode) {
        throw new AuthError('Faltan datos: classCode es obligatorio.');
    }
    validateUsername(username);
    validatePassword(password);

    const [teacherRows] = await pool.query(
        'SELECT user_id FROM teachers WHERE class_code = ?',
        [classCode.toUpperCase()]
    );
    if (teacherRows.length === 0) {
        throw new AuthError('El codigo de docente no existe.', 404);
    }
    const teacherId = teacherRows[0].user_id;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        let userId;
        try {
            const [userResult] = await connection.query(
                'INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)',
                ['student', username, passwordHash]
            );
            userId = userResult.insertId;
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                throw new AuthError('Ese nombre de usuario ya esta en uso.', 409);
            }
            throw err;
        }

        await connection.query(
            'INSERT INTO students (user_id, teacher_id) VALUES (?, ?)',
            [userId, teacherId]
        );

        await connection.commit();
        return { token: signToken({ id: userId, role: 'student' }) };
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

async function login({ username, password }) {
    if (!username || !password) {
        throw new AuthError('Faltan datos: username y password son obligatorios.');
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
        throw new AuthError('Usuario o contrasena incorrectos.', 401);
    }

    const [rows] = await pool.query(
        'SELECT id, role, password_hash, is_active, token_version FROM users WHERE username = ?',
        [username]
    );
    if (rows.length === 0) {
        throw new AuthError('Usuario o contrasena incorrectos.', 401);
    }

    const user = rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches || !user.is_active) {
        throw new AuthError('Usuario o contrasena incorrectos.', 401);
    }

    return { token: signToken(user), role: user.role };
}

module.exports = { registerTeacher, registerStudent, login, AuthError };
