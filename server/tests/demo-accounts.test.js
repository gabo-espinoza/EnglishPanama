// Pruebas de scripts/demo-accounts.js (crear y retirar las cuentas de demostracion).
//
// Las pruebas del guardia y de la contrasena no necesitan base. Las demas corren el script como
// proceso hijo contra la base configurada y prueban el MFA de punta a punta con la API real. Se
// omiten solas si no hay MySQL, JWT_SECRET, STAFF_JWT_SECRET o STAFF_MFA_KEY.
//
// Los nombres demo.* son GLOBALES en la base y solo este archivo los usa: los hooks limpian SOLO
// la lista fija (y los nombres fijos dtest.* de este archivo), antes y despues, aunque una prueba
// falle a medias. Nunca se cuenta una tabla completa ni se borra por patron.
//
// El hijo recibe un entorno armado a mano (variables de MySQL, clave MFA, NODE_ENV y la
// contrasena): no hereda el del proceso salvo lo imprescindible para ejecutar node.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const bcrypt = require('bcrypt');

// Como los demas archivos de prueba: carga server/.env sin pisar variables ya exportadas.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SERVER_DIR = path.join(__dirname, '..');
const SCRIPT = path.join(SERVER_DIR, 'scripts', 'demo-accounts.js');
const PAGE = path.join(SERVER_DIR, '..', 'docs', 'demo', 'codigos-totp.html');

const STAFF = [
    ['demo.accesos', 'access_manager', 'access'],
    ['demo.auditor', 'auditor', 'audit'],
    ['demo.analista', 'analyst', 'analytics'],
    ['demo.contenido', 'content_manager', 'content'],
    ['demo.revision', 'content_reviewer', 'content'],
    ['demo.juego', 'game_manager', 'game'],
    ['demo.moderacion', 'moderator', 'moderation'],
    ['demo.soporte', 'support', 'support']
];
const STAFF_NAMES = STAFF.map(([u]) => u);
const TEACHER = 'demo.docente';
const STUDENTS = ['demo.estudiante1', 'demo.estudiante2'];
const PLATFORM_NAMES = [TEACHER, ...STUDENTS];
const MFA_NAMES = [...STAFF_NAMES, TEACHER];
const ALL_NAMES = [...STAFF_NAMES, ...PLATFORM_NAMES];

// Nombres fijos de las filas de control y de los estudiantes "reales" de estas pruebas.
const CTL = {
    teacher: 'dtest.docente', student: 'dtest.estudiante',
    support: 'dtest.soporte', auditor: 'dtest.auditor',
    real1: 'dtest.real1', real2: 'dtest.real2',
    // Nombres que un LIKE 'demo.%' se llevaria por delante: deben sobrevivir siempre.
    zzStaff: 'demo.zz-control', zzStudent: 'demo.zz-alumno'
};
const CTL_USERS = [CTL.teacher, CTL.student, CTL.real1, CTL.real2, CTL.zzStudent];
const CTL_STAFF = [CTL.support, CTL.auditor, CTL.zzStaff];
const ACTIVITY_TITLE = 'dtest-demo-accounts-activity';

// Contrasena generada en cada corrida: nunca hay una contrasena real en el repositorio.
const PASSWORD = 'Dt-' + crypto.randomBytes(9).toString('hex');
const OTHER_PASSWORD = 'Ot-' + crypto.randomBytes(9).toString('hex');

const KEEP = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'COMSPEC', 'windir'];
const DB_KEYS = [
    'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
    'AUDIT_DB_HOST', 'AUDIT_DB_USER', 'AUDIT_DB_PASSWORD', 'AUDIT_DB_NAME', 'STAFF_MFA_KEY'
];

// Seguridad: la limpieza borra por lista fija, pero nunca debe correr contra una base real.
// NODE_ENV=production la rechaza siempre; una base que no es local solo con
// DEMO_ACCOUNTS_TEST_ALLOW_REMOTE_DB=1 (y entonces los hijos reciben --allow-production).
const LOCAL = ['localhost', '127.0.0.1', '::1'];
const REMOTE_OPT_IN = process.env.DEMO_ACCOUNTS_TEST_ALLOW_REMOTE_DB === '1';
function unsafeReason() {
    if (process.env.NODE_ENV === 'production') return 'NODE_ENV=production';
    if (REMOTE_OPT_IN) return null;
    const host = String(process.env.DB_HOST || '').toLowerCase();
    if (!LOCAL.includes(host)) return 'DB_HOST no es local (' + host + ')';
    if (/prod/i.test(String(process.env.DB_NAME || '')) || /prod/i.test(String(process.env.AUDIT_DB_NAME || ''))) {
        return 'DB_NAME parece de produccion';
    }
    return null;
}
function assertSafeDb() {
    const reason = unsafeReason();
    if (reason) throw new Error('Las pruebas de demo-accounts se niegan a correr: ' + reason);
}

function baseEnv() {
    const env = {};
    for (const k of KEEP) if (process.env[k] !== undefined) env[k] = process.env[k];
    return env;
}

function dbEnv(extra = {}) {
    const env = baseEnv();
    for (const k of DB_KEYS) if (process.env[k] !== undefined) env[k] = process.env[k];
    env.NODE_ENV = 'test';
    return { ...env, ...extra };
}

function run(args, { env, input } = {}) {
    // Con la base remota autorizada para pruebas, las corridas con base real llevan el indicador.
    const extra = !env && REMOTE_OPT_IN ? ['--allow-production'] : [];
    return spawnSync(process.execPath, [SCRIPT, ...args, ...extra], {
        cwd: SERVER_DIR,
        env: env || dbEnv({ DEMO_ACCOUNTS_PASSWORD: PASSWORD }),
        input: input === undefined ? '' : input,
        encoding: 'utf8',
        timeout: 80000
    });
}

// ------------------------------------------------------------ guardia (sin base)

const DEAD_DB = { DB_HOST: 'invalid.invalid', DB_USER: 'x', DB_PASSWORD: 'x', DB_NAME: 'x' };
const CONN_ERR = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|getaddrinfo/;

function guardEnv(extra = {}) {
    return { ...baseEnv(), NODE_ENV: 'production', DEMO_ACCOUNTS_PASSWORD: PASSWORD, ...DEAD_DB, ...extra };
}

