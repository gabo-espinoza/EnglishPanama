const staffAuth = require('../services/staffAuth.service');
const staffAccounts = require('../services/staffAccounts.service');

// POST /api/staff/auth/login  (publico) - contrasena + TOTP
async function login(req, res, next) {
    try {
        const { username, password, totp } = req.body || {};
        const result = await staffAuth.login({ username, password, totp, ip: req.ip });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

// GET /api/staff/me - datos de la propia cuenta (sin secretos)
async function me(req, res, next) {
    try {
        const account = await staffAccounts.getAccount(req.staff.id);
        res.json({ ...account, area: req.staff.area });
    } catch (err) {
        next(err);
    }
}

module.exports = { login, me };
