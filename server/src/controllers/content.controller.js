// Fase B: controladores del ciclo de vida del contenido (modulo 6).
// Delgados: toda la logica y las transacciones viven en content.service.js.
const content = require('../services/content.service');
const { parseId } = require('../utils/ids');

const idOf = (req) => parseId(req.params.id, 'La actividad');
const qidOf = (req) => parseId(req.params.qid, 'La pregunta');

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

const detail = wrap((req) => content.getActivity(idOf(req)));
const create = wrap((req) => content.createActivity(req.staff, req.body));
const update = wrap((req) => content.updateActivity(req.staff, idOf(req), req.body));
const addQuestion = wrap((req) => content.addQuestion(req.staff, idOf(req), req.body));
const updateQuestion = wrap((req) => content.updateQuestion(
    req.staff, idOf(req), qidOf(req), req.body
));
const deleteQuestion = wrap((req) => content.deleteQuestion(
    req.staff, idOf(req), qidOf(req)
));
const remove = wrap((req) => content.deleteActivity(req.staff, idOf(req)));
const submit = wrap((req) => content.submit(req.staff, idOf(req)));
const withdraw = wrap((req) => content.withdraw(req.staff, idOf(req)));
const revision = wrap((req) => content.revision(req.staff, idOf(req)));
const archive = wrap((req) => content.archive(req.staff, idOf(req)));
const approve = wrap((req) => content.approve(req.staff, idOf(req)));
const reject = wrap((req) => content.reject(req.staff, idOf(req), req.body));

module.exports = {
    list, detail, create, update, addQuestion, updateQuestion, deleteQuestion,
    remove, submit, withdraw, revision, archive, approve, reject
};
