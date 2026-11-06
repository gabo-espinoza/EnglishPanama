// Fase C, modulo 7 (Gestion del juego y ranking). El game_manager administra
// las reglas de puntos/niveles, el pool del reto diario y el catalogo de alias.
// Las reglas viven en app_settings: antes estaban fijas en xp.service.js.
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const audit = require('./audit.service');
const { parseId } = require('../utils/ids');
const { getSetting, getDemoDayOffset } = require('./settings.service');
const { addDaysUtc, toDateOnlyUtc } = require('../utils/day');

const RULE_KEYS = {
    xpPerCorrect: 'rule_xp_per_correct',
    xpPerLevel: 'rule_xp_per_level',
    dailyChallengeXp: 'rule_daily_challenge_xp'
};
const DEFAULT_RULES = Object.freeze({ xpPerCorrect: 5, xpPerLevel: 100, dailyChallengeXp: 10 });
const MODULE_SLUGS = ['vocabulary', 'grammar', 'reading'];
const LEVELS = ['A1.1', 'A1.2', 'A1.3'];
// sentence_order guarda un ORDEN (arreglo) como respuesta; el reto diario se responde con UNA opcion.
const DAILY_UNSUPPORTED_TYPES = ['sentence_order'];
const QUESTION_SEARCH_MAX = 100;
const QUESTION_LIMIT_DEFAULT = 50;
const QUESTION_LIMIT_MAX = 100;
const BOUNDS = {
    xpPerCorrect: [1, 50],
    xpPerLevel: [10, 1000],
    dailyChallengeXp: [1, 100]
};

// Valida SOLO las claves recibidas y devuelve ese parche. Las claves ausentes no se tocan:
// un cuerpo parcial no debe resetear al valor por defecto lo que ya esta guardado.
// Cada valor debe ser un entero JSON (no cadenas, booleanos, arreglos ni null).
function parseRulePatch(rules) {
    if (rules === null || typeof rules !== 'object' || Array.isArray(rules)) {
        throw new AppError('El cuerpo debe ser un objeto con las reglas.', 400);
    }
    for (const key of Object.keys(rules)) {
        if (!Object.prototype.hasOwnProperty.call(BOUNDS, key)) {
            throw new AppError(`La regla ${key} no existe.`, 400);
        }
    }
    const patch = {};
    for (const [key, [min, max]] of Object.entries(BOUNDS)) {
        if (rules[key] === undefined) continue;
        const n = rules[key];
        if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
            throw new AppError(`La regla ${key} debe estar entre ${min} y ${max}.`, 400);
        }
        patch[key] = n;
    }
    return patch;
}

// Reglas completas resultantes de aplicar el parche sobre los valores por defecto.
function validateRules(rules) {
    return { ...DEFAULT_RULES, ...parseRulePatch(rules) };
}

async function getRules() {
    const out = { ...DEFAULT_RULES };
    for (const [key, setting] of Object.entries(RULE_KEYS)) {
        const raw = await getSetting(setting, null);
        const n = Number.parseInt(raw, 10);
        if (Number.isInteger(n)) out[key] = n;
    }
    return out;
}

async function updateRules(actor, rules) {
    const patch = parseRulePatch(rules || {});
    if (Object.keys(patch).length === 0) {
        throw new AppError('Indica al menos una regla para cambiar.', 400);
    }
    // Atomico: o se guardan todas las claves del parche o ninguna.
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        for (const [key, value] of Object.entries(patch)) {
            await conn.query(
                'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) '
                + 'ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
                [RULE_KEYS[key], String(value)]
            );
        }
        await conn.commit();
    } catch (err) {
        try { await conn.rollback(); } catch { /* la conexion ya cayo */ }
        throw err;
    } finally {
        conn.release();
    }
    await audit.record({
        actorType: 'staff', actorId: actor.id, actorRole: actor.role,
        action: 'game.rules.update', target: 'game:rules', outcome: 'ok'
    });
    return getRules();
}

