// Siembra de contenido de ejemplo: guardia explicito de produccion y niveles A1.1/A1.2/A1.3.
//
// Las pruebas del guardia no necesitan base. Las pruebas con base corren el script como
// proceso hijo contra la base configurada y limpian lo que ese script cree (se toma una foto
// de las filas previas y solo se borra lo nuevo), para no dejar datos que otros archivos de
// prueba vean en la base compartida. Se omiten solo si no hay variables de MySQL.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SERVER_DIR = path.join(__dirname, '..');
const SCRIPT = path.join(SERVER_DIR, 'scripts', 'seed-demo-content.js');
const LEVELS = ['A1.1', 'A1.2', 'A1.3'];

function runSeed(env, args = []) {
    return spawnSync(process.execPath, [SCRIPT, ...args], {
        cwd: SERVER_DIR,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        timeout: 60000
    });
}

// ------------------------------------------------------------ guardia (sin base)

test('en produccion sin --allow-production el script falla y nombra ambos', () => {
    const out = runSeed({ NODE_ENV: 'production' });
    assert.notStrictEqual(out.status, 0);
    assert.match(out.stderr, /NODE_ENV=production/);
    assert.match(out.stderr, /--allow-production/);
});

test('una variable de entorno nunca habilita el script en produccion', () => {
    for (const name of ['ALLOW_PRODUCTION', 'allow_production', 'ALLOW_PRODUCTION_SEED']) {
        const out = runSeed({ NODE_ENV: 'production', [name]: '1' });
        assert.notStrictEqual(out.status, 0, name);
        assert.match(out.stderr, /NODE_ENV=production/, name);
        assert.match(out.stderr, /--allow-production/, name);
    }
});

test('con --allow-production el guardia deja pasar (falla despues, por la base)', () => {
    const out = runSeed(
        { NODE_ENV: 'production', DB_HOST: '', DB_USER: '', DB_PASSWORD: '', DB_NAME: '' },
        ['--allow-production']
    );
    assert.notStrictEqual(out.status, 0);
    assert.doesNotMatch(out.stderr, /--allow-production/);
    assert.doesNotMatch(out.stderr, /NODE_ENV=production/);
});

// ------------------------------------------------------------ con base

const hasDb = Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);
const dbEnv = { NODE_ENV: 'test' };
let pool;
let ready = false;
let before = { activities: new Set(), modules: new Set(), challenges: new Set() };

async function ids(sql) {
    const [rows] = await pool.query(sql);
    return new Set(rows.map((r) => r.id));
}

test.before(async () => {
    if (!hasDb) return;
    try {
        pool = require('../src/config/db');
        await pool.query('SELECT 1');
        before = {
            activities: await ids('SELECT id FROM activities'),
            modules: await ids('SELECT id FROM modules'),
            challenges: await ids('SELECT id FROM daily_challenges')
        };
        ready = true;
    } catch (err) {
        console.error('seed-content.test.js sin MySQL:', err.message);
    }
});

test.after(async () => {
    if (pool) {
        try {
            if (ready) {
                // Solo filas nuevas; las preguntas y los retos asociados caen en cascada.
                const newActs = [...(await ids('SELECT id FROM activities'))].filter((i) => !before.activities.has(i));
                if (newActs.length) await pool.query('DELETE FROM activities WHERE id IN (?)', [newActs]);
                const newMods = [...(await ids('SELECT id FROM modules'))].filter((i) => !before.modules.has(i));
                if (newMods.length) await pool.query('DELETE FROM modules WHERE id IN (?)', [newMods]);
            }
        } catch (err) {
            console.error('Fallo la limpieza de seed-content.test.js:', err.message);
        }
        try { await pool.end(); } catch { /* sin conexiones */ }
    }
});

async function ownRows() {
    const [rows] = await pool.query('SELECT id, level, is_example FROM activities');
    return rows.filter((r) => !before.activities.has(r.id));
}

test('el script crea ejemplos de los tres niveles, todos marcados, y no duplica', async (t) => {
    if (!ready) { t.skip('sin MySQL'); return; }
    const first = runSeed(dbEnv);
    assert.strictEqual(first.status, 0, first.stderr);
    const rows1 = await ownRows();
    for (const level of LEVELS) {
        const n = rows1.filter((r) => r.level === level).length;
        // Si ya existian de antes (base ya sembrada) no habra nuevas de ese nivel.
        const [[all]] = await pool.query('SELECT COUNT(*) AS n FROM activities WHERE level = ? AND is_example = 1', [level]);
        assert.ok(all.n >= 3, `nivel ${level}: al menos 3 ejemplos (hay ${all.n}, nuevas ${n})`);
    }
    assert.ok(rows1.every((r) => r.is_example === 1), 'toda fila creada es de ejemplo');
    const [perAct] = await pool.query(
        'SELECT activity_id, COUNT(*) AS n FROM questions WHERE activity_id IN (?) GROUP BY activity_id',
        [rows1.map((r) => r.id).concat([0])]
    );
    assert.strictEqual(perAct.length, rows1.length, 'cada actividad nueva tiene preguntas');
    assert.ok(perAct.every((r) => r.n >= 3), 'al menos 3 preguntas por actividad');

    const [[poolLevels]] = await pool.query(
        `SELECT COUNT(DISTINCT a.level) AS n FROM daily_challenges dc
         JOIN questions q ON q.id = dc.question_id JOIN activities a ON a.id = q.activity_id`
    );
    assert.ok(poolLevels.n >= 3, 'el reto diario incluye preguntas de cada nivel');

    const second = runSeed(dbEnv);
    assert.strictEqual(second.status, 0, second.stderr);
    const rows2 = await ownRows();
    assert.strictEqual(rows2.length, rows1.length, 'la segunda corrida no agrega actividades');
    const [[q1]] = await pool.query('SELECT COUNT(*) AS n FROM questions');
    const third = runSeed(dbEnv);
    assert.strictEqual(third.status, 0, third.stderr);
    const [[q2]] = await pool.query('SELECT COUNT(*) AS n FROM questions');
    assert.strictEqual(q2.n, q1.n, 'no duplica preguntas');
});
