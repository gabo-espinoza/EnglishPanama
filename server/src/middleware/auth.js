const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Zero trust: ademas de verificar la firma del JWT, en CADA peticion se revalida
// la cuenta contra la base. Si la cuenta no existe, esta desactivada o su version
// de token cambio, el token deja de servir aunque no haya expirado.
async function authenticate(req, res, next, { allowEnroll }) {
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
    // El token de vinculacion ("mfa_enroll") solo se acepta donde se pide expresamente.
    const isEnroll = payload.typ === 'mfa_enroll';
    if (payload.typ && payload.typ !== 'user' && !(allowEnroll && isEnroll)) {
        return res.status(401).json({ error: 'Token invalido o expirado.' });
    }

    try {
        const [rows] = await pool.query(
            'SELECT id, role, is_active, token_version FROM users WHERE id = ?',
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

// Se usa despues de requireAuth: requireRole('teacher'), requireRole('student').
function requireRole(role) {
    return (req, res, next) => {
        if (req.user?.role !== role) {
            return res.status(403).json({ error: 'No tienes permiso para acceder a este recurso.' });
        }
        next();
    };
}

module.exports = { requireAuth, requireAuthOrEnroll, requireRole };