// Catalogo de alias: nunca nombres reales, solo el alias del ranking.
async function listAliases() {
    const [rows] = await pool.query(
        `SELECT s.user_id AS studentId, u.username AS alias, s.xp,
                s.alias_hidden AS aliasHidden
         FROM students s JOIN users u ON u.id = s.user_id
         ORDER BY s.xp DESC, u.username ASC`
    );
    return rows.map((r) => ({ ...r, aliasHidden: Boolean(r.aliasHidden) }));
}

async function setAliasHidden(actor, studentId, hidden) {
    const id = parseId(studentId, 'El estudiante');
    // Debe ser un booleano explicito: un cuerpo sin `hidden` (o con otro tipo) no puede
    // mostrar un alias oculto por accidente.
    if (typeof hidden !== 'boolean') {
        throw new AppError('El valor hidden debe ser true o false.', 400);
    }
    const value = hidden ? 1 : 0;
    const [result] = await pool.query(
        'UPDATE students SET alias_hidden = ? WHERE user_id = ?', [value, id]
    );
    if (result.affectedRows === 0) throw new AppError('El estudiante no existe.', 404);
    await audit.record({
        actorType: 'staff', actorId: actor.id, actorRole: actor.role,
        action: value ? 'game.alias.hide' : 'game.alias.show',
        target: `student:${id}`, outcome: 'ok'
    });
    return { studentId: id, aliasHidden: Boolean(value) };
}

async function listDailyChallenges() {
    const [rows] = await pool.query(
        `SELECT dc.id, dc.position, dc.question_id AS questionId,
                q.prompt, a.title AS activityTitle, a.status AS activityStatus
         FROM daily_challenges dc
         JOIN questions q ON q.id = dc.question_id
         JOIN activities a ON a.id = q.activity_id
         ORDER BY dc.position, dc.id`
    );
    return rows;
}

// Un parametro de la URL debe ser un texto simple (`?q=a&q=b` llega como arreglo).
function queryText(value, label) {
    if (typeof value !== 'string') throw new AppError(`${label} no es valido.`, 400);
    return value;
}

// Buscador de preguntas para elegir un reto: solo actividades publicadas y sin la respuesta
// correcta ni las opciones (el gestor del juego no necesita ver las soluciones).
async function listQuestions({ module, level, q, limit } = {}) {
    const where = ["a.status = 'published'", 'a.game_type NOT IN (?)'];
    const params = [DAILY_UNSUPPORTED_TYPES];
    if (module !== undefined) {
        if (!MODULE_SLUGS.includes(queryText(module, 'El modulo'))) throw new AppError('Modulo no valido.', 400);
        where.push('m.slug = ?');
        params.push(module);
    }
    if (level !== undefined) {
        if (!LEVELS.includes(queryText(level, 'El nivel'))) throw new AppError('Nivel no valido.', 400);
        where.push('a.level = ?');
        params.push(level);
    }
    if (q !== undefined) {
        const text = queryText(q, 'La busqueda').trim();
        if (text.length > QUESTION_SEARCH_MAX) {
            throw new AppError(`La busqueda admite hasta ${QUESTION_SEARCH_MAX} caracteres.`, 400);
        }
        if (text) {
            // Se escapan %, _ y el propio escape (|) para que el texto se busque tal cual.
            const escaped = text.replace(/[|%_]/g, '|$&');
            where.push("LOWER(q.prompt) LIKE LOWER(?) ESCAPE '|'");
            params.push(`%${escaped}%`);
        }
    }
    let max = QUESTION_LIMIT_DEFAULT;
    if (limit !== undefined) {
        const text = queryText(limit, 'El limite');
        if (!/^[1-9]\d{0,3}$/.test(text)) throw new AppError('El limite no es valido.', 400);
        max = Math.min(Number(text), QUESTION_LIMIT_MAX);
    }
    const [rows] = await pool.query(
        `SELECT q.id, a.id AS activityId, a.title AS activityTitle, m.slug AS module,
                a.level, a.game_type AS gameType, q.prompt AS text
         FROM questions q
         JOIN activities a ON a.id = q.activity_id
         JOIN modules m ON m.id = a.module_id
         WHERE ${where.join(' AND ')}
         ORDER BY a.id, q.id
         LIMIT ?`,
        [...params, max]
    );
    return rows;
}

