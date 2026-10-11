const staffAccounts = require('../services/staffAccounts.service');
const staffAnalytics = require('../services/staffAnalytics.service');

// GET /api/staff/accounts - lista de cuentas de gestion (sin secretos)
async function listAccounts(req, res, next) {
    try {
        res.json({ accounts: await staffAccounts.listAccounts() });
    } catch (err) {
        next(err);
    }
}

// POST /api/staff/change-requests - el gestor de accesos solicita suspender/activar
async function createChangeRequest(req, res, next) {
    try {
        const { targetId, action } = req.body || {};
        const request = await staffAccounts.createChangeRequest({
            targetId, action, requestedBy: req.staff.id
        });
        res.status(201).json(request);
    } catch (err) {
        next(err);
    }
}

// GET /api/staff/change-requests?status=
async function listChangeRequests(req, res, next) {
    try {
        const requests = await staffAccounts.listChangeRequests({ status: req.query.status });
        res.json({ requests });
    } catch (err) {
        next(err);
    }
}

// POST /api/staff/change-requests/:id/decision - solo el auditor decide
async function decideChangeRequest(req, res, next) {
    try {
        const { decision } = req.body || {};
        const result = await staffAccounts.decideChangeRequest({
            id: Number(req.params.id), decision, decidedBy: req.staff.id
        });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

// POST /api/staff/teachers - el gestor de accesos crea una cuenta de docente
async function createTeacher(req, res, next) {
    try {
        const { username, displayName } = req.body || {};
        const teacher = await staffAccounts.createTeacher({
            username, displayName, actorId: req.staff.id
        });
        res.status(201).json(teacher);
    } catch (err) {
        next(err);
    }
}

// GET /api/staff/analytics/dashboard - metricas agregadas y anonimas
async function analytics(req, res, next) {
    try {
        res.json(await staffAnalytics.dashboard());
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listAccounts,
    createChangeRequest,
    listChangeRequests,
    decideChangeRequest,
    createTeacher,
    analytics
};
