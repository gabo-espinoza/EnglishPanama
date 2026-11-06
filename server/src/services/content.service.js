// Fase B: ciclo de vida del contenido educativo (modulo 6 del diseno §4.1/§5.3).
// Regla central: lo que escribe el gestor NO llega a los estudiantes hasta que
// otra cuenta (el revisor) lo aprueba. Los estudiantes solo ven `published`.
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const audit = require('./audit.service');
const { normalizeAnswer } = require('../utils/answers');
const { LEVELS } = require('../config/classLevels');

const MODULE_SLUGS = ['vocabulary', 'grammar', 'reading'];
const GAME_TYPES = ['memory', 'multiple_choice', 'sentence_order', 'fill_blank'];
const STATUSES = ['draft', 'in_review', 'published', 'archived'];

// Texto validado en el servidor (diseno §5.6): sin control chars ni marcado.
function cleanText(value, name, max, required = true) {
    if (value === undefined || value === null || value === '') {
        if (required) throw new AppError(`${name} es obligatorio.`, 400);
        return null;
    }
    if (typeof value !== 'string') throw new AppError(`${name} debe ser texto.`, 400);
    const text = value.trim();
    if (!text && required) throw new AppError(`${name} es obligatorio.`, 400);
    if (text.length > max) throw new AppError(`${name} es demasiado largo.`, 400);
    if (/[\x00-\x1f\x7f<>]/.test(text)) {
        throw new AppError(`${name} tiene caracteres no permitidos.`, 400);
    }
    return text;
}

// Validacion pura por tipo de juego. Se exporta para probarla sin MySQL.
// Las formas siguen las de scripts/seed-demo-content.js: options es una lista
// de textos y correct_answer es una de ellas (o un orden, en sentence_order).
function validateQuestionShape(gameType, question) {
    if (!GAME_TYPES.includes(gameType)) {
        throw new AppError('Tipo de juego no valido.', 400);
    }
    const q = question || {};
    const topic = cleanText(q.topic, 'El tema', 50);
    const prompt = cleanText(q.prompt, 'El enunciado', 500);
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8) {
        throw new AppError('Las opciones deben ser una lista de 2 a 8 textos.', 400);
    }
    const options = q.options.map((o) => cleanText(o, 'La opcion', 120));
    const normalized = new Set(options.map(normalizeAnswer));
    const expected = q.correctAnswer;

    if (gameType === 'sentence_order') {
        if (!Array.isArray(expected) || expected.length < 2) {
            throw new AppError('La respuesta correcta debe ser el orden de las opciones.', 400);
        }
        if (!expected.every((part) => normalized.has(normalizeAnswer(String(part))))) {
            throw new AppError('La respuesta correcta usa opciones que no existen.', 400);
        }
    } else {
        if (typeof expected !== 'string' && typeof expected !== 'number') {
            throw new AppError('La respuesta correcta es obligatoria.', 400);
        }
        if (!normalized.has(normalizeAnswer(expected))) {
            throw new AppError('La respuesta correcta debe ser una de las opciones.', 400);
        }
    }
    return { topic, prompt, options, correctAnswer: expected };
}

function assertStatus(activity, expected, action) {
    if (activity.status !== expected) {
        throw new AppError(
            `No se puede ${action} una actividad en estado ${activity.status}.`,
            409,
            'INVALID_STATE'
        );
    }
}

// Solo quien creo el borrador puede modificarlo (autoria): otro gestor recibe 403 NOT_AUTHOR.
// Una actividad sin autor (sembrada) no la edita nadie por estas rutas. Se llama DESPUES de
// comprobar el estado, asi un estado no editable sigue respondiendo 409 INVALID_STATE.
function assertAuthor(activity, actor) {
    if (activity.author_id === null || Number(activity.author_id) !== Number(actor.id)) {
        throw new AppError('Solo quien creo el borrador puede modificarlo.', 403, 'NOT_AUTHOR');
    }
}

async function record(actor, action, target, outcome) {
    await audit.record({
        actorType: 'staff', actorId: actor.id, actorRole: actor.role,
        action: `content.${action}`, target, outcome
    });
}