for (const command of [['create'], ['remove'], ['remove', '--dry-run']]) {
    test(`en produccion "${command.join(' ')}" sin --allow-production falla antes de conectar`, () => {
        const out = run(command, { env: guardEnv() });
        assert.notStrictEqual(out.status, 0);
        assert.match(out.stderr, /NODE_ENV=production/);
        assert.match(out.stderr, /--allow-production/);
        assert.doesNotMatch(out.stderr, CONN_ERR, 'el guardia corre antes de cualquier conexion');
    });
}

test('una variable de entorno nunca habilita el script en produccion', () => {
    for (const name of ['ALLOW_PRODUCTION', 'allow_production', 'DEMO_ALLOW_PRODUCTION', 'ALLOW_PRODUCTION_SEED']) {
        for (const command of ['create', 'remove']) {
            const out = run([command], { env: guardEnv({ [name]: '1' }) });
            assert.notStrictEqual(out.status, 0, name);
            assert.match(out.stderr, /NODE_ENV=production/, name);
            assert.match(out.stderr, /--allow-production/, name);
            assert.doesNotMatch(out.stderr, CONN_ERR, name);
        }
    }
});

test('con --allow-production el guardia deja pasar (falla despues, por la base)', () => {
    for (const command of ['create', 'remove']) {
        const out = run([command, '--allow-production'], { env: guardEnv() });
        assert.notStrictEqual(out.status, 0);
        assert.match(out.stderr, CONN_ERR);
        assert.doesNotMatch(out.stderr, /--allow-production/);
        assert.doesNotMatch(out.stderr, /NODE_ENV=production/);
    }
});

// Base local con credenciales malas: pasa el guardia y falla despues, por la base.
const LOCAL_BAD_DB = { DB_HOST: '127.0.0.1', DB_USER: 'x', DB_PASSWORD: 'x', DB_NAME: 'x' };

test('fuera de produccion y con base local no hace falta el indicador', () => {
    for (const command of [['remove', '--dry-run'], ['create']]) {
        const out = run(command, { env: { ...baseEnv(), NODE_ENV: 'test', DEMO_ACCOUNTS_PASSWORD: PASSWORD, ...LOCAL_BAD_DB } });
        assert.notStrictEqual(out.status, 0);
        assert.doesNotMatch(out.stderr, /--allow-production/);
        assert.doesNotMatch(out.stderr, /NODE_ENV=production/);
    }
});

test('una base que no es local exige el indicador aunque NODE_ENV no sea production (o no exista)', () => {
    for (const nodeEnv of [{ NODE_ENV: 'test' }, { NODE_ENV: 'development' }, {}]) {
        for (const command of ['create', 'remove']) {
            const out = run([command], { env: { ...baseEnv(), ...nodeEnv, DEMO_ACCOUNTS_PASSWORD: PASSWORD, ...DEAD_DB } });
            assert.notStrictEqual(out.status, 0);
            assert.match(out.stderr, /--allow-production/);
            assert.match(out.stderr, /no es local/);
            assert.doesNotMatch(out.stderr, CONN_ERR, 'el guardia corre antes de conectar');
        }
    }
    // El indicador la deja pasar (y falla despues, por la base).
    const out = run(['remove', '--dry-run', '--allow-production'], { env: { ...baseEnv(), NODE_ENV: 'test', ...DEAD_DB } });
    assert.match(out.stderr, CONN_ERR);
    assert.doesNotMatch(out.stderr, /--allow-production/);
    // Tambien cuenta la base de auditoria.
    const audit = run(['remove'], { env: { ...baseEnv(), NODE_ENV: 'test', ...LOCAL_BAD_DB, AUDIT_DB_HOST: 'invalid.invalid' } });
    assert.match(audit.stderr, /--allow-production/);
    assert.doesNotMatch(audit.stderr, CONN_ERR);
});

test('argumentos invalidos muestran el uso y no tocan la base', () => {
    const base = { ...baseEnv(), NODE_ENV: 'test', ...DEAD_DB, DEMO_ACCOUNTS_PASSWORD: PASSWORD };
    for (const args of [[], ['borrar'], ['create', '--dry-run'], ['remove', '--reissue'], ['create', 'remove']]) {
        const out = run(args, { env: base });
        assert.notStrictEqual(out.status, 0, args.join(' '));
        assert.match(out.stderr, /Uso:/, args.join(' '));
        assert.doesNotMatch(out.stderr, CONN_ERR, args.join(' '));
    }
});

// ------------------------------------------------------- contrasena (sin base)

test('contrasena corta, larga o ausente: error antes de conectar y sin crear nada', () => {
    const noDb = { ...baseEnv(), NODE_ENV: 'test', ...LOCAL_BAD_DB };
    const short = run(['create'], { env: { ...noDb, DEMO_ACCOUNTS_PASSWORD: 'corta-11-ch' } });
    assert.notStrictEqual(short.status, 0);
    assert.match(short.stderr, /al menos 12/);
    assert.doesNotMatch(short.stderr, CONN_ERR);
    assert.ok(!short.stdout.includes('corta-11-ch') && !short.stderr.includes('corta-11-ch'), 'no imprime la contrasena');

    const long = run(['create'], { env: { ...noDb, DEMO_ACCOUNTS_PASSWORD: 'x'.repeat(73) } });
    assert.notStrictEqual(long.status, 0);
    assert.match(long.stderr, /maximo 72/);
    assert.doesNotMatch(long.stderr, CONN_ERR);

    const empty = run(['create'], { env: { ...noDb, DEMO_ACCOUNTS_PASSWORD: '' } });
    assert.notStrictEqual(empty.status, 0);
    assert.match(empty.stderr, /al menos 12/);

    // Sin variable y sin entrada estandar (no interactivo): error claro, no se cuelga.
    const none = run(['create'], { env: noDb, input: '' });
    assert.notStrictEqual(none.status, 0);
    assert.match(none.stderr, /DEMO_ACCOUNTS_PASSWORD/);
    assert.doesNotMatch(none.stderr, CONN_ERR);

    // Espacios al inicio o al final: se rechazan por igual por variable y por entrada estandar.
    for (const pw of [' ' + PASSWORD, PASSWORD + ' ', PASSWORD + '\t']) {
        const viaEnv = run(['create'], { env: { ...noDb, DEMO_ACCOUNTS_PASSWORD: pw } });
        assert.notStrictEqual(viaEnv.status, 0);
        assert.match(viaEnv.stderr, /espacios/);
        const viaStdin = run(['create'], { env: noDb, input: pw + '\n' });
        assert.notStrictEqual(viaStdin.status, 0);
        assert.match(viaStdin.stderr, /espacios/);
        assert.doesNotMatch(viaEnv.stderr + viaStdin.stderr, CONN_ERR);
    }

    // Por entrada estandar tambien se valida el minimo.
    const stdinShort = run(['create'], { env: noDb, input: 'corta\n' });
    assert.notStrictEqual(stdinShort.status, 0);
    assert.match(stdinShort.stderr, /al menos 12/);
});

