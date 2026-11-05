// Fase C, modulo 7 (Gestion del juego y ranking). El game_manager administra
// las reglas de puntos/niveles, el pool del reto diario y el catalogo de alias.
// Las reglas viven en app_settings: antes estaban fijas en xp.service.js.
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const audit = require('./audit.service');
const { getSetting, setSetting } = require('./settings.service');

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

function validateRules(rules) {
    const out = { ...DEFAULT_RULES };
    for (const [key, [min, max]] of Object.entries(BOUNDS)) {
        if (rules[key] === undefined) continue;
        const n = Number(rules[key]);
        if (!Number.isInteger(n) || n < min || n > max) {
            throw new AppError(`La regla ${key} debe estar entre ${min} y ${max}.`, 400);
        }
        out[key] = n;
    }
    return out;
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
    const next = validateRules(rules || {});
    for (const [key, setting] of Object.entries(RULE_KEYS)) {
        await setSetting(setting, next[key]);
    }
    await audit.record({
        actorType: 'staff', actorId: actor.id, actorRole: actor.role,
        action: 'game.rules.update', target: 'game:rules', outcome: 'ok'
    });
    return next;
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
    const id = Number(studentId);
    if (!Number.isInteger(id) || id <= 0) throw new AppError('Estudiante no valido.', 400);
    const value = hidden === true ? 1 : 0;
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
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) throw new AppError('Reto no valido.', 400);
    const [result] = await pool.query('DELETE FROM daily_challenges WHERE id = ?', [n]);
    if (result.affectedRows === 0) throw new AppError('El reto no existe.', 404);
    await audit.record({
        actorType: 'staff', actorId: actor.id, actorRole: actor.role,
        action: 'game.challenge.remove', target: `challenge:${n}`, outcome: 'ok'
    });
    return { deleted: true };
}

module.exports = {
    RULE_KEYS, DEFAULT_RULES, validateRules, getRules, updateRules,
    listAliases, setAliasHidden, listDailyChallenges, addDailyChallenge, removeDailyChallenge
};
