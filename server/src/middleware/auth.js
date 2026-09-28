const jwt = require('jsonwebtoken');

// Verifica el JWT del header Authorization: Bearer <token> y adjunta el usuario al request.
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Falta el token de autenticación.' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload; // { id, role }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
}

// Se usa después de requireAuth: requireRole('teacher'), requireRole('student').
function requireRole(role) {
    return (req, res, next) => {
        if (req.user?.role !== role) {
            return res.status(403).json({ error: 'No tenés permiso para acceder a este recurso.' });
        }
        next();
    };
}

module.exports = { requireAuth, requireRole };
