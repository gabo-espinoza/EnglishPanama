const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Token restringido que recibe un docente recien creado: solo sirve para fijar su
// contrasena inicial. Mismo valor que PASSWORD_TOKEN_TYP en auth.service.js.
const PASSWORD_TOKEN_TYP = 'pwd_change';

// Zero trust: ademas de verificar la firma del JWT, en CADA peticion se revalida
// la cuenta contra la base. Si la cuenta no existe, esta desactivada o su version
// de token cambio, el token deja de servir aunque no haya expirado.
async function authenticate(req, res, next, { allowEnroll, allowPasswordToken }) {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Falta el token de autenticacion.' });
    }

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return res.status(401).json({ error: 'Token invalido o expirado.' });
    }

    // El token de plataforma se firma sin `typ` (o con "user"). Cualquier otro `typ`
    // se rechaza aqui: el reto de MFA ("mfa_pending") NO debe abrir rutas protegidas.
    // El token de vinculacion ("mfa_enroll") y el de contrasena inicial ("pwd_change")
    // solo se aceptan donde se piden expresamente.
    const isEnroll = payload.typ === 'mfa_enroll';
    const isPasswordToken = payload.typ === PASSWORD_TOKEN_TYP;
    // La ruta del cambio inicial acepta UNICAMENTE el token restringido.
    if (allowPasswordToken && !isPasswordToken) {
        return res.status(401).json({ error: 'Token invalido o expirado.' });
    }
    if (payload.typ && payload.typ !== 'user'
        && !(allowEnroll && isEnroll) && !(allowPasswordToken && isPasswordToken)) {
        return res.status(401).json({ error: 'Token invalido o expirado.' });
    }

    try {
        const [rows] = await pool.query(
            'SELECT id, role, is_active, token_version, must_change_password FROM users WHERE id = ?',
            [payload.id]
        );
        const user = rows[0];
        if (!user || !user.is_active) {
            return res.status(401).json({ error: 'La cuenta no esta disponible.' });
        }

        const tokenVersion = Number.isInteger(payload.tv) ? payload.tv : 0;
        if (tokenVersion !== Number(user.token_version)) {
            return res.status(401).json({ error: 'Token revocado. Vuelve a iniciar sesion.' });
        }

        // Un docente recien creado debe fijar su contrasena antes de usar la plataforma.
        // La ruta del cambio inicial (token restringido) es justo para quien tiene la bandera.
        if (!allowPasswordToken && Number(user.must_change_password) === 1) {
            return res.status(403).json({
                error: 'Debes crear tu contrasena antes de continuar.',
                code: 'PASSWORD_CHANGE_REQUIRED'
            });
        }

        // El rol se toma de la base, no del token: si cambio, manda la base.
        req.user = { id: user.id, role: user.role };
        req.enrollOnly = isEnroll;
        return next();
    } catch (err) {
        return next(err);
    }
}

// Sesion normal: rechaza el reto de MFA y el token de vinculacion.
function requireAuth(req, res, next) {
    return authenticate(req, res, next, { allowEnroll: false });
}

// Solo para /mfa/setup y /mfa/confirm: acepta ademas el token de vinculacion que
// reciben los docentes (MFA obligatorio). `req.enrollOnly` indica cual de los dos llego.
function requireAuthOrEnroll(req, res, next) {
    return authenticate(req, res, next, { allowEnroll: true });
}

// Solo para el cambio de contrasena inicial: exige el token restringido "pwd_change".
function requirePasswordToken(req, res, next) {
    return authenticate(req, res, next, { allowEnroll: false, allowPasswordToken: true });
}

// Se usa despues de requireAuth: requireRole('teacher'), requireRole('student').
function requireRole(role) {
    return (req, res, next) => {
        if (req.user?.role !== role) {
            return res.status(403).json({ error: 'No tienes permiso para acceder a este recurso.' });
        }
        next();
    };
}

module.exports = { requireAuth, requireAuthOrEnroll, requirePasswordToken, requireRole };