async function addDailyChallenge(actor, { questionId, position }) {
    const qid = Number(questionId);
    if (!Number.isInteger(qid) || qid <= 0) throw new AppError('Pregunta no valida.', 400);
    // Sin UNIQUE(question_id) (sin migracion): la verificacion y el INSERT van en una transaccion
    // que bloquea la fila de la pregunta. Dos altas simultaneas de la misma pregunta se serializan
    // y la segunda ve a la primera al revisar el pool.
    const conn = await pool.getConnection();
    let result;
    let pos;
    try {
        await conn.beginTransaction();
        const [locked] = await conn.query('SELECT id, activity_id FROM questions WHERE id = ? FOR UPDATE', [qid]);
        if (locked.length === 0) throw new AppError('La pregunta no existe.', 404);
        const [acts] = await conn.query('SELECT status, game_type FROM activities WHERE id = ?', [locked[0].activity_id]);
        if (acts.length === 0) throw new AppError('La pregunta no existe.', 404);
        if (acts[0].status !== 'published') {
            throw new AppError(
                'Solo se pueden agregar preguntas de actividades publicadas.', 409, 'QUESTION_NOT_PUBLISHED'
            );
        }
        if (DAILY_UNSUPPORTED_TYPES.includes(acts[0].game_type)) {
            throw new AppError(
                'Las preguntas de ordenar oraciones no sirven como reto diario: el estudiante responde con una sola opcion.',
                409, 'QUESTION_TYPE_NOT_SUPPORTED'
            );
        }
        const [dup] = await conn.query('SELECT 1 FROM daily_challenges WHERE question_id = ? LIMIT 1', [qid]);
        if (dup.length > 0) {
            throw new AppError('Esa pregunta ya está en la lista de retos diarios.', 409, 'QUESTION_ALREADY_IN_POOL');
        }
        pos = Number(position);
        if (!Number.isInteger(pos) || pos <= 0) {
            const [max] = await conn.query('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM daily_challenges');
            pos = max[0].n;
        }
        [result] = await conn.query(
            'INSERT INTO daily_challenges (question_id, position) VALUES (?, ?)', [qid, pos]
        );
        await conn.commit();
    } catch (err) {
        try { await conn.rollback(); } catch { /* la conexion ya cayo */ }
        throw err;
    } finally {
        conn.release();
    }
    await audit.record({
        actorType: 'staff', actorId: actor.id, actorRole: actor.role,
        action: 'game.challenge.add', target: `challenge:${result.insertId}`, outcome: 'ok'
    });
    return { id: result.insertId, questionId: qid, position: pos };
}

async function removeDailyChallenge(actor, id) {
    const n = parseId(id, 'El reto');
    // daily_completions tiene ON DELETE CASCADE hacia el reto: borrarlo hoy eliminaria los
    // registros de quienes ya lo completaron y podrian repetirlo y cobrar el XP otra vez.
    // Mientras haya completados de hoy (con el mismo dia efectivo que usa el reto diario,
    // incluido el desplazamiento del modo demo) el reto no se puede quitar.
    const today = toDateOnlyUtc(addDaysUtc(new Date(), await getDemoDayOffset()));
    const [done] = await pool.query(
        'SELECT 1 FROM daily_completions WHERE challenge_id = ? AND completed_on >= ? LIMIT 1',
        [n, today]
    );
    if (done.length > 0) {
        throw new AppError(
            'Ese reto ya fue completado hoy; podras quitarlo manana.', 409, 'CHALLENGE_COMPLETED_TODAY'
        );
    }
    const [result] = await pool.query('DELETE FROM daily_challenges WHERE id = ?', [n]);
    if (result.affectedRows === 0) throw new AppError('El reto no existe.', 404);
    await audit.record({
        actorType: 'staff', actorId: actor.id, actorRole: actor.role,
        action: 'game.challenge.remove', target: `challenge:${n}`, outcome: 'ok'
    });
    return { deleted: true };
}

module.exports = {
    RULE_KEYS, DEFAULT_RULES, parseRulePatch, validateRules, getRules, updateRules,
    listAliases, setAliasHidden, listQuestions, listDailyChallenges, addDailyChallenge, removeDailyChallenge
};