// ------------------------------------------------------------ con base

const hasDb = Boolean(
    process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME
    && process.env.JWT_SECRET && process.env.STAFF_JWT_SECRET && process.env.STAFF_MFA_KEY
);
let pool;
let auditPool;
let audit;
let totp;
let mfaCrypto;
let server;
let baseUrl;
let ready = false;
let auditBaseline = 0;
let activityId = null;
let questionId = null;

async function q(sql, params) {
    const [rows] = await pool.query(sql, params);
    return rows;
}

async function cleanup() {
    assertSafeDb();
    const tryQ = async (sql, params) => { try { await pool.query(sql, params); } catch (err) { console.error('limpieza:', err.message); } };
    // Solo listas fijas. Las solicitudes se borran por los ids de las cuentas fijas.
    const staffIds = (await q('SELECT id FROM staff_accounts WHERE username IN (?)', [[...STAFF_NAMES, ...CTL_STAFF]])).map((r) => r.id);
    if (staffIds.length > 0) {
        await tryQ('DELETE FROM staff_change_requests WHERE target_id IN (?) OR requested_by IN (?) OR decided_by IN (?)',
            [staffIds, staffIds, staffIds]);
        await tryQ('DELETE FROM staff_accounts WHERE id IN (?)', [staffIds]);
    }
    if (activityId) await tryQ('DELETE FROM activities WHERE id = ?', [activityId]);
    // Los estudiantes enlazados al docente demo caen en cascada con el docente.
    await tryQ('DELETE FROM users WHERE username IN (?)', [[...ALL_NAMES, ...CTL_USERS]]);
}

test.before(async () => {
    if (!hasDb) return;
    try {
        assertSafeDb();
        pool = require('../src/config/db');
        await pool.query('SELECT 1');
        audit = require('../src/services/audit.service');
        auditPool = require('../src/config/auditDb').getAuditPool();
        totp = require('../src/utils/totp');
        mfaCrypto = require('../src/utils/mfaCrypto');
        const app = require('../src/app');
        server = app.listen(0);
        await new Promise((r) => server.once('listening', r));
        baseUrl = `http://127.0.0.1:${server.address().port}/api`;

        await cleanup(); // restos de una corrida abortada
        const [[m]] = await auditPool.query('SELECT COALESCE(MAX(id), 0) AS m FROM audit_log');
        auditBaseline = Number(m.m);

        await pool.query("INSERT IGNORE INTO modules (slug, name) VALUES ('vocabulary', 'Vocabulary')");
        const [[mod]] = await pool.query("SELECT id FROM modules WHERE slug = 'vocabulary'");
        const [act] = await pool.query(
            "INSERT INTO activities (module_id, title, game_type, sort_order, level, is_example) VALUES (?, ?, 'multiple_choice', 99, 'A1.1', 1)",
            [mod.id, ACTIVITY_TITLE]
        );
        activityId = act.insertId;
        const [qs] = await pool.query(
            "INSERT INTO questions (activity_id, topic, prompt, options, correct_answer) VALUES (?, 'dtest', 'Hello', JSON_ARRAY('Hola','Adios'), JSON_QUOTE('Hola'))",
            [activityId]
        );
        questionId = qs.insertId;

        // Filas de control: nombres distintos de la lista fija; deben sobrevivir a `remove`.
        const hash = await bcrypt.hash(PASSWORD, 4);
        const [t] = await pool.query("INSERT INTO users (role, username, password_hash) VALUES ('teacher', ?, ?)", [CTL.teacher, hash]);
        await pool.query('INSERT INTO teachers (user_id, display_name, class_code) VALUES (?, ?, ?)',
            [t.insertId, 'Docente de control', 'Z' + crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5)]);
        const [s] = await pool.query("INSERT INTO users (role, username, password_hash) VALUES ('student', ?, ?)", [CTL.student, hash]);
        await pool.query('INSERT INTO students (user_id, teacher_id) VALUES (?, ?)', [s.insertId, t.insertId]);
        // Alumno de control con otro docente: nunca debe bloquear ni sufrir un remove.
        const [z] = await pool.query("INSERT INTO users (role, username, password_hash) VALUES ('student', ?, ?)", [CTL.zzStudent, hash]);
        await pool.query('INSERT INTO students (user_id, teacher_id) VALUES (?, ?)', [z.insertId, t.insertId]);
        for (const [name, role] of [[CTL.support, 'support'], [CTL.auditor, 'auditor'], [CTL.zzStaff, 'support']]) {
            await pool.query('INSERT INTO staff_accounts (username, password_hash, role, mfa_secret_enc) VALUES (?, ?, ?, ?)',
                [name, hash, role, mfaCrypto.encrypt(totp.generateSecret())]);
        }
        ready = true;
    } catch (err) {
        console.error('demo-accounts.test.js sin MySQL o claves:', err.message);
    }
});

test.after(async () => {
    if (pool) {
        try { if (ready) await cleanup(); } catch (err) { console.error('Fallo la limpieza de demo-accounts.test.js:', err.message); }
    }
    if (server) server.close();
    try { if (pool) await pool.end(); } catch { /* sin conexiones */ }
    try { await require('../src/config/auditDb').closeAuditPool(); } catch { /* sin conexiones */ }
});

// ---- ayudas

