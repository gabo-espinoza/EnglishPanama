// Pruebas de endurecimiento de la gestion: no necesitan MySQL.
//  1. requireStaff no tumba el proceso si falla la base (next(err), no rechazo sin capturar).
//  2. La cadena de auditoria sigue valida con escrituras concurrentes (bloqueo GET_LOCK).
//  3. El seed de demo se niega a correr en produccion o sin contrasena explicita.
//  4. La auditoria exige su propia base en produccion.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('node:child_process');
const jwt = require('jsonwebtoken');

const SERVER_DIR = path.join(__dirname, '..');

// ---------------------------------------------------------------- 1. requireStaff

test('requireStaff pasa los fallos de la base a next(err) y no deja un rechazo sin capturar', async () => {
    process.env.STAFF_JWT_SECRET = 'secreto-de-prueba-staff';
    // Sin servidor MySQL en este puerto: pool.query rechaza.
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = '1';

    const { requireStaff } = require('../src/middleware/staffAuth');
    const pool = require('../src/config/db');

    const token = jwt.sign({ sub: 1, typ: 'staff', role: 'auditor', aud: 'audit', tv: 0 }, process.env.STAFF_JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` }, originalUrl: '/api/staff/me', ip: '127.0.0.1' };
    const res = {
        status() { throw new Error('no debia responder: la base fallo'); },
        json() { throw new Error('no debia responder: la base fallo'); }
    };

    const unhandled = [];
    const onUnhandled = (err) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);

    try {
        const error = await new Promise((resolve) => {
            requireStaff()(req, res, resolve);
        });
        assert.ok(error instanceof Error, 'next debe recibir el error de la base');
        await new Promise((r) => setImmediate(r));
        assert.deepStrictEqual(unhandled, [], 'no debe haber rechazos sin capturar');
    } finally {
        process.off('unhandledRejection', onUnhandled);
        await pool.end().catch(() => {});
    }
});

// ---------------------------------------------------------------- 2. cadena concurrente

// Base de auditoria falsa: GET_LOCK serializa entre conexiones y cada consulta cede el
// turno, asi una lectura-luego-escritura sin bloqueo se entrelazaria y bifurcaria la cadena.
function makeFakeAuditPool() {
    const rows = [];
    let holder = null;
    const waiters = [];
    let nextConn = 1;

    async function acquire(id) {
        while (holder !== null && holder !== id) {
            await new Promise((resolve) => waiters.push(resolve));
        }
        holder = id;
    }
    function release(id) {
        if (holder === id) {
            holder = null;
            const next = waiters.shift();
            if (next) next();
        }
    }
    const tick = () => new Promise((r) => setImmediate(r));

    async function run(id, sql, params = []) {
        await tick();
        if (/GET_LOCK/.test(sql)) {
            await acquire(id);
            return [[{ acquired: 1 }]];
        }
        if (/RELEASE_LOCK/.test(sql)) {
            release(id);
            return [[{ released: 1 }]];
        }
        if (/SELECT row_hash FROM audit_log/.test(sql)) {
            const last = rows[rows.length - 1];
            return [last ? [{ row_hash: last.row_hash }] : []];
        }
        if (/INSERT INTO audit_log/.test(sql)) {
            const [occurredAt, actorType, actorId, actorRole, action, target, outcome, ip, prevHash, rowHash] = params;
            rows.push({
                id: rows.length + 1, occurred_at: occurredAt, actor_type: actorType, actor_id: actorId,
                actor_role: actorRole, action, target, outcome, ip, prev_hash: prevHash, row_hash: rowHash
            });
            return [{ insertId: rows.length }];
        }
        if (/FROM audit_log\s+ORDER BY id ASC/.test(sql)) {
            return [rows.map((r) => ({ ...r }))];
        }
        throw new Error('consulta no soportada por el falso pool: ' + sql);
    }

    return {
        rows,
        query: (sql, params) => run(0, sql, params),
        async getConnection() {
            const id = nextConn++;
            return {
                query: (sql, params) => run(id, sql, params),
                release() { release(id); },
                destroy() { release(id); }
            };
        }
    };
}

test('la cadena de auditoria se mantiene valida con 40 escrituras concurrentes', async () => {
    const fakePool = makeFakeAuditPool();
    const auditDbPath = require.resolve('../src/config/auditDb');
    const auditServicePath = require.resolve('../src/services/audit.service');
    delete require.cache[auditServicePath];
    require.cache[auditDbPath] = {
        id: auditDbPath, filename: auditDbPath, loaded: true,
        exports: { getAuditPool: () => fakePool }
    };

    try {
        const audit = require('../src/services/audit.service');
        const results = await Promise.all(
            Array.from({ length: 40 }, (_, i) =>
                audit.record({ actorType: 'staff', actorId: i, actorRole: 'auditor', action: 'test.concurrent', outcome: 'ok' })
            )
        );
        assert.ok(results.every(Boolean), 'todas las escrituras deben registrarse');
        assert.strictEqual(fakePool.rows.length, 40);

        const hashes = new Set(fakePool.rows.map((r) => r.prev_hash));
        assert.strictEqual(hashes.size, 40, 'cada fila debe tener un prev_hash distinto (sin bifurcaciones)');

        const verdict = await audit.verify();
        assert.deepStrictEqual(verdict, { ok: true, checked: 40 });
    } finally {
        delete require.cache[auditDbPath];
        delete require.cache[auditServicePath];
    }
});

// ---------------------------------------------------------------- 3. seed de demo

function runSeed(env) {
    return spawnSync(process.execPath, [path.join(SERVER_DIR, 'scripts', 'seed-demo-staff.js')], {
        cwd: SERVER_DIR,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        timeout: 20000
    });
}

test('seed-demo-staff se niega a correr con NODE_ENV=production', () => {
    const out = runSeed({ NODE_ENV: 'production', DEMO_STAFF_PASSWORD: 'UnaClaveLargaDe12+' });
    assert.notStrictEqual(out.status, 0);
    assert.match(out.stderr, /NODE_ENV=production/);
});

test('seed-demo-staff exige DEMO_STAFF_PASSWORD de al menos 12 caracteres (sin valor por defecto)', () => {
    const missing = runSeed({ NODE_ENV: 'development' });
    assert.notStrictEqual(missing.status, 0);
    assert.match(missing.stderr, /DEMO_STAFF_PASSWORD/);

    const short = runSeed({ NODE_ENV: 'development', DEMO_STAFF_PASSWORD: 'corta' });
    assert.notStrictEqual(short.status, 0);
    assert.match(short.stderr, /DEMO_STAFF_PASSWORD/);
});

// ---------------------------------------------------------------- 4. auditoria en produccion

test('assertAuditConfig exige las cuatro variables AUDIT_DB_* solo en produccion', () => {
    const { assertAuditConfig } = require('../src/config/auditDb');
    const saved = { ...process.env };
    try {
        for (const name of ['AUDIT_DB_HOST', 'AUDIT_DB_USER', 'AUDIT_DB_PASSWORD', 'AUDIT_DB_NAME']) {
            delete process.env[name];
        }

        process.env.NODE_ENV = 'development';
        assert.doesNotThrow(() => assertAuditConfig());

        process.env.NODE_ENV = 'production';
        assert.throws(() => assertAuditConfig(), /AUDIT_DB_HOST.*AUDIT_DB_USER.*AUDIT_DB_PASSWORD.*AUDIT_DB_NAME/);

        process.env.AUDIT_DB_HOST = 'h';
        process.env.AUDIT_DB_USER = 'u';
        process.env.AUDIT_DB_PASSWORD = 'p';
        assert.throws(() => assertAuditConfig(), /AUDIT_DB_NAME/);

        process.env.AUDIT_DB_NAME = 'n';
        assert.doesNotThrow(() => assertAuditConfig());
    } finally {
        process.env = saved;
    }
});
