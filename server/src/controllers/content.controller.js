// Fase B: controladores del ciclo de vida del contenido (modulo 6).
// Delgados: toda la logica y las transacciones viven en content.service.js.
const content = require('../services/content.service');

function wrap(fn) {
    return async (req, res, next) => {
        try {
            res.json(await fn(req));
        } catch (err) {
            next(err);
        }
    };
}

const list = wrap((req) => content.listActivities({
    role: req.staff.role,
    status: req.query.status,
    module: req.query.module,
    level: req.query.level
}));

const detail = wrap((req) => content.getActivity(Number(req.params.id)));
const create = wrap((req) => content.createActivity(req.staff, req.body));
const update = wrap((req) => content.updateActivity(req.staff, Number(req.params.id), req.body));
const addQuestion = wrap((req) => content.addQuestion(req.staff, Number(req.params.id), req.body));
const updateQuestion = wrap((req) => content.updateQuestion(
    req.staff, Number(req.params.id), Number(req.params.qid), req.body
));
const deleteQuestion = wrap((req) => content.deleteQuestion(
    req.staff, Number(req.params.id), Number(req.params.qid)
));
const remove = wrap((req) => content.deleteActivity(req.staff, Number(req.params.id)));
const submit = wrap((req) => content.submit(req.staff, Number(req.params.id)));
const withdraw = wrap((req) => content.withdraw(req.staff, Number(req.params.id)));
const revision = wrap((req) => content.revision(req.staff, Number(req.params.id)));
const archive = wrap((req) => content.archive(req.staff, Number(req.params.id)));
const approve = wrap((req) => content.approve(req.staff, Number(req.params.id)));
const reject = wrap((req) => content.reject(req.staff, Number(req.params.id), req.body));

module.exports = {
    list, detail, create, update, addQuestion, updateQuestion, deleteQuestion,
    remove, submit, withdraw, revision, archive, approve, reject
};
