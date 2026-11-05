// Fase C: reportes. Un router publico (estudiantes/docentes) y otro de gestion.
const reports = require('../services/reports.service');

function wrap(fn) {
    return async (req, res, next) => {
        try { res.json(await fn(req)); } catch (err) { next(err); }
    };
}

const create = wrap((req) => reports.createReport({
    userId: req.user.id,
    role: req.user.role,
    kind: (req.body || {}).kind,
    activityId: (req.body || {}).activityId,
    questionId: (req.body || {}).questionId,
    note: (req.body || {}).note
}));

const list = wrap((req) => reports.listReports({
    role: req.staff.role,
    status: req.query.status,
    kind: req.query.kind
}));

const decide = wrap((req) => reports.decide(
    req.staff, Number(req.params.id), (req.body || {}).decision
));

module.exports = { create, list, decide };