// Todas las transiciones se hacen dentro de una transaccion con bloqueo de fila:
// dos aprobaciones simultaneas no pueden publicar dos veces la misma actividad.
async function withLockedActivity(id, actor, action, fn) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query('SELECT * FROM activities WHERE id = ? FOR UPDATE', [id]);
        if (rows.length === 0) throw new AppError('La actividad no existe.', 404);
        const result = await fn(conn, rows[0]);
        await conn.commit();
        await record(actor, action, `activity:${id}`, 'ok');
        return result;
    } catch (err) {
        await conn.rollback();
        await record(actor, action, `activity:${id}`, 'denied');
        throw err;
    } finally {
        conn.release();
    }
}

async function moduleId(conn, slug) {
    if (!MODULE_SLUGS.includes(slug)) throw new AppError('Modulo no valido.', 400);
    const [rows] = await conn.query('SELECT id FROM modules WHERE slug = ?', [slug]);
    if (rows.length === 0) throw new AppError('El modulo no existe.', 409);
    return rows[0].id;
}

function validateActivityFields(body, partial = false) {
    const out = {};
    if (!partial || body.moduleSlug !== undefined) {
        out.moduleSlug = cleanText(body.moduleSlug, 'El modulo', 20);
        if (!MODULE_SLUGS.includes(out.moduleSlug)) throw new AppError('Modulo no valido.', 400);
    }
    if (!partial || body.title !== undefined) out.title = cleanText(body.title, 'El titulo', 100);
    if (!partial || body.gameType !== undefined) {
        out.gameType = cleanText(body.gameType, 'El tipo de juego', 30);
        if (!GAME_TYPES.includes(out.gameType)) throw new AppError('Tipo de juego no valido.', 400);
    }
    if (!partial || body.level !== undefined) {
        out.level = cleanText(body.level, 'El nivel', 10);
        if (!LEVELS.includes(out.level)) throw new AppError('Nivel no valido.', 400);
    }
    if (body.passageText !== undefined) {
        out.passageText = cleanText(body.passageText, 'El texto de lectura', 4000, false);
    }
    return out;
}

async function listActivities({ role, status, module, level }) {
    const where = [];
    const params = [];
    // El revisor solo ve la cola y lo ya publicado; el gestor ve todo.
    if (role === 'content_reviewer') {
        where.push("a.status IN ('in_review', 'published')");
    }
    if (status !== undefined) {
        if (!STATUSES.includes(status)) throw new AppError('Estado no valido.', 400);
        where.push('a.status = ?');
        params.push(status);
    }
    if (module !== undefined) {
        if (!MODULE_SLUGS.includes(module)) throw new AppError('Modulo no valido.', 400);
        where.push('m.slug = ?');
        params.push(module);
    }
    if (level !== undefined) {
        if (!LEVELS.includes(level)) throw new AppError('Nivel no valido.', 400);
        where.push('a.level = ?');
        params.push(level);
    }
    const [rows] = await pool.query(
        `SELECT a.id, a.title, a.game_type AS gameType, a.level, a.status,
                a.author_id AS authorId, a.reviewer_id AS reviewerId,
                a.review_note AS reviewNote, a.replaces_id AS replacesId,
                a.updated_at AS updatedAt, m.slug AS moduleSlug
         FROM activities a JOIN modules m ON m.id = a.module_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY a.updated_at DESC, a.id DESC`,
        params
    );
    return rows;
}

async function getActivity(id, connection = pool) {
    const [rows] = await connection.query(
        `SELECT a.id, a.title, a.game_type AS gameType, a.level, a.status,
                a.passage_text AS passageText, a.sort_order AS sortOrder,
                a.author_id AS authorId, a.reviewer_id AS reviewerId,
                a.review_note AS reviewNote, a.replaces_id AS replacesId,
                a.updated_at AS updatedAt, m.slug AS moduleSlug
         FROM activities a JOIN modules m ON m.id = a.module_id WHERE a.id = ?`,
        [id]
    );
    if (rows.length === 0) throw new AppError('La actividad no existe.', 404);
    const [questions] = await connection.query(
        `SELECT id, topic, prompt, options, correct_answer AS correctAnswer
         FROM questions WHERE activity_id = ? ORDER BY id`,
        [id]
    );
    return { ...rows[0], questions };
}

