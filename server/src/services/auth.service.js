const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const totp = require('../utils/totp');
const mfaCrypto = require('../utils/mfaCrypto');
const audit = require('./audit.service');

const SALT_ROUNDS = 10;

// Validacion de entrada: el nombre de usuario solo admite caracteres seguros
// (letras, numeros, punto, guion y guion bajo) y un largo acotado.
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/;
const MAX_PASSWORD_LENGTH = 72; // bcrypt solo usa los primeros 72 bytes

const PLATFORM_LOCK_SECONDS = 10;
const PLATFORM_MAX_FAILED = 3;

let dummyHashPlatform = null;
async function timingSafeCheckPlatform(password) {
    if (!dummyHashPlatform) {
        dummyHashPlatform = await bcrypt.hash('english-panama-platform-equalizer', 10);
    }
    if (typeof password === 'string' && password.length > 0) {
        await bcrypt.compare(password, dummyHashPlatform);
    }
}

// Sesion de usuario de plataforma (estudiante/docente): 2 horas.
// Las cuentas de gestion tienen su propia sesion corta (20 min) en staffAuth.service.
const PLATFORM_SESSION = '2h';

// Reto intermedio entre la contrasena y el codigo TOTP. Se firma con el mismo
// secreto de plataforma pero con un `typ` propio y dura 5 minutos. NO sirve en
// rutas protegidas: requireAuth rechaza cualquier token con `typ` distinto de "user".
// Asi, tener la contrasena no entrega nunca el JWT real si la cuenta tiene MFA.
const MFA_CHALLENGE_TYP = 'mfa_pending';
const MFA_CHALLENGE_MINUTES = 5;

// Tiempo que vale un secreto recien generado para vincular el autenticador.
const MFA_ENROLL_MINUTES = 10;

// El MFA es obligatorio para estos roles. Un docente sin autenticador vinculado NO
// recibe sesion: recibe un token de vinculacion que solo abre /mfa/setup y /mfa/confirm.
// (Estudiantes: el MFA sigue siendo opcional.)
const MFA_REQUIRED_ROLES = ['teacher'];
const MFA_ENROLL_TYP = 'mfa_enroll';
const MFA_ENROLL_SESSION_MINUTES = 15;

function signToken(user) {
    return jwt.sign(
        { id: user.id, role: user.role, tv: user.token_version || 0 },
        process.env.JWT_SECRET,
        { expiresIn: PLATFORM_SESSION }
    );
}

// Token temporal del primer factor: identifica al usuario ya validado por contrasena
// pero no autoriza nada por si mismo.
function signMfaChallenge(user) {
    return jwt.sign(
        { id: user.id, typ: MFA_CHALLENGE_TYP, tv: user.token_version || 0 },
        process.env.JWT_SECRET,
        { expiresIn: `${MFA_CHALLENGE_MINUTES}m` }
    );
}

// Token de vinculacion obligatoria: identifica al usuario ya validado por contrasena,
// pero requireAuth lo rechaza (typ distinto de "user"): solo sirve para vincular el
// autenticador. Al confirmar el primer codigo, el servidor entrega la sesion real.
function signEnrollToken(user) {
    return jwt.sign(
        { id: user.id, typ: MFA_ENROLL_TYP, tv: user.token_version || 0 },
        process.env.JWT_SECRET,
        { expiresIn: `${MFA_ENROLL_SESSION_MINUTES}m` }
    );
}

function enrollmentRequired(user) {
    return {
        mfaSetupRequired: true,
        enrollToken: signEnrollToken(user),
        expiresIn: MFA_ENROLL_SESSION_MINUTES * 60
    };
}

// Columnas que necesita el login y la verificacion del segundo factor.
const LOGIN_COLUMNS = 'id, role, password_hash, is_active, token_version, failed_attempts, '
    + 'locked_until, mfa_secret_enc, (locked_until > NOW()) AS is_locked';

// Suma un fallo y, al llegar a 3, bloquea 10 segundos (regla acordada de esta fase).
async function registerFailedAttempt(user) {
    const attempts = (user.failed_attempts || 0) + 1;
    if (attempts >= PLATFORM_MAX_FAILED) {
        await pool.query(
            'UPDATE users SET failed_attempts = 0, locked_until = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?',
            [PLATFORM_LOCK_SECONDS, user.id]
        );
    } else {
        await pool.query('UPDATE users SET failed_attempts = ? WHERE id = ?', [attempts, user.id]);
    }
}

async function clearLock(user) {
    if (user.failed_attempts || user.locked_until) {
        await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
    }
}

