// B4: PUT /api/staff/game/rules es parcial, valida tipos y escribe de forma atomica. MySQL real.
//
// Las reglas son estado GLOBAL que leen otras pruebas que corren en paralelo (XP por acierto,
// nivel, XP del reto). Por eso aqui nunca se guardan valores distintos de los de fabrica: se
// escriben los valores por defecto y se comprueba QUE FILAS se escribieron (solo las enviadas)
// y que una falla a mitad no deja ninguna. Las reglas efectivas no cambian para nadie.
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
        await clearRules();
        for (const r of saved) {
            await fx.pool.query('INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)', [r.setting_key, r.setting_value]);
        }
    }
    await fx.stop(ctx.server);
});

const clearRules = () => fx.pool.query('DELETE FROM app_settings WHERE setting_key IN (?)', [KEYS]);
const put = (body) => fx.http(ctx.baseUrl, gm.token, 'PUT', '/staff/game/rules', body);
const storedKeys = async () => (await fx.pool.query(
    'SELECT setting_key FROM app_settings WHERE setting_key IN (?) ORDER BY setting_key', [KEYS]
))[0].map((r) => r.setting_key);

test('un cuerpo parcial escribe solo las claves recibidas', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    await clearRules();
    const res = await put({ xpPerLevel: 100 });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { xpPerCorrect: 5, xpPerLevel: 100, dailyChallengeXp: 10 });
    assert.deepEqual(await storedKeys(), ['rule_xp_per_level'],
        'las claves no enviadas no se tocan (antes se reescribian con el valor por defecto)');
});

test('el parche conserva lo guardado de las claves no enviadas', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    // Una clave guardada con un valor propio, escrita directo: la actualizacion de otra no la pisa.
    // Se usa un valor que coincide con el de fabrica para no afectar a otras pruebas, y se
    // comprueba por el contenido exacto de la fila (cadena distinta: '010' no es '10').
    await clearRules();
    await fx.pool.query("INSERT INTO app_settings (setting_key, setting_value) VALUES ('rule_daily_challenge_xp', '010')");
    assert.equal((await put({ xpPerCorrect: 5 })).status, 200);
    const [[row]] = await fx.pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'rule_daily_challenge_xp'");
    assert.equal(row.setting_value, '010', 'la clave no enviada debe quedar exactamente como estaba');
});

test('rechaza tipos, rangos, claves desconocidas y cuerpos vacios sin escribir nada', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    await clearRules();
    const bad = [
        { xpPerCorrect: '10' }, { xpPerCorrect: true }, { xpPerCorrect: null }, { xpPerCorrect: [7] },
        { xpPerCorrect: 2.5 }, { xpPerCorrect: 0 }, { xpPerLevel: 5000 },
        { xpPerLevel: 100, dailyChallengeXp: 'x' },     // una valida y otra invalida: nada se guarda
        { xpPerPerfecto: 3 }, {}, [], 'texto'
    ];
    for (const body of bad) {
        assert.equal((await put(body)).status, 400, JSON.stringify(body));
    }
    assert.deepEqual(await storedKeys(), []);
});

test('si falla una escritura a mitad, no queda ninguna clave guardada (transaccion)', async (t) => {
    if (!ctx.ready) return t.skip('sin MySQL');
    await clearRules();
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
            game.updateRules({ id: gm.id, role: gm.role }, { xpPerCorrect: 5, xpPerLevel: 100, dailyChallengeXp: 10 }),
            /fallo simulado/
        );
    } finally {
        fx.pool.getConnection = realGetConnection;
    }
    assert.deepEqual(await storedKeys(), [], 'la primera escritura debio revertirse');
});
