const jwt = require('jsonwebtoken');
const audit = require('../services/audit.service');
const { getAccountForToken } = require('../services/staffAuth.service');

function deny(res, status, message) {
    return res.status(status).json({ error: message });
}

// Protege las rutas de gestion. Revalida contra la base en CADA peticion
// (zero trust): la cuenta debe existir, estar activa, tener la misma version de
// token y (si se indica) pertenecer al area y al rol permitidos.
//
//   requireStaff()                          -> cualquier gestor con token valido
//   requireStaff({ area: 'access' })        -> gestor del area de accesos
//   requireStaff({ roles: ['auditor'] })    -> solo auditores
//   requireStaff({ area: 'content', roles: ['content_manager'] })
function requireStaff({ area, roles } = {}) {
    return async (req, res, next) => {
        const authHeader = req.headers.authorization || '';
        const [scheme, token] = authHeader.split(' ');
        if (scheme !== 'Bearer' || !token) {
            return deny(res, 401, 'Falta el token de autenticacion.');
        }

        let payload;
        try {
            payload = jwt.verify(token, process.env.STAFF_JWT_SECRET);
        } catch {
            return deny(res, 401, 'Token invalido o expirado.');
        }
        if (payload.typ !== 'staff') {
            return deny(res, 401, 'Token invalido o expirado.');
        }

        const account = await getAccountForToken(payload.sub);
        if (!account || account.status !== 'active') {
            await audit.record({
                actorType: 'staff', actorId: payload.sub, actorRole: payload.role,
                action: 'staff.access', target: req.originalUrl, outcome: 'denied', ip: req.ip
            });
            return deny(res, 403, 'Tu cuenta de gestion no esta activa.');
        }

        if (Number(payload.tv || 0) !== Number(account.token_version)) {
            return deny(res, 401, 'Token revocado. Vuelve a iniciar sesion.');
        }

        if (area && payload.aud !== area) {
            await audit.record({
                actorType: 'staff', actorId: account.id, actorRole: account.role,
                action: 'staff.access', target: req.originalUrl, outcome: 'denied', ip: req.ip
            });
            return deny(res, 403, 'No tienes permiso para acceder a esta area.');
        }

        if (roles && !roles.includes(account.role)) {
            await audit.record({
                actorType: 'staff', actorId: account.id, actorRole: account.role,
                action: 'staff.access', target: req.originalUrl, outcome: 'denied', ip: req.ip
            });
            return deny(res, 403, 'No tienes permiso para acceder a este recurso.');
        }

        req.staff = { id: account.id, username: account.username, role: account.role, area: payload.aud };
        return next();
    };
}

module.exports = { requireStaff };