async function createActivity(actor, body) {
    const fields = validateActivityFields(body || {}, false);
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const mid = await moduleId(conn, fields.moduleSlug);
        const [pos] = await conn.query(
            'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM activities WHERE module_id = ?',
            [mid]
        );
        const [result] = await conn.query(
            `INSERT INTO activities
                (module_id, title, game_type, level, passage_text, sort_order, is_example, status, author_id)
             VALUES (?, ?, ?, ?, ?, ?, 0, 'draft', ?)`,
            [mid, fields.title, fields.gameType, fields.level, fields.passageText || null, pos[0].n, actor.id]
        );
        await conn.commit();
        await record(actor, 'create', `activity:${result.insertId}`, 'ok');
        return getActivity(result.insertId);
    } catch (err) {
        await conn.rollback();
        await record(actor, 'create', 'activity:new', 'denied');
        throw err;
    } finally {
        conn.release();
    }
}

async function updateActivity(actor, id, body) {
    const fields = validateActivityFields(body || {}, true);
    return withLockedActivity(id, actor, 'update', async (conn, activity) => {
        assertStatus(activity, 'draft', 'editar');
        assertAuthor(activity, actor);
        const mid = fields.moduleSlug ? await moduleId(conn, fields.moduleSlug) : activity.module_id;
        await conn.query(
            `UPDATE activities SET module_id = ?, title = ?, game_type = ?, level = ?, passage_text = ?
             WHERE id = ?`,
            [
                mid,
                fields.title ?? activity.title,
                fields.gameType ?? activity.game_type,
                fields.level ?? activity.level,
                fields.passageText !== undefined ? fields.passageText : activity.passage_text,
                id
            ]
        );
        return getActivity(id, conn);
    });
}

async function addQuestion(actor, id, body) {
    // El tipo de juego se toma de la actividad (autoridad), no del cuerpo.
    return withLockedActivity(id, actor, 'question.create', async (conn, activity) => {
        assertStatus(activity, 'draft', 'agregar preguntas');
        assertAuthor(activity, actor);
        const question = validateQuestionShape(activity.game_type, body);
        await conn.query(
            'INSERT INTO questions (activity_id, topic, prompt, options, correct_answer) VALUES (?, ?, ?, ?, ?)',
            [id, question.topic, question.prompt, JSON.stringify(question.options), JSON.stringify(question.correctAnswer)]
        );
        return getActivity(id, conn);
    });
}

async function updateQuestion(actor, id, qid, body) {
    return withLockedActivity(id, actor, 'question.update', async (conn, activity) => {
        assertStatus(activity, 'draft', 'editar preguntas');
        assertAuthor(activity, actor);
        const [rows] = await conn.query('SELECT id FROM questions WHERE id = ? AND activity_id = ?', [qid, id]);
        if (rows.length === 0) throw new AppError('La pregunta no existe.', 404);
        const question = validateQuestionShape(activity.game_type, body);
        await conn.query(
            'UPDATE questions SET topic = ?, prompt = ?, options = ?, correct_answer = ? WHERE id = ?',
            [question.topic, question.prompt, JSON.stringify(question.options), JSON.stringify(question.correctAnswer), qid]
        );
        return getActivity(id, conn);
    });
}

async function deleteQuestion(actor, id, qid) {
    return withLockedActivity(id, actor, 'question.delete', async (conn, activity) => {
        assertStatus(activity, 'draft', 'borrar preguntas');
        assertAuthor(activity, actor);
        const [result] = await conn.query('DELETE FROM questions WHERE id = ? AND activity_id = ?', [qid, id]);
        if (result.affectedRows === 0) throw new AppError('La pregunta no existe.', 404);
        return getActivity(id, conn);
    });
}

async function deleteActivity(actor, id) {
    return withLockedActivity(id, actor, 'delete', async (conn, activity) => {
        assertStatus(activity, 'draft', 'borrar');
        assertAuthor(activity, actor);
        await conn.query('DELETE FROM questions WHERE activity_id = ?', [id]);
        await conn.query('DELETE FROM activities WHERE id = ?', [id]);
        return { deleted: true };
    });
}