// Compara un codigo TOTP contra un secreto cifrado sin filtrar por que falla.
function codeMatches(encryptedSecret, code) {
    try {
        return totp.verifyToken(mfaCrypto.decrypt(encryptedSecret), code);
    } catch {
        return false;
    }
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

    // El bloqueo lo decide MySQL con su propio reloj (locked_until > NOW()): asi la
    // comprobacion no depende de la zona horaria en la que corra el servidor Node.
    const [rows] = await pool.query(
        `SELECT ${LOGIN_COLUMNS} FROM users WHERE username = ?`,
        [username]
    );
    if (rows.length === 0) {
        // Equaliza el tiempo de respuesta: sin esta llamada, no encontrar al usuario
        // es mas rapido que comparar un hash y permite enumerar cuentas.
        await timingSafeCheckPlatform(password);
        throw new AuthError('Usuario o contrasena incorrectos.', 401);
    }

    const user = rows[0];

    // Cuenta bloqueada por intentos fallidos: se responde con el mismo mensaje
    // generico para no revelar que existe ni por que esta bloqueada.
    if (Number(user.is_locked) === 1) {
        throw new AuthError('Usuario o contrasena incorrectos.', 401);
    }

    const passwordMatches = typeof password === 'string' && password.length > 0
        ? await bcrypt.compare(password, user.password_hash)
        : false;

    if (!passwordMatches || !user.is_active) {
        // Cuenta invalida o suspendida: se incrementa el contador de intentos y,
        // al llegar a 3, se bloquea 10 segundos (regla acordada para esta fase).
        if (user.is_active) {
            await registerFailedAttempt(user);
        }
        throw new AuthError('Usuario o contrasena incorrectos.', 401);
    }

    // Primer factor correcto. Si la cuenta tiene MFA activo NO se entrega el JWT:
    // se devuelve un reto corto para completar el codigo TOTP.
    if (user.mfa_secret_enc) {
        return {
            mfaRequired: true,
            mfaToken: signMfaChallenge(user),
            expiresIn: MFA_CHALLENGE_MINUTES * 60
        };
    }

    // Sin MFA: se limpia el bloqueo previo.
    await clearLock(user);

    // MFA obligatorio (docentes): sin autenticador vinculado no hay sesion; se devuelve
    // un token de vinculacion para escanear el codigo en el primer inicio de sesion.
    if (MFA_REQUIRED_ROLES.includes(user.role)) {
        return enrollmentRequired(user);
    }

    // Rol con MFA opcional y sin MFA: se entrega la sesion normal.
    return { token: signToken(user), role: user.role };
}

// Segundo factor: recibe el reto del primer paso y el codigo del autenticador.
// Solo si ambos son validos se emite el JWT de plataforma.
async function verifyMfa({ mfaToken, totp: code }) {
    if (!mfaToken) {
        throw new AuthError('Falta el reto de verificacion.', 400);
    }

    let payload;
    try {
        payload = jwt.verify(mfaToken, process.env.JWT_SECRET);
    } catch {
        throw new AuthError('El reto de verificacion expiro. Vuelve a iniciar sesion.', 401);
    }
    // Un JWT normal de plataforma (typ "user" o sin typ) no debe servir aqui.
    if (payload.typ !== MFA_CHALLENGE_TYP) {
        throw new AuthError('El reto de verificacion no es valido.', 401);
    }

    const [rows] = await pool.query(
        `SELECT ${LOGIN_COLUMNS} FROM users WHERE id = ?`,
        [payload.id]
    );
    const user = rows[0];
    if (!user || !user.is_active || !user.mfa_secret_enc) {
        throw new AuthError('No se pudo completar la verificacion.', 401);
    }
    if (Number(user.is_locked) === 1) {
        throw new AuthError('Demasiados intentos. Espera unos segundos.', 401);
    }
    if (Number(payload.tv || 0) !== Number(user.token_version)) {
        throw new AuthError('La sesion fue revocada. Vuelve a iniciar sesion.', 401);
    }

    if (!codeMatches(user.mfa_secret_enc, code)) {
        // El codigo incorrecto cuenta para el bloqueo de 3 intentos / 10 segundos.
        await registerFailedAttempt(user);
        throw new AuthError('Codigo incorrecto.', 401);
    }

    await clearLock(user);
    return { token: signToken(user), role: user.role };
}

// Paso 1 de la vinculacion: genera un secreto y devuelve el URI otpauth para que el
// usuario lo escanee. El secreto queda PENDIENTE: el MFA no se activa hasta confirmar.
async function setupMfa({ userId, totp: code, enrollOnly = false }) {
    const [rows] = await pool.query(
        'SELECT id, username, is_active, mfa_secret_enc FROM users WHERE id = ?',
        [userId]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
        throw new AuthError('La cuenta no esta disponible.', 401);
    }

    // Un token de vinculacion solo sirve mientras la cuenta NO tiene MFA: no puede
    // reemplazar un autenticador ya activo.
    if (enrollOnly && user.mfa_secret_enc) {
        throw new AuthError('La cuenta ya tiene un autenticador vinculado.', 409);
    }

    // Si ya hay un segundo factor activo, para volver a vincular hay que demostrar
    // que se tiene el actual: asi una sesion robada no puede reemplazar el MFA.
    if (user.mfa_secret_enc && !codeMatches(user.mfa_secret_enc, code)) {
        throw new AuthError('Para volver a vincular, indica el codigo actual del autenticador.', 401);
    }

    const secret = totp.generateSecret();
    await pool.query(
        'UPDATE users SET mfa_pending_enc = ?, mfa_pending_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
        [mfaCrypto.encrypt(secret), MFA_ENROLL_MINUTES, user.id]
    );

    return {
        otpauthUri: totp.keyUri({ secret, label: user.username }),
        expiresIn: MFA_ENROLL_MINUTES * 60
    };
}

