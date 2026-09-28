const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const SALT_ROUNDS = 10;
const CLASS_CODE_LENGTH = 6;
const CLASS_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I, para que no se confundan al escribirlo a mano

function generateClassCode() {
    let code = '';
    for (let i = 0; i < CLASS_CODE_LENGTH; i++) {
        code += CLASS_CODE_CHARS[Math.floor(Math.random() * CLASS_CODE_CHARS.length)];
    }
    return code;
}

function signToken(user) {
    return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

class AuthError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

async function registerTeacher({ username, password, displayName }) {
    if (!username || !password || !displayName) {
        throw new AuthError('Faltan datos: username, password y displayName son obligatorios.');
    }
    if (password.length < 4) {
        throw new AuthError('La contraseña debe tener al menos 4 caracteres.');
    }

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
                throw new AuthError('Ese nombre de usuario ya está en uso.', 409);
            }
            throw err;
        }

        // Reintenta si por azar el código generado ya existe (muy poco probable, pero es gratis cubrirlo).
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
    if (!username || !password || !classCode) {
        throw new AuthError('Faltan datos: username, password y classCode son obligatorios.');
    }
    if (password.length < 4) {
        throw new AuthError('La contraseña debe tener al menos 4 caracteres.');
    }

    const [teacherRows] = await pool.query(
        'SELECT user_id FROM teachers WHERE class_code = ?',
        [classCode.toUpperCase()]
    );
    if (teacherRows.length === 0) {
        throw new AuthError('El código de docente no existe.', 404);
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
                throw new AuthError('Ese nombre de usuario ya está en uso.', 409);
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

    const [rows] = await pool.query(
        'SELECT id, role, password_hash FROM users WHERE username = ?',
        [username]
    );
    if (rows.length === 0) {
        throw new AuthError('Usuario o contraseña incorrectos.', 401);
    }

    const user = rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
        throw new AuthError('Usuario o contraseña incorrectos.', 401);
    }

    return { token: signToken(user), role: user.role };
}

module.exports = { registerTeacher, registerStudent, login, AuthError };
