const audit = require('../services/audit.service');

// GET /api/staff/audit?actorType=&actorRole=&action=&from=&to=&limit=&offset=
async function listAudit(req, res, next) {
    try {
        const { actorType, actorRole, action, from, to, limit, offset } = req.query;
        const result = await audit.list({ actorType, actorRole, action, from, to, limit, offset });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

// GET /api/staff/audit/verify - comprueba la cadena de hashes del registro
async function verifyAudit(req, res, next) {
    try {
        res.json(await audit.verify());
    } catch (err) {
        next(err);
    }
}

module.exports = { listAudit, verifyAudit };
