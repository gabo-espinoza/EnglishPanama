const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Zero trust: ademas de verificar la firma del JWT, en CADA peticion se revalida
// la cuenta contra la base. Si la cuenta no existe, esta desactivada o su version
// de token cambio, el token deja de servir aunque no haya expirado.
async function requireAuth(req, res, next) {
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
    if (payload.typ && payload.typ !== 'user') {
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
        return next();
    } catch (err) {
        return next(err);
    }
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

module.exports = { requireAuth, requireRole };