// Paso 2 de la vinculacion: si el codigo coincide con el secreto pendiente, el MFA
// queda activo para esa cuenta. Hasta este punto la cuenta sigue entrando con solo
// contrasena.
async function confirmMfa({ userId, totp: code, enrollOnly = false }) {
    const [rows] = await pool.query(
        'SELECT id, role, token_version, mfa_secret_enc, mfa_pending_enc, (mfa_pending_expires_at > NOW()) AS pending_valid FROM users WHERE id = ?',
        [userId]
    );
    const user = rows[0];
    if (enrollOnly && user && user.mfa_secret_enc) {
        throw new AuthError('La cuenta ya tiene un autenticador vinculado.', 409);
    }
    if (!user || !user.mfa_pending_enc) {
        throw new AuthError('No hay una vinculacion en curso.', 400);
    }
    if (Number(user.pending_valid) !== 1) {
        await pool.query('UPDATE users SET mfa_pending_enc = NULL, mfa_pending_expires_at = NULL WHERE id = ?', [user.id]);
        throw new AuthError('La vinculacion expiro. Genera un codigo nuevo.', 401);
    }
    if (!codeMatches(user.mfa_pending_enc, code)) {
        throw new AuthError('El codigo no coincide con el QR. Intenta de nuevo.', 401);
    }

    await pool.query(
        'UPDATE users SET mfa_secret_enc = mfa_pending_enc, mfa_pending_enc = NULL, mfa_pending_expires_at = NULL WHERE id = ?',
        [user.id]
    );

    // Vinculacion obligatoria: el primer codigo correcto completa tambien el inicio de
    // sesion, para que el docente no tenga que volver a escribir sus datos.
    if (enrollOnly) {
        return { mfaEnabled: true, token: signToken(user), role: user.role };
    }
    return { mfaEnabled: true };
}

// Cambio de contrasena propio (el usuario ya tiene sesion). Pensado, sobre todo, para que un
// docente cambie la contrasena temporal con la que el gestor de accesos le creo la cuenta.
// Exige la contrasena actual: asi una sesion robada no basta para quedarse con la cuenta.
// Un intento fallido cuenta para el bloqueo de 3 intentos / 10 segundos.
async function changePassword({ userId, currentPassword, newPassword }) {
    if (!currentPassword || !newPassword) {
        throw new AuthError('Faltan datos: currentPassword y newPassword son obligatorios.');
    }
    validatePassword(newPassword);

    const [rows] = await pool.query(`SELECT ${LOGIN_COLUMNS} FROM users WHERE id = ?`, [userId]);
    const user = rows[0];
    if (!user || !user.is_active) {
        throw new AuthError('La cuenta no esta disponible.', 401);
    }
    if (Number(user.is_locked) === 1) {
        throw new AuthError('Demasiados intentos. Espera unos segundos.', 401);
    }

    const currentMatches = typeof currentPassword === 'string'
        && currentPassword.length <= MAX_PASSWORD_LENGTH
        && await bcrypt.compare(currentPassword, user.password_hash);
    if (!currentMatches) {
        await registerFailedAttempt(user);
        await audit.record({
            actorType: user.role, actorId: user.id, actorRole: user.role,
            action: 'user.password.change', outcome: 'denied'
        });
        throw new AuthError('La contrasena actual no es correcta.', 401);
    }
    if (currentPassword === newPassword) {
        throw new AuthError('La contrasena nueva debe ser distinta de la actual.', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    // token_version + 1 revoca todas las sesiones abiertas (por ejemplo, la de quien conozca la
    // contrasena temporal); se entrega una sesion nueva para que esta no tenga que volver a entrar.
    await pool.query(
        'UPDATE users SET password_hash = ?, token_version = token_version + 1, failed_attempts = 0, locked_until = NULL WHERE id = ?',
        [passwordHash, user.id]
    );
    await audit.record({
        actorType: user.role, actorId: user.id, actorRole: user.role,
        action: 'user.password.change', outcome: 'ok'
    });
    return { token: signToken({ ...user, token_version: Number(user.token_version) + 1 }), role: user.role };
}

module.exports = {
    registerStudent,
    changePassword,
    login,
    verifyMfa,
    setupMfa,
    confirmMfa,
    AuthError,
    MFA_CHALLENGE_TYP,
    MFA_ENROLL_TYP,
    MFA_REQUIRED_ROLES
};
