// UNIQUE(question_id) en daily_challenges (migracion phase7-daily-challenge-unique.sql): la base
// rechaza una pregunta repetida en el pool, y addDailyChallenge traduce ese choque al mismo 409
// QUESTION_ALREADY_IN_POOL. MySQL real.
//
// Como test/game-questions.test.js: nivel A1.3 y la actividad solo queda publicada dentro de la
// prueba (try/finally), unos milisegundos; las filas del pool se borran al terminar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');
const gameService = require('../src/services/game.service');

let ctx; let gm; let activityId; let questionId;

async function addQuestion(activity, prompt) {
    const [q] = await fx.pool.query(
        "INSERT INTO questions (activity_id, topic, prompt, options, correct_answer) VALUES (?, 'x', ?, ?, ?)",
        [activity, prompt, JSON.stringify(['uno', 'dos']), JSON.stringify('uno')]
    );
    return q.insertId;
}
const cleanPool = () => fx.pool.query('DELETE FROM daily_challenges WHERE question_id = ?', [questionId]);

test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    gm = await fx.createStaff('game_manager');
    activityId = await fx.createActivity({ level: 'A1.3' });
    questionId = await addQuestion(activityId, `Unica ${fx.suffix}`);
});
test.after(async () => {
    if (ctx.ready) {
        try { await cleanPool(); } catch { /* limpieza de mejor esfuerzo */ }
    }
    await fx.stop(ctx.server);
});

test('la base tiene el indice unico uq_daily_challenges_question', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    const [rows] = await fx.pool.query(
        "SELECT NON_UNIQUE AS nonUnique, COLUMN_NAME AS col FROM information_schema.STATISTICS "
        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'daily_challenges' AND INDEX_NAME = 'uq_daily_challenges_question'"
    );
    assert.equal(rows.length, 1, 'falta aplicar phase7-daily-challenge-unique.sql a la base de pruebas');
    assert.equal(Number(rows[0].nonUnique), 0);
    assert.equal(rows[0].col, 'question_id');
});

test('un INSERT directo de una pregunta repetida en el pool se rechaza con ER_DUP_ENTRY', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    try {
        await fx.pool.query('INSERT INTO daily_challenges (question_id, position) VALUES (?, 9001)', [questionId]);
        await assert.rejects(
            fx.pool.query('INSERT INTO daily_challenges (question_id, position) VALUES (?, 9002)', [questionId]),
            (err) => err.code === 'ER_DUP_ENTRY' && /uq_daily_challenges_question/.test(err.sqlMessage)
        );
        const [[count]] = await fx.pool.query('SELECT COUNT(*) AS n FROM daily_challenges WHERE question_id = ?', [questionId]);
        assert.equal(count.n, 1);
    } finally {
        await cleanPool();
    }
});

test('si el INSERT del servicio choca con el indice, responde 409 QUESTION_ALREADY_IN_POOL', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    // Una fila agregada fuera del servicio, y una conexion que oculta la verificacion previa del
    // servicio (simula que esa fila aparecio entre la verificacion y el INSERT): asi el choque
    // solo lo detecta el indice.
    const originalGetConnection = fx.pool.getConnection;
    await fx.pool.query("UPDATE activities SET status = 'published' WHERE id = ?", [activityId]);
    try {
        await fx.pool.query('INSERT INTO daily_challenges (question_id, position) VALUES (?, 9003)', [questionId]);
        let hidden = 0;
        fx.pool.getConnection = async function patchedGetConnection(...args) {
            const conn = await originalGetConnection.apply(this, args);
            const query = conn.query.bind(conn);
            return new Proxy(conn, {
                get(target, prop) {
                    if (prop !== 'query') return Reflect.get(target, prop);
                    return (sql, ...rest) => {
                        if (typeof sql === 'string' && sql.startsWith('SELECT 1 FROM daily_challenges WHERE question_id')) {
                            hidden += 1;
                            return Promise.resolve([[], []]);
                        }
                        return query(sql, ...rest);
                    };
                }
            });
        };
        await assert.rejects(
            gameService.addDailyChallenge({ id: gm.id, role: gm.role }, { questionId }),
            (err) => err.status === 409 && err.apiCode === 'QUESTION_ALREADY_IN_POOL'
        );
        assert.equal(hidden, 1, 'la prueba debe haber ocultado la verificacion previa');
        const [[count]] = await fx.pool.query('SELECT COUNT(*) AS n FROM daily_challenges WHERE question_id = ?', [questionId]);
        assert.equal(count.n, 1);
    } finally {
        fx.pool.getConnection = originalGetConnection;
        await cleanPool();
        await fx.pool.query("UPDATE activities SET status = 'draft' WHERE id = ?", [activityId]);
    }
});
