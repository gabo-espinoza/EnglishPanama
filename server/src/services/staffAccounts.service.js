// Cuentas de gestion: listado, creacion de docentes y solicitudes de cambio con
// separacion de funciones (quien solicita no decide; solo el auditor decide).
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const audit = require('./audit.service');

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/;
const MAX_DISPLAY_NAME = 100;
const CLASS_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SALT_ROUNDS = 10;

function generateClassCode() {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
        code += CLASS_CODE_CHARS[crypto.randomInt(CLASS_CODE_CHARS.length)];
    }
    return code;
}

// Lista de cuentas de gestion SIN secretos MFA ni hashes de contrasena.
async function listAccounts() {
    const [rows] = await pool.query(
        `SELECT id, username, role, status, created_at AS createdAt
         FROM staff_accounts ORDER BY role ASC, username ASC`
    );
    return rows;
}

async function getAccount(id) {
    const [rows] = await pool.query(
        `SELECT id, username, role, status, created_at AS createdAt
         FROM staff_accounts WHERE id = ?`,
        [id]
    );
    if (rows.length === 0) throw new AppError('La cuenta de gestion no existe.', 404);
    return rows[0];
}

// --- Solicitudes de cambio de estado (suspender / activar) ---

async function createChangeRequest({ targetId, action, requestedBy }) {
    if (!['suspend', 'activate'].includes(action)) {
        throw new AppError('Accion invalida. Usa "suspend" o "activate".', 400);
    }
    if (Number(targetId) === Number(requestedBy)) {
        throw new AppError('No puedes solicitar un cambio sobre tu propia cuenta.', 400);
    }
    await getAccount(targetId); // 404 si no existe

    const [result] = await pool.query(
        `INSERT INTO staff_change_requests (target_id, action, requested_by)
         VALUES (?, ?, ?)`,
        [targetId, action, requestedBy]
    );
    await audit.record({
        actorType: 'staff', actorId: requestedBy, actorRole: 'access_manager',
        action: 'staff.change_request.create', target: `staff#${targetId}:${action}`, outcome: 'ok'
    });
    return { id: result.insertId, targetId, action, status: 'pending' };
}

async function listChangeRequests({ status } = {}) {
    const where = [];
    const params = [];
    if (status) {
        if (!['pending', 'approved', 'rejected'].includes(status)) {
            throw new AppError('Estado invalido. Usa pending, approved o rejected.', 400);
        }
        where.push('r.status = ?');
        params.push(status);
    }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.query(
        `SELECT r.id, r.target_id AS targetId, t.username AS targetUsername,
                r.action, r.requested_by AS requestedBy, r.decided_by AS decidedBy,
                r.status, r.created_at AS createdAt, r.decided_at AS decidedAt
         FROM staff_change_requests r
         JOIN staff_accounts t ON t.id = r.target_id
         ${clause}
         ORDER BY r.id DESC`,
        []
    );
    return rows;
}

// Solo el auditor llega aqui (lo garantiza la ruta). Ademas no puede decidir una
// solicitud que el mismo creo, ni sobre su propia cuenta.
async function decideChangeRequest({ id, decision, decidedBy }) {
    if (!['approved', 'rejected'].includes(decision)) {
        throw new AppError('Decision invalida. Usa "approved" o "rejected".', 400);
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query('SELECT * FROM staff_change_requests WHERE id = ? FOR UPDATE', [id]);
        const request = rows[0];
        if (!request) throw new AppError('La solicitud no existe.', 404);
        if (request.status !== 'pending') throw new AppError('La solicitud ya fue resuelta.', 409);
        if (Number(request.requested_by) === Number(decidedBy)) {
            throw new AppError('No puedes decidir una solicitud que tu mismo creaste.', 403);
        }
        if (Number(request.target_id) === Number(decidedBy)) {
            throw new AppError('No puedes decidir un cambio sobre tu propia cuenta.', 403);
        }

        await conn.query(
            `UPDATE staff_change_requests
             SET status = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [decision, decidedBy, id]
        );

        if (decision === 'approved') {
            const newStatus = request.action === 'suspend' ? 'suspended' : 'active';
            await conn.query(
                'UPDATE staff_accounts SET status = ?, token_version = token_version + 1 WHERE id = ?',
                [newStatus, request.target_id]
            );
        }

        await conn.commit();
        await audit.record({
            actorType: 'staff', actorId: decidedBy, actorRole: 'auditor',
            action: 'staff.change_request.decide',
            target: `staff#${request.target_id}:${request.action}:${decision}`, outcome: 'ok'
        });
        return { id: Number(id), status: decision };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

// --- Creacion de cuentas de docente (rol access_manager) ---

async function createTeacher({ username, displayName, actorId }) {
    if (!USERNAME_PATTERN.test(String(username || ''))) {
        throw new AppError('El usuario debe tener de 3 a 30 caracteres (letras, numeros, punto, guion o guion bajo).', 400);
    }
    const name = String(displayName || '').trim();
    if (name.length < 1 || name.length > MAX_DISPLAY_NAME) {
        throw new AppError(`El nombre debe tener entre 1 y ${MAX_DISPLAY_NAME} caracteres.`, 400);
    }

    // Contrasena temporal de un solo uso (se muestra una vez y se debe cambiar).
    const temporaryPassword = crypto.randomBytes(12).toString('base64url').slice(0, 12);
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [userResult] = await conn.query(
            'INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)',
            ['teacher', username, passwordHash]
        );
        const userId = userResult.insertId;
        const classCode = generateClassCode();
        await conn.query(
            'INSERT INTO teachers (user_id, display_name, class_code) VALUES (?, ?, ?)',
            [userId, name, classCode]
        );
        await conn.commit();

        await audit.record({
            actorType: 'staff', actorId, actorRole: 'access_manager',
            action: 'staff.teacher.create', target: `teacher:${username}`, outcome: 'ok'
        });
        return { id: userId, username, displayName: name, classCode, temporaryPassword };
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY') throw new AppError('Ese nombre de usuario ya existe.', 409);
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { listAccounts, getAccount, createChangeRequest, listChangeRequests, decideChangeRequest, createTeacher };