async function submit(actor, id) {
    return withLockedActivity(id, actor, 'submit', async (conn, activity) => {
        assertStatus(activity, 'draft', 'enviar a revision');
        assertAuthor(activity, actor);
        const [questions] = await conn.query(
            'SELECT topic, prompt, options, correct_answer AS correctAnswer FROM questions WHERE activity_id = ?',
            [id]
        );
        if (questions.length === 0) {
            throw new AppError('La actividad debe tener al menos una pregunta.', 409, 'NO_QUESTIONS');
        }
        for (const q of questions) {
            validateQuestionShape(activity.game_type, {
                topic: q.topic, prompt: q.prompt, options: q.options, correctAnswer: q.correctAnswer
            });
        }
        await conn.query(
            `UPDATE activities SET status = 'in_review', reviewer_id = NULL, review_note = NULL
             WHERE id = ?`,
            [id]
        );
        return getActivity(id, conn);
    });
}

async function withdraw(actor, id) {
    return withLockedActivity(id, actor, 'withdraw', async (conn, activity) => {
        assertStatus(activity, 'in_review', 'retirar de revision');
        assertAuthor(activity, actor);
        await conn.query("UPDATE activities SET status = 'draft' WHERE id = ?", [id]);
        return getActivity(id, conn);
    });
}

async function revision(actor, id) {
    return withLockedActivity(id, actor, 'revision', async (conn, activity) => {
        assertStatus(activity, 'published', 'crear una revision');
        const [result] = await conn.query(
            `INSERT INTO activities
                (module_id, title, game_type, level, passage_text, sort_order, is_example, status, author_id, replaces_id)
             SELECT module_id, title, game_type, level, passage_text, sort_order, is_example,
                    'draft', ?, id
             FROM activities WHERE id = ?`,
            [actor.id, id]
        );
        const newId = result.insertId;
        await conn.query(
            `INSERT INTO questions (activity_id, topic, prompt, options, correct_answer)
             SELECT ?, topic, prompt, options, correct_answer FROM questions WHERE activity_id = ?`,
            [newId, id]
        );
        return getActivity(newId, conn);
    });
}

async function archive(actor, id) {
    return withLockedActivity(id, actor, 'archive', async (conn, activity) => {
        assertStatus(activity, 'published', 'archivar');
        await conn.query("UPDATE activities SET status = 'archived' WHERE id = ?", [id]);
        return getActivity(id, conn);
    });
}

async function approve(actor, id) {
    return withLockedActivity(id, actor, 'approve', async (conn, activity) => {
        assertStatus(activity, 'in_review', 'aprobar');
        // Separacion de funciones: quien escribio no aprueba, aunque algun dia
        // exista una cuenta con ambos roles (lo comprueba el servidor).
        if (activity.author_id !== null && Number(activity.author_id) === Number(actor.id)) {
            throw new AppError('No puedes aprobar tu propio contenido.', 403, 'SAME_AUTHOR');
        }
        if (activity.replaces_id !== null) {
            await conn.query(
                "UPDATE activities SET status = 'archived' WHERE id = ? AND status = 'published'",
                [activity.replaces_id]
            );
        }
        await conn.query(
            `UPDATE activities SET status = 'published', reviewer_id = ?, reviewed_at = NOW(),
                    review_note = NULL WHERE id = ?`,
            [actor.id, id]
        );
        return getActivity(id, conn);
    });
}

async function reject(actor, id, body) {
    const note = cleanText((body || {}).note, 'La nota del rechazo', 500);
    return withLockedActivity(id, actor, 'reject', async (conn, activity) => {
        assertStatus(activity, 'in_review', 'rechazar');
        await conn.query(
            `UPDATE activities SET status = 'draft', review_note = ?, reviewer_id = ?, reviewed_at = NOW()
             WHERE id = ?`,
            [note, actor.id, id]
        );
        return getActivity(id, conn);
    });
}

module.exports = {
    MODULE_SLUGS, GAME_TYPES, STATUSES, LEVELS,
    cleanText, validateQuestionShape, assertStatus, assertAuthor,
    listActivities, getActivity, createActivity, updateActivity,
    addQuestion, updateQuestion, deleteQuestion, deleteActivity,
    submit, withdraw, revision, archive, approve, reject
};
