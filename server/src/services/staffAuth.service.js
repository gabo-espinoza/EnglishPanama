// Autenticacion de las cuentas de gestion (personal).
//
// Login con contrasena + TOTP. Sesion corta (20 minutos) firmada con un secreto
// distinto al de estudiantes/docentes (STAFF_JWT_SECRET). Tras 5 fallos la cuenta
// se bloquea 15 minutos. Cada intento queda en auditoria.
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const totp = require('../utils/totp');
const mfaCrypto = require('../utils/mfaCrypto');
const audit = require('./audit.service');
const { areaForRole } = require('../config/staffRoles');

const MAX_FAILED = 3;
const LOCK_SECONDS = 10;
const STAFF_SESSION_MINUTES = 20;


let dummyHashStaff = null;
async function timingSafeCheckStaff(password) {
    if (!dummyHashStaff) {
        dummyHashStaff = await bcrypt.hash('english-panama-timing-equalizer-staff', 10);
    }
    if (typeof password === 'string' && password.length > 0) {
        await bcrypt.compare(password, dummyHashStaff);
    }
}
function staffSecret() {
    const secret = process.env.STAFF_JWT_SECRET;
    if (!secret) throw new Error('Falta STAFF_JWT_SECRET en el entorno.');
    return secret;
}

// El token lleva: sub (id), typ "staff", role, aud (area) y tv (version para revocar).
function signToken(account) {
    return jwt.sign(
        {
            sub: account.id,
            typ: 'staff',
            role: account.role,
            aud: areaForRole(account.role),
            tv: account.token_version
        },
        staffSecret(),
        { expiresIn: `${STAFF_SESSION_MINUTES}m` }
    );
}

// Mismo mensaje para credencial invalida, TOTP invalido, cuenta suspendida o bloqueada:
// asi no se filtra si el usuario existe.
function invalidCredentials() {
    return new AppError('Usuario, contrasena o codigo incorrectos.', 401);
}

async function login({ username, password, totp: code, ip }) {
    const [rows] = await pool.query('SELECT * FROM staff_accounts WHERE username = ?', [username]);
    const account = rows[0];

    if (!account) {
        await audit.record({ actorType: 'staff', action: 'staff.login', target: username, outcome: 'denied', ip });
        throw invalidCredentials();
    }

    const locked = account.locked_until && new Date(account.locked_until) > new Date();
    if (account.status !== 'active' || locked) {
        await audit.record({
            actorType: 'staff', actorId: account.id, actorRole: account.role,
            action: 'staff.login', target: account.username, outcome: 'denied', ip
        });
        throw invalidCredentials();
    }

    const passwordOk = typeof password === 'string' && password.length > 0
        ? await bcrypt.compare(password, account.password_hash)
        : false;

    let totpOk = false;
    if (passwordOk) {
        try {
            totpOk = totp.verifyToken(mfaCrypto.decrypt(account.mfa_secret_enc), code);
        } catch {
            totpOk = false;
        }
    }

    if (!passwordOk || !totpOk) {
        const attempts = account.failed_attempts + 1;
        if (attempts >= MAX_FAILED) {
            await pool.query(
                'UPDATE staff_accounts SET failed_attempts = 0, locked_until = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?',
                [LOCK_MINUTES, account.id]
            );
        } else {
            await pool.query('UPDATE staff_accounts SET failed_attempts = ? WHERE id = ?', [attempts, account.id]);
        }
        await audit.record({
            actorType: 'staff', actorId: account.id, actorRole: account.role,
            action: 'staff.login', target: account.username, outcome: 'denied', ip
        });
        throw invalidCredentials();
    }

    await pool.query('UPDATE staff_accounts SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [account.id]);
    const token = signToken(account);
    await audit.record({
        actorType: 'staff', actorId: account.id, actorRole: account.role,
        action: 'staff.login', target: account.username, outcome: 'ok', ip
    });

    return {
        token,
        role: account.role,
        area: areaForRole(account.role),
        expiresIn: STAFF_SESSION_MINUTES * 60
    };
}

// Revalida la cuenta en cada peticion: si fue suspendida, cambio de rol o su
// version de token cambio, el token deja de servir aunque no haya expirado.
async function getAccountForToken(id) {
    const [rows] = await pool.query(
        'SELECT id, username, role, status, token_version FROM staff_accounts WHERE id = ?',
        [id]
    );
    return rows[0] || null;
}

module.exports = { login, getAccountForToken, signToken, STAFF_SESSION_MINUTES };
