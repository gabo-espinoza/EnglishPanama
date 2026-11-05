// Fase C: reportes de contenido (modulos 8 Comunidad y 9 Soporte).
// Estudiantes y docentes reportan; support ve errores, moderator lo inadecuado,
// y el content_manager recibe los escalados. Nunca se exponen datos personales.
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const audit = require('./audit.service');

const KINDS = ['error', 'inappropriate'];
const STATUSES = ['open', 'escalated', 'resolved', 'dismissed'];
const MAX_NOTE = 300;

function cleanNote(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') throw new AppError('La nota debe ser texto.', 400);
    const note = value.trim();
    if (note.length > MAX_NOTE) throw new AppError('La nota es demasiado larga.', 400);
    if (/[\x00-\x1f\x7f<>]/.test(note)) throw new AppError('La nota tiene caracteres no permitidos.', 400);
    return note;
}

function positiveInt(value, name) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) throw new AppError(`${name} no es valido.`, 400);
    return n;
}

// Un reporte abierto por persona y pregunta (o por actividad si no hay pregunta).
async function createReport({ userId, role, kind, activityId, questionId, note }) {
    if (!KINDS.includes(kind)) throw new AppError('Tipo de reporte no valido.', 400);
    const aid = positiveInt(activityId, 'La actividad');
    const qid = questionId === undefined || questionId === null || questionId === ''
        ? null : positiveInt(questionId, 'La pregunta');
    const text = cleanNote(note);

    const [activities] = await pool.query(
        "SELECT id FROM activities WHERE id = ? AND status = 'published'", [aid]
    );
    if (activities.length === 0) throw new AppError('La actividad reportada no existe.', 404);
    if (qid !== null) {
        const [questions] = await pool.query(
            'SELECT id FROM questions WHERE id = ? AND activity_id = ?', [qid, aid]
        );
        if (questions.length === 0) throw new AppError('La pregunta no pertenece a esa actividad.', 400);
    }
    const [open] = await pool.query(
        `SELECT id FROM content_reports
         WHERE reporter_id = ? AND kind = ? AND activity_id = ?
           AND question_id <=> ? AND status IN ('open','escalated')`,
        [userId, kind, aid, qid]
    );
    if (open.length > 0) {
        throw new AppError('Ya tienes un reporte abierto sobre este contenido.', 409, 'ALREADY_REPORTED');
    }

    const [result] = await pool.query(
        `INSERT INTO content_reports (kind, activity_id, question_id, reporter_id, reporter_role, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [kind, aid, qid, userId, role, text]
    );
    await audit.record({
        actorType: role, actorId: userId, actorRole: role,
        action: 'content.report.create', target: `report:${result.insertId}`, outcome: 'ok'
    });
    return { id: result.insertId, kind, status: 'open' };
}

// Cada rol de gestion ve solo su bandeja: minimo privilegio (diseno §2.4).
function scopeForRole(role) {
    if (role === 'support') return { kind: 'error' };
    if (role === 'moderator') return { kind: 'inappropriate' };
    if (role === 'content_manager') return { status: 'escalated' };
    return null;
}

async function listReports({ role, status, kind }) {
    const scope = scopeForRole(role);
    const where = [];
    const params = [];
    if (scope && scope.kind) { where.push('r.kind = ?'); params.push(scope.kind); }
    if (scope && scope.status) { where.push('r.status = ?'); params.push(scope.status); }
    if (status !== undefined) {
        if (!STATUSES.includes(status)) throw new AppError('Estado no valido.', 400);
        where.push('r.status = ?'); params.push(status);
    }
    if (kind !== undefined) {
        if (!KINDS.includes(kind)) throw new AppError('Tipo no valido.', 400);
        // Nunca se permite saltar el limite del propio rol.
        if (!scope || !scope.kind || scope.kind !== kind) {
            throw new AppError('No puedes consultar ese tipo de reporte.', 403);
        }
    }
    const [rows] = await pool.query(
        `SELECT r.id, r.kind, r.activity_id AS activityId, r.question_id AS questionId,
                r.reporter_role AS reporterRole, u.username AS reporterAlias,
                u.is_active AS reporterActive, r.note, r.status, r.created_at AS createdAt,
                r.handled_by AS handledBy, a.title AS activityTitle
         FROM content_reports r
         JOIN users u ON u.id = r.reporter_id
         LEFT JOIN activities a ON a.id = r.activity_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY r.created_at DESC, r.id DESC LIMIT 200`,
        params
    );
    return rows.map((r) => ({ ...r, reporterActive: Boolean(r.reporterActive) }));
}

const ALLOWED_DECISIONS = {
    support: ['escalate', 'resolve', 'dismiss'],
    moderator: ['escalate', 'resolve', 'dismiss'],
    content_manager: ['resolve', 'dismiss']
};

async function decide(actor, id, decision) {
    const allowed = ALLOWED_DECISIONS[actor.role];
    if (!allowed || !allowed.includes(decision)) {
        await audit.record({
            actorType: 'staff', actorId: actor.id, actorRole: actor.role,
            action: 'content.report.decide', target: `report:${id}`, outcome: 'denied'
        });
        throw new AppError('No puedes realizar esa accion sobre el reporte.', 403);
    }
    const next = decision === 'escalate' ? 'escalated'
        : decision === 'resolve' ? 'resolved' : 'dismissed';
    const [result] = await pool.query(
        `UPDATE content_reports SET status = ?, handled_by = ?
         WHERE id = ? AND status IN ('open','escalated')`,
        [next, actor.id, id]
    );
    if (result.affectedRows === 0) {
        throw new AppError('El reporte no existe o ya fue atendido.', 409, 'REPORT_CLOSED');
    }
    await audit.record({
        actorType: 'staff', actorId: actor.id, actorRole: actor.role,
        action: `content.report.${decision}`, target: `report:${id}`, outcome: 'ok'
    });
    return { id, status: next };
}

module.exports = { KINDS, STATUSES, cleanNote, positiveInt, createReport, scopeForRole, listReports, decide };
