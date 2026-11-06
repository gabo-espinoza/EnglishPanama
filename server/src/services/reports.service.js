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
    // Atomico sin migracion: se bloquea la fila del reportante, asi dos peticiones simultaneas
    // de la misma persona se serializan y la segunda ve el reporte abierto de la primera.
    const conn = await pool.getConnection();
    let result;
    try {
        await conn.beginTransaction();
        await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
        const [open] = await conn.query(
            `SELECT id FROM content_reports
             WHERE reporter_id = ? AND kind = ? AND activity_id = ?
               AND question_id <=> ? AND status IN ('open','escalated')`,
            [userId, kind, aid, qid]
        );
        if (open.length > 0) {
            throw new AppError('Ya tienes un reporte abierto sobre este contenido.', 409, 'ALREADY_REPORTED');
        }
        [result] = await conn.query(
            `INSERT INTO content_reports (kind, activity_id, question_id, reporter_id, reporter_role, note)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [kind, aid, qid, userId, role, text]
        );
        await conn.commit();
    } catch (err) {
        try { await conn.rollback(); } catch { /* conexion ya cerrada */ }
        throw err;
    } finally {
        conn.release();
    }
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

// El alias (usuario de acceso de un menor) solo lo ve soporte, que debe poder ubicar la cuenta
// al corregir un error. Moderacion y gestor de contenido reciben la respuesta SIN esa clave.
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
    return rows.map(({ reporterAlias, ...r }) => ({
        ...r,
        reporterActive: Boolean(r.reporterActive),
        ...(role === 'support' ? { reporterAlias } : {})
    }));
}

const ALLOWED_DECISIONS = {
    support: ['escalate', 'resolve', 'dismiss'],
    moderator: ['escalate', 'resolve', 'dismiss'],
    content_manager: ['resolve', 'dismiss']
};

// Bandeja de decision de cada rol: que reportes puede cerrar o escalar.
//  - support y moderator solo atienden los reportes ABIERTOS de su tipo.
//  - content_manager solo atiende lo que se le escalo (status = escalated).
// Un reporte fuera de la bandeja del rol responde 404 (igual que si no existiera) y queda
// auditado como denied; no se revela si el id existe en otra bandeja.
function decisionInbox(role) {
    if (role === 'support') return { kind: 'error', status: 'open' };
    if (role === 'moderator') return { kind: 'inappropriate', status: 'open' };
    if (role === 'content_manager') return { status: 'escalated' };
    return null;
}

async function decide(actor, id, decision) {
    const allowed = ALLOWED_DECISIONS[actor.role];
    if (!allowed || !allowed.includes(decision)) {
        await audit.record({
            actorType: 'staff', actorId: actor.id, actorRole: actor.role,
            action: 'content.report.decide', target: `report:${id}`, outcome: 'denied'
        });
        throw new AppError('No puedes realizar esa acción sobre el reporte.', 403);
    }
    const inbox = decisionInbox(actor.role);
    const next = decision === 'escalate' ? 'escalated'
        : decision === 'resolve' ? 'resolved' : 'dismissed';
    const where = ['id = ?'];
    const params = [next, actor.id, id];
    if (inbox.kind) { where.push('kind = ?'); params.push(inbox.kind); }
    where.push('status = ?'); params.push(inbox.status);
    const [result] = await pool.query(
        `UPDATE content_reports SET status = ?, handled_by = ?
         WHERE ${where.join(' AND ')}`,
        params
    );
    if (result.affectedRows === 0) {
        const [rows] = await pool.query('SELECT kind, status FROM content_reports WHERE id = ?', [id]);
        const row = rows[0];
        // support y moderator ven todos los estados de su tipo: ahi un reporte ya atendido es 409.
        const inScope = row && (inbox.kind ? row.kind === inbox.kind : row.status === inbox.status);
        if (inScope) {
            throw new AppError('El reporte ya fue atendido.', 409, 'REPORT_CLOSED');
        }
        await audit.record({
            actorType: 'staff', actorId: actor.id, actorRole: actor.role,
            action: 'content.report.decide', target: `report:${id}`, outcome: 'denied'
        });
        throw new AppError('El reporte no existe.', 404);
    }
    await audit.record({
        actorType: 'staff', actorId: actor.id, actorRole: actor.role,
        action: `content.report.${decision}`, target: `report:${id}`, outcome: 'ok'
    });
    return { id, status: next };
}

module.exports = { KINDS, STATUSES, cleanNote, positiveInt, createReport, scopeForRole, decisionInbox, listReports, decide };