function call(method, url, { token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(baseUrl + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

function parseBlock(stdout) {
    const lines = stdout.split(/\r?\n/);
    const start = lines.findIndex((l) => l.startsWith('# ---- INICIO'));
    const end = lines.findIndex((l) => l.startsWith('# ---- FIN'));
    if (start < 0 || end < 0 || end < start) return null;
    const entries = lines.slice(start + 1, end);
    const secrets = {};
    for (const l of entries) {
        const m = /^(demo\.[a-z0-9]+): ([A-Z2-7]{16,})$/.exec(l);
        assert.ok(m, 'linea del bloque con formato valido: ' + l.replace(/: .*/, ': ***'));
        secrets[m[1]] = m[2];
    }
    return { lines: lines.slice(start, end + 1), entries, secrets };
}

async function snapshot() {
    const staff = await q(
        'SELECT username, role, status, password_hash, token_version, HEX(mfa_secret_enc) AS mfa FROM staff_accounts WHERE username IN (?) ORDER BY username',
        [STAFF_NAMES]
    );
    const users = await q(
        `SELECT u.username, u.role, u.password_hash, u.token_version, u.must_change_password, HEX(u.mfa_secret_enc) AS mfa,
                t.class_code, t.grade, s.teacher_id
         FROM users u LEFT JOIN teachers t ON t.user_id = u.id LEFT JOIN students s ON s.user_id = u.id
         WHERE u.username IN (?) ORDER BY u.username`,
        [PLATFORM_NAMES]
    );
    return { staff, users };
}

async function controlState() {
    const staff = await q('SELECT username, role, HEX(mfa_secret_enc) AS mfa FROM staff_accounts WHERE username IN (?) ORDER BY username', [CTL_STAFF]);
    const users = await q(
        'SELECT u.username, u.role, t.class_code, s.teacher_id FROM users u LEFT JOIN teachers t ON t.user_id = u.id LEFT JOIN students s ON s.user_id = u.id WHERE u.username IN (?) ORDER BY u.username',
        [[CTL.teacher, CTL.student, CTL.zzStudent]]
    );
    return JSON.stringify({ staff, users });
}

function counts(stdout) {
    const out = {};
    for (const m of stdout.matchAll(/^\s+(staff_change_requests|staff_accounts|daily_completions|attempt_answers|attempts|students|teachers|users):\s+(\d+)\s*$/gm)) {
        out[m[1]] = Number(m[2]);
    }
    return out;
}

async function staffLogin(username, secret, password = PASSWORD) {
    return call('POST', '/staff/auth/login', { body: { username, password, totp: totp.generateToken(secret) } });
}

async function teacherSession(secret, password = PASSWORD) {
    const res = await call('POST', '/auth/login', { body: { username: TEACHER, password } });
    const body = await res.json();
    if (!body.mfaRequired) return { first: res, body };
    const second = await call('POST', '/auth/login/mfa', { body: { mfaToken: body.mfaToken, totp: totp.generateToken(secret) } });
    return { first: res, body, second, secondBody: await second.json() };
}

async function registerReal(username) {
    const [[row]] = await pool.query('SELECT class_code FROM teachers t JOIN users u ON u.id = t.user_id WHERE u.username = ?', [TEACHER]);
    const res = await call('POST', '/auth/register/student', { body: { username, password: PASSWORD, classCode: row.class_code } });
    assert.strictEqual(res.status, 201, 'registro del estudiante real');
    const [[u]] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    await pool.query('INSERT INTO attempts (student_id, activity_id, score, xp_earned) VALUES (?, ?, 3, 30)', [u.id, activityId]);
    const [[att]] = await pool.query('SELECT id FROM attempts WHERE student_id = ? ORDER BY id DESC LIMIT 1', [u.id]);
    await pool.query('INSERT INTO attempt_answers (attempt_id, question_id, is_correct) VALUES (?, ?, 1)', [att.id, questionId]);
    await pool.query('UPDATE students SET xp = 30 WHERE user_id = ?', [u.id]);
    return u.id;
}

// Estado compartido entre las pruebas (se ejecutan en orden).
const state = { secrets: null, snap: null, controls: null, firstStdout: '', teacherId: null };

// ---- (b) nada se crea con contrasena invalida

test('con contrasena corta nada se crea en la base', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const out = run(['create'], { env: dbEnv({ DEMO_ACCOUNTS_PASSWORD: 'corta' }) });
    assert.notStrictEqual(out.status, 0);
    assert.match(out.stderr, /al menos 12/);
    const none = run(['create'], { env: dbEnv(), input: '' });
    assert.notStrictEqual(none.status, 0);
    const s = await snapshot();
    assert.strictEqual(s.staff.length + s.users.length, 0, 'no se creo ninguna cuenta demo');
});

test('remove sin cuentas demo no hace nada y no falla', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const out = run(['remove']);
    assert.strictEqual(out.status, 0, out.stderr);
    assert.match(out.stdout, /No hay cuentas demo/);
});

// ---- (c) create + MFA de punta a punta

test('create (contrasena por entrada estandar) crea las 8 de gestion, el docente y 2 estudiantes', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    state.controls = await controlState();
    const out = run(['create'], { env: dbEnv(), input: PASSWORD + '\n' });
    assert.strictEqual(out.status, 0, out.stderr);
    state.firstStdout = out.stdout;
    assert.ok(!out.stdout.includes(PASSWORD) && !out.stderr.includes(PASSWORD), 'la contrasena nunca se imprime');

    const snap = await snapshot();
    assert.strictEqual(snap.staff.length, 8);
    for (const [username, role] of STAFF) {
        const row = snap.staff.find((r) => r.username === username);
        assert.ok(row, username);
        assert.strictEqual(row.role, role);
        assert.strictEqual(row.status, 'active');
        assert.ok(await bcrypt.compare(PASSWORD, row.password_hash), 'contrasena compartida');
    }
    assert.strictEqual(snap.users.length, 3);
    const teacher = snap.users.find((r) => r.username === TEACHER);
    assert.strictEqual(teacher.role, 'teacher');
    assert.strictEqual(teacher.must_change_password, 0);
    assert.ok(teacher.mfa, 'MFA activo en el docente');
    assert.strictEqual(teacher.grade, null, 'grado sin declarar');
    assert.match(teacher.class_code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.ok(out.stdout.includes(teacher.class_code), 'el resumen muestra el codigo de clase');
    const [[disp]] = await pool.query('SELECT display_name FROM teachers t JOIN users u ON u.id = t.user_id WHERE u.username = ?', [TEACHER]);
    assert.strictEqual(disp.display_name, 'Docente de demostracion');
    for (const name of STUDENTS) {
        const s = snap.users.find((r) => r.username === name);
        assert.strictEqual(s.role, 'student');
        assert.strictEqual(s.mfa, null, 'los estudiantes no llevan MFA');
        assert.ok(s.teacher_id, 'enlazado al docente');
        assert.ok(await bcrypt.compare(PASSWORD, s.password_hash));
    }
    state.snap = snap;
    state.teacherId = (await q('SELECT id FROM users WHERE username = ?', [TEACHER]))[0].id;
    for (const s of STUDENTS) {
        assert.strictEqual(snap.users.find((r) => r.username === s).teacher_id, state.teacherId);
    }

    // Los secretos impresos son los que quedaron cifrados en la base.
    const block = parseBlock(out.stdout);
    assert.ok(block, 'hay bloque delimitado');
    assert.deepStrictEqual(Object.keys(block.secrets).sort(), [...MFA_NAMES].sort());
    for (const [username, secret] of Object.entries(block.secrets)) {
        const hex = (snap.staff.find((r) => r.username === username) || snap.users.find((r) => r.username === username)).mfa;
        assert.strictEqual(mfaCrypto.decrypt(Buffer.from(hex, 'hex')), secret, username);
    }
    state.secrets = block.secrets;
    assert.match(out.stdout, /UNA sola vez/);
    assert.match(out.stdout, /remove/, 'recuerda retirar las cuentas');
});

test('el MFA funciona de punta a punta: personal con contrasena + TOTP, y /staff/me', async (t) => {
    if (!ready || !state.secrets) { t.skip('sin MySQL o sin cuentas'); return; }
    for (const [username, role, area] of STAFF) {
        const res = await staffLogin(username, state.secrets[username]);
        assert.strictEqual(res.status, 200, username);
        const body = await res.json();
        assert.ok(body.token);
        assert.strictEqual(body.role, role);
        const me = await call('GET', '/staff/me', { token: body.token });
        assert.strictEqual(me.status, 200, username);
        const meBody = await me.json();
        assert.strictEqual(meBody.username, username);
        assert.strictEqual(meBody.role, role);
        assert.strictEqual(meBody.area, area);
    }
    // Sin codigo, o con la contrasena equivocada, no entra.
    const noCode = await call('POST', '/staff/auth/login', { body: { username: 'demo.auditor', password: PASSWORD } });
    assert.strictEqual(noCode.status, 401);
});

test('docente: login devuelve mfaRequired (no vinculacion ni cambio de contrasena) y el TOTP da la sesion', async (t) => {
    if (!ready || !state.secrets) { t.skip('sin MySQL o sin cuentas'); return; }
    const r = await teacherSession(state.secrets[TEACHER]);
    assert.strictEqual(r.first.status, 200);
    assert.strictEqual(r.body.mfaRequired, true);
    assert.strictEqual(r.body.mfaSetupRequired, undefined);
    assert.strictEqual(r.body.passwordChangeRequired, undefined);
    assert.strictEqual(r.body.token, undefined, 'sin el segundo factor no hay sesion');
    assert.strictEqual(r.second.status, 200, JSON.stringify(r.secondBody));
    assert.ok(r.secondBody.token);
    assert.strictEqual(r.secondBody.role, 'teacher');
});

test('estudiantes entran sin MFA y /users/me responde; contrasena equivocada falla', async (t) => {
    if (!ready || !state.secrets) { t.skip('sin MySQL o sin cuentas'); return; }
    for (const name of STUDENTS) {
        const res = await call('POST', '/auth/login', { body: { username: name, password: PASSWORD } });
        assert.strictEqual(res.status, 200, name);
        const body = await res.json();
        assert.ok(body.token, name);
        assert.strictEqual(body.mfaRequired, undefined);
        assert.strictEqual(body.role, 'student');
        const me = await call('GET', '/users/me', { token: body.token });
        assert.strictEqual(me.status, 200, name);
        const profile = await me.json();
        assert.strictEqual(profile.alias, name);
        assert.strictEqual(profile.role, 'student');
        assert.match(profile.classCode, /^[A-HJ-NP-Z2-9]{6}$/);
    }
    const bad = await call('POST', '/auth/login', { body: { username: STUDENTS[0], password: OTHER_PASSWORD } });
    assert.strictEqual(bad.status, 401);
    const badStaff = await staffLogin('demo.soporte', state.secrets['demo.soporte'], OTHER_PASSWORD);
    assert.strictEqual(badStaff.status, 401);
    const badTeacher = await call('POST', '/auth/login', { body: { username: TEACHER, password: OTHER_PASSWORD } });
    assert.strictEqual(badTeacher.status, 401);
});

// ---- (i) formato del bloque contra el analizador real de la pagina

test('el bloque impreso lo acepta el analizador de docs/demo/codigos-totp.html', (t) => {
    if (!state.secrets) { t.skip('sin cuentas'); return; }
    const html = fs.readFileSync(PAGE, 'utf8');
    const m = /\/\/ <core>([\s\S]*?)\/\/ <\/core>/.exec(html);
    assert.ok(m, 'marcadores del nucleo en la pagina');
    const parseAccounts = new Function(m[1] + '; return parseAccounts;')();

    const block = parseBlock(state.firstStdout);
    for (const line of block.entries) assert.match(line, /^demo\.[a-z0-9]+: [A-Z2-7]{16,}$/);
    assert.strictEqual(block.entries.length, 9);

    // El bloque completo (con las lineas "#") y solo las lineas de datos dan lo mismo.
    for (const text of [block.lines.join('\n'), block.entries.join('\r\n')]) {
        const res = parseAccounts(text);
        assert.deepStrictEqual(res.errors, []);
        assert.strictEqual(res.accounts.length, 9);
        for (const a of res.accounts) {
            assert.strictEqual(a.secret, state.secrets[a.name], a.name);
            assert.strictEqual(a.warning, '');
        }
        assert.deepStrictEqual(res.accounts.map((a) => a.name).sort(), [...MFA_NAMES].sort());
    }
});

// ---- (d) idempotencia

test('un segundo create omite todo: no crea, no cambia hashes ni secretos y no imprime secretos', async (t) => {
    if (!ready || !state.snap) { t.skip('sin MySQL o sin cuentas'); return; }
    const before = JSON.stringify(await snapshot());
    // Otra contrasena: aun asi, nunca se modifica la de una cuenta existente.
    const out = run(['create'], { env: dbEnv({ DEMO_ACCOUNTS_PASSWORD: OTHER_PASSWORD }) });
    assert.strictEqual(out.status, 0, out.stderr);
    assert.strictEqual(JSON.stringify(await snapshot()), before);
    assert.strictEqual((out.stdout.match(/ya existe, se omite/g) || []).length, 11);
    assert.match(out.stdout, /--reissue/);
    assert.strictEqual(parseBlock(out.stdout), null, 'sin bloque de secretos');
    assert.doesNotMatch(out.stdout, /[A-Z2-7]{32}/, 'ningun secreto');
    assert.match(out.stdout, /Creadas ahora: 0/);
    assert.ok(!out.stdout.includes(OTHER_PASSWORD));
    const still = await staffLogin('demo.accesos', state.secrets['demo.accesos']);
    assert.strictEqual(still.status, 200, 'la contrasena original sigue valiendo');
});

test('un rol distinto al esperado detiene create y remove sin cambiar nada', async (t) => {
    if (!ready || !state.snap) { t.skip('sin MySQL o sin cuentas'); return; }
    await pool.query("UPDATE staff_accounts SET role = 'analyst' WHERE username = 'demo.soporte'");
    try {
        const before = JSON.stringify(await snapshot());
        for (const args of [['create'], ['create', '--reissue'], ['remove'], ['remove', '--dry-run']]) {
            const out = run(args);
            assert.notStrictEqual(out.status, 0, args.join(' '));
            assert.match(out.stderr, /demo\.soporte/);
            assert.match(out.stderr, /rol distinto/);
        }
        assert.strictEqual(JSON.stringify(await snapshot()), before);
    } finally {
        await pool.query("UPDATE staff_accounts SET role = 'support' WHERE username = 'demo.soporte'");
    }
    await pool.query("UPDATE users SET role = 'teacher' WHERE username = 'demo.estudiante2'");
    try {
        const out = run(['create']);
        assert.notStrictEqual(out.status, 0);
        assert.match(out.stderr, /demo\.estudiante2/);
    } finally {
        await pool.query("UPDATE users SET role = 'student' WHERE username = 'demo.estudiante2'");
    }
    assert.strictEqual(JSON.stringify(await snapshot()), JSON.stringify(state.snap), 'todo igual que al crear');
});

// ---- (e) reissue

test('create --reissue da secretos nuevos, revoca sesiones y no toca contrasenas', async (t) => {
    if (!ready || !state.secrets) { t.skip('sin MySQL o sin cuentas'); return; }
    const before = await snapshot();
    // Sesion de personal abierta antes del reemisor: debe quedar revocada.
    const oldLogin = await staffLogin('demo.auditor', state.secrets['demo.auditor']);
    const oldToken = (await oldLogin.json()).token;
    assert.strictEqual((await call('GET', '/staff/me', { token: oldToken })).status, 200);

    await pool.query("UPDATE staff_accounts SET failed_attempts = 2 WHERE username = 'demo.juego'");
    await pool.query("UPDATE users SET failed_attempts = 1 WHERE username = ?", [TEACHER]);
    const out = run(['create', '--reissue']);
    assert.strictEqual(out.status, 0, out.stderr);
    assert.strictEqual((await q("SELECT failed_attempts AS n FROM staff_accounts WHERE username = 'demo.juego'"))[0].n, 2, 'no limpia intentos');
    assert.strictEqual((await q('SELECT failed_attempts AS n FROM users WHERE username = ?', [TEACHER]))[0].n, 1, 'no limpia intentos');
    await pool.query("UPDATE staff_accounts SET failed_attempts = 0 WHERE username = 'demo.juego'");
    await pool.query('UPDATE users SET failed_attempts = 0 WHERE username = ?', [TEACHER]);
    const block = parseBlock(out.stdout);
    assert.ok(block);
    assert.deepStrictEqual(Object.keys(block.secrets).sort(), [...MFA_NAMES].sort());
    const after = await snapshot();

    for (const name of MFA_NAMES) {
        const b = before.staff.find((r) => r.username === name) || before.users.find((r) => r.username === name);
        const a = after.staff.find((r) => r.username === name) || after.users.find((r) => r.username === name);
        assert.notStrictEqual(a.mfa, b.mfa, name + ': secreto cifrado nuevo');
        assert.strictEqual(a.token_version, b.token_version + 1, name + ': token_version + 1');
        assert.strictEqual(a.password_hash, b.password_hash, name + ': contrasena intacta');
        assert.notStrictEqual(block.secrets[name], state.secrets[name], name + ': secreto distinto');
        assert.strictEqual(mfaCrypto.decrypt(Buffer.from(a.mfa, 'hex')), block.secrets[name]);
    }
    // Los estudiantes no cambian.
    for (const name of STUDENTS) {
        assert.deepStrictEqual(after.users.find((r) => r.username === name), before.users.find((r) => r.username === name));
    }
    assert.strictEqual((await call('GET', '/staff/me', { token: oldToken })).status, 401, 'sesion anterior revocada');

    // El TOTP viejo ya no sirve y el nuevo si (cada cuenta con MFA).
    const old = state.secrets;
    for (const [username] of STAFF) {
        assert.strictEqual((await staffLogin(username, old[username])).status, 401, username + ' con TOTP viejo');
        assert.strictEqual((await staffLogin(username, block.secrets[username])).status, 200, username + ' con TOTP nuevo');
    }
    const oldTeacher = await teacherSession(old[TEACHER]);
    assert.strictEqual(oldTeacher.second.status, 401, 'docente con TOTP viejo');
    const newTeacher = await teacherSession(block.secrets[TEACHER]);
    assert.strictEqual(newTeacher.second.status, 200);
    assert.strictEqual(newTeacher.secondBody.role, 'teacher');
    state.secrets = block.secrets;
    state.snap = after;
});

// ---- (f) dry-run, (g) cascada, (h) solicitudes

let requestIds = [];

async function insertRequests() {
    const id = async (name) => (await q('SELECT id FROM staff_accounts WHERE username = ?', [name]))[0].id;
    const ins = async (target, action, by, decidedBy, status) => {
        const [r] = await pool.query(
            'INSERT INTO staff_change_requests (target_id, action, requested_by, decided_by, status, decided_at) VALUES (?, ?, ?, ?, ?, ?)',
            [target, action, by, decidedBy, status, decidedBy ? new Date() : null]
        );
        return r.insertId;
    };
    const d = { acc: await id('demo.accesos'), aud: await id('demo.auditor'), sop: await id('demo.soporte'), ana: await id('demo.analista'), mod: await id('demo.moderacion') };
    const c = { sop: await id(CTL.support), aud: await id(CTL.auditor) };
    const ids = {};
    ids.r1 = await ins(d.sop, 'suspend', d.acc, d.aud, 'approved'); // solo demo (objetivo, solicita y decide)
    ids.r2 = await ins(d.ana, 'suspend', d.acc, null, 'pending');   // solo demo
    ids.r3 = await ins(c.sop, 'suspend', d.acc, null, 'pending');   // solicita una demo, objetivo de control
    ids.r4 = await ins(d.mod, 'suspend', c.aud, null, 'pending');   // objetivo demo, solicita una de control
    ids.keep = await ins(c.sop, 'suspend', c.aud, c.aud, 'approved'); // solo control: sobrevive
    return ids;
}

test('remove --dry-run muestra lo que borraria y no cambia nada', async (t) => {
    if (!ready || !state.snap) { t.skip('sin MySQL o sin cuentas'); return; }
    const ids = await insertRequests();
    requestIds = Object.values(ids);
    const [[u1]] = await pool.query('SELECT id FROM users WHERE username = ?', [STUDENTS[0]]);
    await pool.query('INSERT INTO attempts (student_id, activity_id, score, xp_earned) VALUES (?, ?, 2, 20)', [u1.id, activityId]);
    const [[att]] = await pool.query('SELECT id FROM attempts WHERE student_id = ? ORDER BY id DESC LIMIT 1', [u1.id]);
    await pool.query('INSERT INTO attempt_answers (attempt_id, question_id, is_correct) VALUES (?, ?, 1)', [att.id, questionId]);

    const before = JSON.stringify(await snapshot());
    const ctl = await controlState();
    const reqBefore = (await q('SELECT COUNT(*) AS n FROM staff_change_requests WHERE id IN (?)', [requestIds]))[0].n;
    const out = run(['remove', '--dry-run']);
    assert.strictEqual(out.status, 0, out.stderr);
    assert.match(out.stdout, /SIMULACION/);
    assert.match(out.stdout, /No se cambio nada/);
    const c = counts(out.stdout);
    assert.deepStrictEqual(c, {
        staff_change_requests: 4, staff_accounts: 8, daily_completions: 0, attempt_answers: 1,
        attempts: 1, students: 2, teachers: 1, users: 3
    });
    assert.match(out.stdout, /2 involucran tambien/);
    assert.match(out.stdout, /ABORTARIA/);
    assert.match(out.stdout, /--include-foreign-requests/);
    assert.doesNotMatch(out.stdout, /--include-linked-students/);
    for (const id of [ids.r3, ids.r4]) assert.match(out.stdout, new RegExp('solicitud #' + id + ' '));
    assert.strictEqual(JSON.stringify(await snapshot()), before);
    assert.strictEqual(await controlState(), ctl);
    assert.strictEqual((await q('SELECT COUNT(*) AS n FROM staff_change_requests WHERE id IN (?)', [requestIds]))[0].n, reqBefore);
    assert.strictEqual((await q('SELECT COUNT(*) AS n FROM attempts WHERE student_id = ?', [u1.id]))[0].n, 1);
});

test('seguridad de cascada: un estudiante real con el codigo del docente aborta remove sin borrar nada', async (t) => {
    if (!ready || !state.snap) { t.skip('sin MySQL o sin cuentas'); return; }
    const realId = await registerReal(CTL.real1);
    const before = JSON.stringify(await snapshot());
    const ctl0 = await controlState();

    const out = run(['remove']);
    assert.notStrictEqual(out.status, 0);
    assert.match(out.stdout, new RegExp(CTL.real1));
    assert.match(out.stdout, /1 intentos, 30 XP/);
    assert.match(out.stderr, /--include-linked-students/);
    assert.match(out.stderr, /sin borrar nada/);
    assert.strictEqual(JSON.stringify(await snapshot()), before, 'ninguna cuenta demo se borro');
    assert.strictEqual((await q('SELECT COUNT(*) AS n FROM users WHERE id = ?', [realId]))[0].n, 1);
    assert.strictEqual((await q('SELECT COUNT(*) AS n FROM attempts WHERE student_id = ?', [realId]))[0].n, 1);
    assert.strictEqual((await q('SELECT COUNT(*) AS n FROM staff_change_requests WHERE id IN (?)', [requestIds]))[0].n, requestIds.length);
    assert.strictEqual(await controlState(), ctl0);

    // El simulacro avisa del aborto pero termina bien y tampoco cambia nada.
    const dry = run(['remove', '--dry-run']);
    assert.strictEqual(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /ABORTARIA/);
    assert.match(dry.stdout, new RegExp(CTL.real1));
    assert.strictEqual(JSON.stringify(await snapshot()), before);

    // Quitar al estudiante real (limpieza propia) para probar el borrado normal.
    await pool.query('DELETE FROM users WHERE id = ?', [realId]);
});

test('solicitudes de cambio ajenas: remove aborta sin borrar nada, y con --include-foreign-requests las borra', async (t) => {
    if (!ready || !state.snap) { t.skip('sin MySQL o sin cuentas'); return; }
    const before = JSON.stringify(await snapshot());
    const ctl = await controlState();
    const out = run(['remove']);
    assert.notStrictEqual(out.status, 0);
    assert.match(out.stdout, /solicitud #\d+/);
    assert.match(out.stderr, /--include-foreign-requests/);
    assert.match(out.stderr, new RegExp('ids ' + requestIds[2] + ', ' + requestIds[3]));
    assert.doesNotMatch(out.stderr, /--include-linked-students/);
    assert.strictEqual(JSON.stringify(await snapshot()), before, 'no se borro ninguna cuenta');
    assert.strictEqual((await q('SELECT COUNT(*) AS n FROM staff_change_requests WHERE id IN (?)', [requestIds]))[0].n, requestIds.length);
    assert.strictEqual(await controlState(), ctl);
    // Pasar solo la otra opcion no sirve.
    const wrong = run(['remove', '--include-linked-students']);
    assert.notStrictEqual(wrong.status, 0);
    assert.strictEqual(JSON.stringify(await snapshot()), before);
});

test('remove borra exactamente las cuentas demo (conteos por tabla) y deja todo lo demas', async (t) => {
    if (!ready || !state.snap) { t.skip('sin MySQL o sin cuentas'); return; }
    const ctl = await controlState();
    const out = run(['remove', '--include-foreign-requests']);
    assert.strictEqual(out.status, 0, out.stderr);
    assert.deepStrictEqual(counts(out.stdout), {
        staff_change_requests: 4, staff_accounts: 8, daily_completions: 0, attempt_answers: 1,
        attempts: 1, students: 2, teachers: 1, users: 3
    });
    assert.match(out.stdout, /audit_log/);
    assert.match(out.stdout, /solo anadir/);

    const snap = await snapshot();
    assert.strictEqual(snap.staff.length + snap.users.length, 0, 'ninguna cuenta demo queda');
    assert.strictEqual(await controlState(), ctl, 'las filas de control sobreviven intactas');
    // Los nombres "demo.zz-*" (que un LIKE se llevaria) siguen ahi.
    assert.strictEqual((await q('SELECT COUNT(*) AS n FROM staff_accounts WHERE username = ?', [CTL.zzStaff]))[0].n, 1);
    assert.strictEqual((await q('SELECT COUNT(*) AS n FROM users WHERE username = ?', [CTL.zzStudent]))[0].n, 1);
    // Solicitudes: solo sobrevive la de las cuentas de control (h: sin errores de FK).
    const left = await q('SELECT id FROM staff_change_requests WHERE id IN (?)', [requestIds]);
    assert.deepStrictEqual(left.map((r) => r.id), [requestIds[requestIds.length - 1]]);
    // La actividad y la pregunta de la prueba siguen (no se borra contenido).
    assert.strictEqual((await q('SELECT COUNT(*) AS n FROM questions WHERE id = ?', [questionId]))[0].n, 1);
    // Las cuentas ya no entran.
    assert.strictEqual((await staffLogin('demo.accesos', state.secrets['demo.accesos'])).status, 401);

    const again = run(['remove']);
    assert.strictEqual(again.status, 0);
    assert.match(again.stdout, /No hay cuentas demo/);
});

test('un estudiante real con nombre de cuenta de gestion demo (demo.auditor) tambien cuenta como enlazado', async (t) => {
    if (!ready || !state.snap) { t.skip('sin MySQL o sin cuentas'); return; }
    const created = run(['create']);
    assert.strictEqual(created.status, 0, created.stderr);
    assert.strictEqual(Object.keys(parseBlock(created.stdout).secrets).length, 9);
    const teacherId = (await q('SELECT id FROM users WHERE username = ?', [TEACHER]))[0].id;
    const hash = await bcrypt.hash(PASSWORD, 4);
    const ids = [];
    for (const name of ['demo.auditor', 'demo.soporte']) {
        const [r] = await pool.query("INSERT INTO users (role, username, password_hash) VALUES ('student', ?, ?)", [name, hash]);
        await pool.query('INSERT INTO students (user_id, teacher_id, xp) VALUES (?, ?, 7)', [r.insertId, teacherId]);
        await pool.query('INSERT INTO attempts (student_id, activity_id, score, xp_earned) VALUES (?, ?, 1, 7)', [r.insertId, activityId]);
        ids.push(r.insertId);
    }
    const before = JSON.stringify(await snapshot());
    const ctl = await controlState();
    for (const args of [['remove'], ['remove', '--include-foreign-requests']]) {
        const out = run(args);
        assert.notStrictEqual(out.status, 0, args.join(' '));
        assert.match(out.stdout, /demo\.auditor \(id/);
        assert.match(out.stdout, /demo\.soporte \(id/);
        assert.match(out.stdout, /2 estudiantes, 2 intentos, 14 XP/);
        assert.match(out.stderr, /--include-linked-students/);
    }
    const dry = run(['remove', '--dry-run']);
    assert.strictEqual(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /ABORTARIA/);
    assert.strictEqual(JSON.stringify(await snapshot()), before, 'nada se borro');
    assert.strictEqual(await controlState(), ctl);
    assert.strictEqual((await q('SELECT COUNT(*) AS n FROM users WHERE id IN (?)', [ids]))[0].n, 2);
    assert.strictEqual((await q('SELECT COUNT(*) AS n FROM attempts WHERE student_id IN (?)', [ids]))[0].n, 2);
    // Se quitan para el siguiente caso (limpieza propia).
    await pool.query('DELETE FROM users WHERE id IN (?)', [ids]);
});

test('remove --include-linked-students borra tambien a los estudiantes enlazados', async (t) => {
    if (!ready || !state.snap) { t.skip('sin MySQL o sin cuentas'); return; }
    // Las cuentas ya existen del caso anterior. Una solicitud solo entre cuentas demo no bloquea.
    const idOf = async (name) => (await q('SELECT id FROM staff_accounts WHERE username = ?', [name]))[0].id;
    await pool.query(
        "INSERT INTO staff_change_requests (target_id, action, requested_by, decided_by, status, decided_at) VALUES (?, 'suspend', ?, ?, 'approved', NOW())",
        [await idOf('demo.soporte'), await idOf('demo.accesos'), await idOf('demo.auditor')]
    );
    const r1 = await registerReal(CTL.real1);
    const r2 = await registerReal(CTL.real2);
    const ctl = await controlState();

    const blocked = run(['remove']);
    assert.notStrictEqual(blocked.status, 0);
    assert.match(blocked.stdout, /2 estudiantes, 2 intentos, 60 XP/);
    assert.strictEqual((await q('SELECT COUNT(*) AS n FROM users WHERE id IN (?)', [[r1, r2]]))[0].n, 2);

    const out = run(['remove', '--include-linked-students']);
    assert.strictEqual(out.status, 0, out.stderr);
    assert.deepStrictEqual(counts(out.stdout), {
        staff_change_requests: 1, staff_accounts: 8, daily_completions: 0, attempt_answers: 2,
        attempts: 2, students: 4, teachers: 1, users: 5
    });
    assert.strictEqual((await q('SELECT COUNT(*) AS n FROM users WHERE id IN (?)', [[r1, r2]]))[0].n, 0);
    const snap = await snapshot();
    assert.strictEqual(snap.staff.length + snap.users.length, 0);
    assert.strictEqual(await controlState(), ctl);
});

// ---- (j) auditoria

test('la auditoria registra create, reissue y remove, y la cadena sigue valida', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const [rows] = await auditPool.query(
        "SELECT action, target, outcome, actor_type FROM audit_log WHERE id > ? AND action LIKE 'demo.accounts.%' ORDER BY id",
        [auditBaseline]
    );
    const byAction = (a) => rows.filter((r) => r.action === a);
    // create (1.a vez), create (de nuevo tras remove), reissue, remove x3 (normal y con estudiantes).
    assert.strictEqual(byAction('demo.accounts.create').length, 2);
    assert.strictEqual(byAction('demo.accounts.reissue').length, 1);
    assert.strictEqual(byAction('demo.accounts.remove').length, 2);
    for (const r of rows) {
        assert.strictEqual(r.actor_type, 'system');
        assert.strictEqual(r.outcome, 'ok');
        assert.match(r.target, /^\d+ cuentas$/);
        assert.ok(r.action.length <= 60 && r.target.length <= 100);
    }
    assert.deepStrictEqual(byAction('demo.accounts.create').map((r) => r.target), ['11 cuentas', '11 cuentas']);
    assert.deepStrictEqual(byAction('demo.accounts.reissue').map((r) => r.target), ['9 cuentas']);
    assert.deepStrictEqual(byAction('demo.accounts.remove').map((r) => r.target), ['11 cuentas', '13 cuentas']);
    const v = await audit.verify();
    assert.strictEqual(v.ok, true, JSON.stringify(v));
});
