// B4: PUT /api/staff/game/rules es parcial, valida tipos y escribe de forma atomica. MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/fixtures');

let ctx; let gm; let saved;
const KEYS = ['rule_xp_per_correct', 'rule_xp_per_level', 'rule_daily_challenge_xp'];

test.before(async () => {
    ctx = await fx.start();
    if (!ctx.ready) return;
    gm = await fx.createStaff('game_manager');
    [saved] = await fx.pool.query('SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?)', [KEYS]);
});
test.after(async () => {
    if (ctx.ready) {
        await fx.pool.query('DELETE FROM app_settings WHERE setting_key IN (?)', [KEYS]);
        for (const r of saved) {
            await fx.pool.query('INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)', [r.setting_key, r.setting_value]);
        }
    }
    await fx.stop(ctx.server);
});

const put = (body) => fx.http(ctx.baseUrl, gm.token, 'PUT', '/staff/game/rules', body);
const stored = async () => Object.fromEntries(
    (await fx.pool.query('SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?)', [KEYS]))[0]
        .map((r) => [r.setting_key, r.setting_value])
);

test('un cuerpo parcial cambia solo las claves recibidas', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    assert.equal((await put({ xpPerCorrect: 9, xpPerLevel: 250, dailyChallengeXp: 33 })).status, 200);
    const res = await put({ xpPerLevel: 400 });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { xpPerCorrect: 9, xpPerLevel: 400, dailyChallengeXp: 33 });
    assert.deepEqual(await stored(), {
        rule_xp_per_correct: '9', rule_xp_per_level: '400', rule_daily_challenge_xp: '33'
    });
});

test('rechaza tipos, rangos, claves desconocidas y cuerpos vacios sin escribir nada', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    await put({ xpPerCorrect: 7, xpPerLevel: 120, dailyChallengeXp: 12 });
    const before = await stored();
    const bad = [
        { xpPerCorrect: '10' }, { xpPerCorrect: true }, { xpPerCorrect: null }, { xpPerCorrect: [7] },
        { xpPerCorrect: 2.5 }, { xpPerCorrect: 0 }, { xpPerLevel: 5000 },
        { xpPerCorrect: 8, dailyChallengeXp: 'x' },     // una valida y otra invalida: nada se guarda
        { xpPerPerfecto: 3 }, {}, [], 'texto'
    ];
    for (const body of bad) {
        assert.equal((await put(body)).status, 400, JSON.stringify(body));
    }
    assert.deepEqual(await stored(), before);
});

test('si falla una escritura a mitad, no queda ninguna clave cambiada (transaccion)', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    await put({ xpPerCorrect: 6, xpPerLevel: 110, dailyChallengeXp: 11 });
    const before = await stored();
    const game = require('../src/services/game.service');
    const realGetConnection = fx.pool.getConnection.bind(fx.pool);
    let upserts = 0;
    fx.pool.getConnection = async () => {
        const conn = await realGetConnection();
        const realQuery = conn.query.bind(conn);
        conn.query = (sql, params) => {
            if (/INSERT INTO app_settings/.test(sql) && ++upserts === 2) return Promise.reject(new Error('fallo simulado'));
            return realQuery(sql, params);
        };
        return conn;
    };
    try {
        await assert.rejects(
            game.updateRules({ id: gm.id, role: gm.role }, { xpPerCorrect: 20, xpPerLevel: 300, dailyChallengeXp: 50 }),
            /fallo simulado/
        );
    } finally {
        fx.pool.getConnection = realGetConnection;
    }
    assert.deepEqual(await stored(), before, 'la primera escritura debio revertirse');
});
