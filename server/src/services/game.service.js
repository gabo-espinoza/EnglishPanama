// Fase C, modulo 7 (Gestion del juego y ranking). El game_manager administra
// las reglas de puntos/niveles, el pool del reto diario y el catalogo de alias.
// Las reglas viven en app_settings: antes estaban fijas en xp.service.js.
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const audit = require('./audit.service');
const { parseId } = require('../utils/ids');
const { getSetting, getDemoDayOffset } = require('./settings.service');
const { effectiveDay } = require('../utils/day');
const clock = require('../utils/clock');

const RULE_KEYS = {
    xpPerCorrect: 'rule_xp_per_correct',
    xpPerLevel: 'rule_xp_per_level',
    dailyChallengeXp: 'rule_daily_challenge_xp'
};
const DEFAULT_RULES = Object.freeze({ xpPerCorrect: 5, xpPerLevel: 100, dailyChallengeXp: 10 });
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

async function addDailyChallenge(actor, { questionId, position }) {
    const qid = Number(questionId);
    if (!Number.isInteger(qid) || qid <= 0) throw new AppError('Pregunta no valida.', 400);
    const [questions] = await pool.query(
        `SELECT q.id, a.status FROM questions q JOIN activities a ON a.id = q.activity_id
         WHERE q.id = ?`, [qid]
    );
    if (questions.length === 0) throw new AppError('La pregunta no existe.', 404);
    let pos = Number(position);
    if (!Number.isInteger(pos) || pos <= 0) {
        const [max] = await pool.query('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM daily_challenges');
        pos = max[0].n;
    }
    const [result] = await pool.query(
        'INSERT INTO daily_challenges (question_id, position) VALUES (?, ?)', [qid, pos]
    );
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
    const today = effectiveDay(clock.now(), await getDemoDayOffset()).date;
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
    listAliases, setAliasHidden, listDailyChallenges, addDailyChallenge, removeDailyChallenge
};
