#!/usr/bin/env node
// Crea y retira el conjunto FIJO de cuentas de DEMOSTRACION (se ejecuta en el servidor).
//
//   node scripts/demo-accounts.js create [--allow-production]
//   node scripts/demo-accounts.js create --reissue [--allow-production]
//   node scripts/demo-accounts.js remove [--dry-run] [--include-linked-students] [--allow-production]
//
// El MFA queda ACTIVO en todas las cuentas que lo exigen (docente y los 8 roles de gestion):
// no se debilita ni se omite nada. Cada cuenta con MFA recibe un secreto TOTP generado aqui,
// cifrado en la base como en create-staff.js. Los secretos se imprimen UNA sola vez, en un
// bloque con el formato "usuario: SECRETO" que acepta docs/demo/codigos-totp.html (la pagina
// sin conexion que muestra los codigos). Las contrasenas nunca se imprimen ni se registran.
//
// Contrasena: la variable DEMO_ACCOUNTS_PASSWORD o, si no existe, la entrada estandar (minimo
// 12 caracteres, maximo 72 por bcrypt). Es una sola para todas las cuentas: decision del
// proyecto para una demostracion de unas horas; las cuentas se retiran el mismo dia con `remove`.
//
// Solo se tocan los 11 usuarios de la lista fija DEMO_* (nunca patrones como LIKE 'demo.%').
//   create            crea las que faltan; las que ya existen se omiten (no se les cambia la
//                     contrasena ni se vuelve a mostrar su secreto).
//   create --reissue  genera un secreto MFA nuevo para las que YA existen (se imprime una vez),
//                     sube token_version y revoca sus sesiones. No cambia contrasenas.
//   remove            borra exactamente esas cuentas. users/teachers/students se enlazan con
//                     ON DELETE CASCADE: borrar al docente demo borraria a CUALQUIER estudiante
//                     registrado con su codigo de clase. Por eso, si hay estudiantes enlazados
//                     que no son de la lista, aborta sin borrar nada salvo que se pase
//                     --include-linked-students. --dry-run solo muestra lo que se borraria.
//
// Con NODE_ENV=production el script solo corre si la linea de comandos incluye
// --allow-production (ninguna variable de entorno lo habilita). La auditoria (audit_log) es
// de solo anadir por diseno: las filas de auditoria no se borran.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const readline = require('readline');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool = require('../src/config/db');
const totp = require('../src/utils/totp');
const mfaCrypto = require('../src/utils/mfaCrypto');
const audit = require('../src/services/audit.service');
const { closeAuditPool } = require('../src/config/auditDb');
const { isStaffRole, areaForRole } = require('../src/config/staffRoles');

const MIN_PASSWORD = 12;
const MAX_PASSWORD = 72; // bcrypt solo usa los primeros 72 bytes
const STAFF_ROUNDS = 12; // igual que create-staff.js
const PLATFORM_ROUNDS = 10; // igual que SALT_ROUNDS de auth.service
const CLASS_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // igual que staffAccounts.service
const CLASS_CODE_TRIES = 10;
const PASSWORD_ENV = 'DEMO_ACCOUNTS_PASSWORD';

// Lista fija, definida una sola vez.
const DEMO_STAFF = [
    ['demo.accesos', 'access_manager'],
    ['demo.auditor', 'auditor'],
    ['demo.analista', 'analyst'],
    ['demo.contenido', 'content_manager'],
    ['demo.revision', 'content_reviewer'],
    ['demo.juego', 'game_manager'],
    ['demo.moderacion', 'moderator'],
    ['demo.soporte', 'support']
];
const DEMO_TEACHER = { username: 'demo.docente', displayName: 'Docente de demostracion' };
const DEMO_STUDENTS = ['demo.estudiante1', 'demo.estudiante2'];

const STAFF_NAMES = DEMO_STAFF.map(([u]) => u);
const PLATFORM_NAMES = [DEMO_TEACHER.username, ...DEMO_STUDENTS];
const ALL_NAMES = [...STAFF_NAMES, ...PLATFORM_NAMES];
const EXPECTED_STAFF_ROLE = new Map(DEMO_STAFF);

const USAGE = [
    'Uso:',
    '  node scripts/demo-accounts.js create [--allow-production]',
    '  node scripts/demo-accounts.js create --reissue [--allow-production]',
    '  node scripts/demo-accounts.js remove [--dry-run] [--include-linked-students] [--allow-production]'
].join('\n');

const ALLOWED_FLAGS = {
    create: ['--allow-production', '--reissue'],
    remove: ['--allow-production', '--dry-run', '--include-linked-students']
};

class UserError extends Error {}

function parseArgs(argv) {
    const args = argv.slice(2);
    const positional = args.filter((a) => !a.startsWith('--'));
    const flags = args.filter((a) => a.startsWith('--'));
    const command = positional[0];
    if (positional.length !== 1 || !ALLOWED_FLAGS[command]) throw new UserError(USAGE);
    const unknown = flags.filter((f) => !ALLOWED_FLAGS[command].includes(f));
    if (unknown.length > 0) {
        throw new UserError('Opcion no valida para "' + command + '": ' + unknown.join(', ') + '\n' + USAGE);
    }
    return { command, flags: new Set(flags) };
}

// El permiso para correr en produccion viaja SOLO en la linea de comandos.
function assertProductionGuard() {
    if (process.env.NODE_ENV === 'production' && !process.argv.includes('--allow-production')) {
        throw new UserError(
            'Con NODE_ENV=production este script solo corre si el comando incluye --allow-production ' +
            '(crea o retira las cuentas de demostracion).'
        );
    }
}

function ask(query) {
    return new Promise((resolve) => {
        process.stdout.write(query);
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
        let answered = false;
        rl.once('line', (line) => { answered = true; rl.close(); resolve(line.trim()); });
        // Sin entrada interactiva (EOF): se resuelve vacio para fallar con un mensaje claro.
        rl.once('close', () => { if (!answered) resolve(''); });
    });
}

async function readPassword() {
    let password;
    if (typeof process.env[PASSWORD_ENV] === 'string') {
        password = process.env[PASSWORD_ENV];
    } else {
        password = await ask('Contrasena compartida para las cuentas demo (' + MIN_PASSWORD + ' a ' + MAX_PASSWORD + ' caracteres): ');
        if (password === '') {
            throw new UserError('No se recibio la contrasena. Define ' + PASSWORD_ENV + ' o escribela por entrada estandar.');
        }
    }
    if (password.length < MIN_PASSWORD) {
        throw new UserError('La contrasena debe tener al menos ' + MIN_PASSWORD + ' caracteres.');
    }
    if (password.length > MAX_PASSWORD || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD) {
        throw new UserError('La contrasena debe tener como maximo ' + MAX_PASSWORD + ' caracteres (limite de bcrypt).');
    }
    return password;
}

function generateClassCode() {
    let code = '';
    for (let i = 0; i < 6; i += 1) code += CLASS_CODE_CHARS[crypto.randomInt(CLASS_CODE_CHARS.length)];
    return code;
}

// Lee las cuentas demo que ya existen y valida el ROLE de cada una. Si un nombre de la lista
// existe con otro rol se detiene sin cambiar nada.
async function loadExisting(conn, { lock = false } = {}) {
    const suffix = lock ? ' FOR UPDATE' : '';
    const [staffRows] = await conn.query(
        'SELECT id, username, role, status, token_version FROM staff_accounts WHERE username IN (?)' + suffix,
        [STAFF_NAMES]
    );
    const [userRows] = await conn.query(
        'SELECT id, username, role, mfa_secret_enc FROM users WHERE username IN (?)' + suffix,
        [PLATFORM_NAMES]
    );
    const bad = [];
    for (const r of staffRows) {
        if (r.role !== EXPECTED_STAFF_ROLE.get(r.username)) {
            bad.push(`${r.username} (gestion: es ${r.role}, se esperaba ${EXPECTED_STAFF_ROLE.get(r.username)})`);
        }
    }
    for (const r of userRows) {
        const expected = r.username === DEMO_TEACHER.username ? 'teacher' : 'student';
        if (r.role !== expected) bad.push(`${r.username} (plataforma: es ${r.role}, se esperaba ${expected})`);
    }
    if (bad.length > 0) {
        throw new UserError(
            'Hay cuentas demo con un rol distinto al esperado; no se cambio nada: ' + bad.join('; ') +
            '. Revisalas a mano antes de continuar.'
        );
    }
    return {
        staff: new Map(staffRows.map((r) => [r.username, r])),
        users: new Map(userRows.map((r) => [r.username, r]))
    };
}

function secretBlock(entries) {
    const lines = [];
    lines.push('# ---- INICIO del bloque para docs/demo/codigos-totp.html (se muestra UNA sola vez) ----');
    for (const [username, secret] of entries) lines.push(`${username}: ${secret}`);
    lines.push('# ---- FIN del bloque ----');
    return lines.join('\n');
}

function printSecretInstructions(count) {
    console.log('\nSecretos MFA (' + count + '): se muestran UNA sola vez y no se pueden volver a consultar.');
    console.log('Pega el bloque en la pagina docs/demo/codigos-totp.html (puedes copiar tambien las lineas');
    console.log('que empiezan con "#": la pagina las ignora). Despues limpia la terminal y el historial.');
}

// ------------------------------------------------------------------ create

async function createAccounts() {
    const password = await readPassword();
    const conn = await pool.getConnection();
    let inTransaction = false;
    try {
        await conn.beginTransaction();
        inTransaction = true;
        const existing = await loadExisting(conn, { lock: true });

        const results = []; // { username, kind, detail, status }
        const secrets = [];
        let created = 0;
        let staffHash = null;
        let platformHash = null;

        for (const [username, role] of DEMO_STAFF) {
            if (existing.staff.has(username)) {
                results.push({ username, kind: 'gestion', detail: `${role} (area: ${areaForRole(role)})`, status: 'ya existe, se omite' });
                continue;
            }
            if (!isStaffRole(role)) throw new Error('Rol no soportado: ' + role);
            if (!staffHash) staffHash = await bcrypt.hash(password, STAFF_ROUNDS);
            const secret = totp.generateSecret();
            await conn.query(
                'INSERT INTO staff_accounts (username, password_hash, role, mfa_secret_enc) VALUES (?, ?, ?, ?)',
                [username, staffHash, role, mfaCrypto.encrypt(secret)]
            );
            secrets.push([username, secret]);
            created += 1;
            results.push({ username, kind: 'gestion', detail: `${role} (area: ${areaForRole(role)})`, status: 'creada' });
        }

        let teacherId;
        let classCode = null;
        const existingTeacher = existing.users.get(DEMO_TEACHER.username);
        if (existingTeacher) {
            teacherId = existingTeacher.id;
            const [[row]] = await conn.query('SELECT class_code FROM teachers WHERE user_id = ?', [teacherId]);
            classCode = row ? row.class_code : null;
            const warn = existingTeacher.mfa_secret_enc ? '' : ' [SIN MFA activo: usa --reissue]';
            results.push({
                username: DEMO_TEACHER.username, kind: 'docente',
                detail: 'codigo de clase ' + (classCode || '(sin fila en teachers)'), status: 'ya existe, se omite' + warn
            });
        } else {
            platformHash = await bcrypt.hash(password, PLATFORM_ROUNDS);
            const secret = totp.generateSecret();
            // MFA activo desde el inicio y sin cambio obligatorio de contrasena (must_change_password = 0).
            const [userResult] = await conn.query(
                'INSERT INTO users (role, username, password_hash, must_change_password, mfa_secret_enc) VALUES (?, ?, ?, 0, ?)',
                ['teacher', DEMO_TEACHER.username, platformHash, mfaCrypto.encrypt(secret)]
            );
            teacherId = userResult.insertId;
            for (let attempt = 1; ; attempt += 1) {
                classCode = generateClassCode();
                try {
                    // El grado queda en NULL para que la demostracion lo declare.
                    await conn.query(
                        'INSERT INTO teachers (user_id, display_name, class_code) VALUES (?, ?, ?)',
                        [teacherId, DEMO_TEACHER.displayName, classCode]
                    );
                    break;
                } catch (err) {
                    if (err.code === 'ER_DUP_ENTRY' && attempt < CLASS_CODE_TRIES) continue;
                    throw err;
                }
            }
            secrets.push([DEMO_TEACHER.username, secret]);
            created += 1;
            results.push({
                username: DEMO_TEACHER.username, kind: 'docente',
                detail: 'codigo de clase ' + classCode + ', MFA activo, grado sin declarar', status: 'creada'
            });
        }

        for (const username of DEMO_STUDENTS) {
            if (existing.users.has(username)) {
                results.push({ username, kind: 'estudiante', detail: 'sin MFA', status: 'ya existe, se omite' });
                continue;
            }
            if (!platformHash) platformHash = await bcrypt.hash(password, PLATFORM_ROUNDS);
            const [res] = await conn.query(
                'INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)',
                ['student', username, platformHash]
            );
            await conn.query('INSERT INTO students (user_id, teacher_id) VALUES (?, ?)', [res.insertId, teacherId]);
            created += 1;
            results.push({ username, kind: 'estudiante', detail: 'sin MFA, enlazado al docente demo', status: 'creada' });
        }

        await conn.commit();
        inTransaction = false;

        if (created > 0) {
            await audit.record({ actorType: 'system', action: 'demo.accounts.create', target: `${created} cuentas`, outcome: 'ok' });
        }

        console.log('\nCuentas de demostracion:');
        for (const r of results) {
            console.log(`  ${r.username.padEnd(18)} ${r.kind.padEnd(11)} ${r.detail} -> ${r.status}`);
        }
        console.log(`\nCreadas ahora: ${created}. Omitidas: ${results.length - created}.`);
        if (created < results.length) {
            console.log('De las omitidas no se puede mostrar el secreto otra vez. Para emitir uno nuevo usa:');
            console.log('  node scripts/demo-accounts.js create --reissue');
        }
        if (secrets.length > 0) {
            printSecretInstructions(secrets.length);
            console.log('\n' + secretBlock(secrets));
        }
        console.log('\nLa contrasena es la que indicaste (compartida por todas las cuentas); no se imprime.');
        console.log('RECUERDA: al terminar la demostracion retira estas cuentas con:');
        console.log('  node scripts/demo-accounts.js remove');
    } catch (err) {
        if (inTransaction) { try { await conn.rollback(); } catch { /* conexion perdida */ } }
        if (err.code === 'ER_DUP_ENTRY') {
            throw new UserError('Una cuenta demo aparecio mientras se creaba (' + err.message + '). No se creo nada; vuelve a correr el comando.');
        }
        throw err;
    } finally {
        conn.release();
    }
}

// ----------------------------------------------------------------- reissue

async function reissueAccounts() {
    const conn = await pool.getConnection();
    let inTransaction = false;
    try {
        await conn.beginTransaction();
        inTransaction = true;
        const existing = await loadExisting(conn, { lock: true });

        const secrets = [];
        const missing = [];
        for (const [username] of DEMO_STAFF) {
            const row = existing.staff.get(username);
            if (!row) { missing.push(username); continue; }
            const secret = totp.generateSecret();
            await conn.query(
                `UPDATE staff_accounts
                 SET mfa_secret_enc = ?, token_version = token_version + 1, failed_attempts = 0, locked_until = NULL
                 WHERE id = ?`,
                [mfaCrypto.encrypt(secret), row.id]
            );
            secrets.push([username, secret]);
        }
        const teacher = existing.users.get(DEMO_TEACHER.username);
        if (!teacher) {
            missing.push(DEMO_TEACHER.username);
        } else {
            const secret = totp.generateSecret();
            await conn.query(
                `UPDATE users
                 SET mfa_secret_enc = ?, mfa_pending_enc = NULL, mfa_pending_expires_at = NULL,
                     token_version = token_version + 1, failed_attempts = 0, locked_until = NULL
                 WHERE id = ? AND role = 'teacher'`,
                [mfaCrypto.encrypt(secret), teacher.id]
            );
            secrets.push([DEMO_TEACHER.username, secret]);
        }
        await conn.commit();
        inTransaction = false;

        if (secrets.length > 0) {
            await audit.record({ actorType: 'system', action: 'demo.accounts.reissue', target: `${secrets.length} cuentas`, outcome: 'ok' });
        }

        console.log(`\nSecretos MFA reemitidos: ${secrets.length}. Las sesiones abiertas de esas cuentas quedaron revocadas.`);
        console.log('No se cambio ninguna contrasena. Los secretos anteriores ya no sirven.');
        if (missing.length > 0) {
            console.log('No existen (no se crearon con --reissue; usa "create" sin esa opcion): ' + missing.join(', '));
        }
        if (secrets.length > 0) {
            printSecretInstructions(secrets.length);
            console.log('\n' + secretBlock(secrets));
        }
        console.log('\nRECUERDA: al terminar la demostracion retira estas cuentas con:');
        console.log('  node scripts/demo-accounts.js remove');
    } catch (err) {
        if (inTransaction) { try { await conn.rollback(); } catch { /* conexion perdida */ } }
        throw err;
    } finally {
        conn.release();
    }
}

// ------------------------------------------------------------------ remove

// Calcula lo que habria que borrar. Con lock = true toma bloqueos de escritura sobre las
// filas demo (incluido el docente) para que nadie pueda registrar un estudiante con su codigo
// entre la comprobacion y el borrado.
async function planRemoval(conn, { lock }) {
    const existing = await loadExisting(conn, { lock });
    const staffIds = [...existing.staff.values()].map((r) => r.id);
    const teacher = existing.users.get(DEMO_TEACHER.username) || null;
    const demoStudentIds = DEMO_STUDENTS.filter((u) => existing.users.has(u)).map((u) => existing.users.get(u).id);

    let linkedExtras = [];
    if (teacher) {
        if (lock) await conn.query('SELECT user_id FROM teachers WHERE user_id = ? FOR UPDATE', [teacher.id]);
        const [rows] = await conn.query(
            `SELECT s.user_id AS id, u.username, s.xp,
                    (SELECT COUNT(*) FROM attempts a WHERE a.student_id = s.user_id) AS attempts
             FROM students s JOIN users u ON u.id = s.user_id
             WHERE s.teacher_id = ? AND u.username NOT IN (?)
             ORDER BY u.username`,
            [teacher.id, ALL_NAMES]
        );
        linkedExtras = rows.map((r) => ({ id: r.id, username: r.username, xp: Number(r.xp), attempts: Number(r.attempts) }));
    }
    return { existing, staffIds, teacher, demoStudentIds, linkedExtras };
}

async function countBy(conn, sql, ids) {
    if (ids.length === 0) return 0;
    const [[row]] = await conn.query(sql, [ids]);
    return Number(row.n);
}

async function countRequests(conn, staffIds) {
    if (staffIds.length === 0) return { total: 0, foreign: 0 };
    const [[t]] = await conn.query(
        `SELECT COUNT(*) AS n FROM staff_change_requests
         WHERE target_id IN (?) OR requested_by IN (?) OR decided_by IN (?)`,
        [staffIds, staffIds, staffIds]
    );
    const [[w]] = await conn.query(
        `SELECT COUNT(*) AS n FROM staff_change_requests
         WHERE target_id IN (?) AND requested_by IN (?) AND (decided_by IS NULL OR decided_by IN (?))`,
        [staffIds, staffIds, staffIds]
    );
    return { total: Number(t.n), foreign: Number(t.n) - Number(w.n) };
}

function printFound(plan) {
    console.log('\nCuentas demo encontradas:');
    for (const username of ALL_NAMES) {
        const found = plan.existing.staff.has(username) || plan.existing.users.has(username);
        console.log(`  ${username.padEnd(18)} ${found ? 'existe' : 'no existe'}`);
    }
}

function printExtras(plan) {
    console.log('\nEstudiantes enlazados al docente demo que NO son de la lista (se perderian con el docente):');
    for (const s of plan.linkedExtras) {
        console.log(`  ${s.username} (id ${s.id}): ${s.attempts} intentos, ${s.xp} XP`);
    }
    const attempts = plan.linkedExtras.reduce((n, s) => n + s.attempts, 0);
    const xp = plan.linkedExtras.reduce((n, s) => n + s.xp, 0);
    console.log(`  Total: ${plan.linkedExtras.length} estudiantes, ${attempts} intentos, ${xp} XP.`);
}

function printSummary(title, counts, requests) {
    console.log('\n' + title);
    console.log(`  staff_change_requests: ${counts.staff_change_requests}`);
    console.log(`  staff_accounts:        ${counts.staff_accounts}`);
    console.log(`  daily_completions:     ${counts.daily_completions}`);
    console.log(`  attempt_answers:       ${counts.attempt_answers}`);
    console.log(`  attempts:              ${counts.attempts}`);
    console.log(`  students:              ${counts.students}`);
    console.log(`  teachers:              ${counts.teachers}`);
    console.log(`  users:                 ${counts.users}`);
    if (requests && requests.foreign > 0) {
        console.log(`  (de las solicitudes de cambio, ${requests.foreign} involucran tambien a cuentas de gestion que no son demo)`);
    }
}

async function removeAccounts(flags) {
    const dryRun = flags.has('--dry-run');
    const includeLinked = flags.has('--include-linked-students');
    const conn = await pool.getConnection();
    let inTransaction = false;
    try {
        await conn.beginTransaction();
        inTransaction = true;
        const plan = await planRemoval(conn, { lock: !dryRun });
        printFound(plan);

        const accountCount = plan.staffIds.length + plan.demoStudentIds.length + (plan.teacher ? 1 : 0);
        const blocked = plan.linkedExtras.length > 0 && !includeLinked;
        const studentIds = [...plan.demoStudentIds, ...(includeLinked ? plan.linkedExtras.map((s) => s.id) : [])];

        if (plan.linkedExtras.length > 0) printExtras(plan);

        if (dryRun) {
            const requests = await countRequests(conn, plan.staffIds);
            const counts = {
                staff_change_requests: requests.total,
                staff_accounts: plan.staffIds.length,
                daily_completions: await countBy(conn, 'SELECT COUNT(*) AS n FROM daily_completions WHERE student_id IN (?)', studentIds),
                attempt_answers: await countBy(conn,
                    'SELECT COUNT(*) AS n FROM attempt_answers WHERE attempt_id IN (SELECT id FROM attempts WHERE student_id IN (?))', studentIds),
                attempts: await countBy(conn, 'SELECT COUNT(*) AS n FROM attempts WHERE student_id IN (?)', studentIds),
                students: studentIds.length,
                teachers: plan.teacher ? 1 : 0,
                users: studentIds.length + (plan.teacher ? 1 : 0)
            };
            await conn.rollback();
            inTransaction = false;
            if (blocked) {
                console.log('\nATENCION: un "remove" real ABORTARIA sin borrar nada por esos estudiantes. Con --include-linked-students los borraria tambien.');
            }
            printSummary('SIMULACION (--dry-run): se borraria' + (blocked ? ' (si se pasara --include-linked-students)' : '') + ':', counts, requests);
            console.log('No se cambio nada.');
            return;
        }

        if (accountCount === 0) {
            await conn.rollback();
            inTransaction = false;
            console.log('\nNo hay cuentas demo para retirar.');
            return;
        }

        if (blocked) {
            await conn.rollback();
            inTransaction = false;
            throw new UserError(
                'Se aborta sin borrar nada: hay ' + plan.linkedExtras.length + ' estudiante(s) enlazado(s) al docente demo que no son de la lista ' +
                '(ver arriba). Borrar al docente los eliminaria junto con su avance. Si de verdad quieres borrarlos, repite con --include-linked-students.'
            );
        }

        const requests = await countRequests(conn, plan.staffIds);
        const counts = {};
        const del = async (key, sql, ids, params = [ids]) => {
            if (ids.length === 0) { counts[key] = 0; return; }
            const [res] = await conn.query(sql, params);
            counts[key] = res.affectedRows;
        };
        const sid = plan.staffIds;
        // Orden: primero lo que referencia (sin cascada en staff), despues los padres.
        await del('staff_change_requests',
            'DELETE FROM staff_change_requests WHERE target_id IN (?) OR requested_by IN (?) OR decided_by IN (?)',
            sid, [sid, sid, sid]);
        await del('staff_accounts', 'DELETE FROM staff_accounts WHERE id IN (?)', sid);
        await del('daily_completions', 'DELETE FROM daily_completions WHERE student_id IN (?)', studentIds);
        await del('attempt_answers',
            'DELETE FROM attempt_answers WHERE attempt_id IN (SELECT id FROM attempts WHERE student_id IN (?))', studentIds);
        await del('attempts', 'DELETE FROM attempts WHERE student_id IN (?)', studentIds);
        await del('students', 'DELETE FROM students WHERE user_id IN (?)', studentIds);
        await del('teachers', 'DELETE FROM teachers WHERE user_id IN (?)', plan.teacher ? [plan.teacher.id] : []);
        await del('users', 'DELETE FROM users WHERE id IN (?)', plan.teacher ? [...studentIds, plan.teacher.id] : studentIds);

        await conn.commit();
        inTransaction = false;

        const totalAccounts = counts.staff_accounts + counts.users;
        await audit.record({ actorType: 'system', action: 'demo.accounts.remove', target: `${totalAccounts} cuentas`, outcome: 'ok' });

        printSummary('Borrado (filas por tabla):', counts, requests);
        console.log('\nLas filas de audit_log NO se borran: es un registro de solo anadir por diseno y se conservan.');
        console.log('Cuentas demo retiradas.');
    } catch (err) {
        if (inTransaction) { try { await conn.rollback(); } catch { /* conexion perdida */ } }
        throw err;
    } finally {
        conn.release();
    }
}

// -------------------------------------------------------------------- main

async function main() {
    let parsed;
    try {
        parsed = parseArgs(process.argv);
        assertProductionGuard();
    } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
        return;
    }

    try {
        if (parsed.command === 'create') {
            if (parsed.flags.has('--reissue')) await reissueAccounts();
            else await createAccounts();
        } else {
            await removeAccounts(parsed.flags);
        }
    } catch (err) {
        if (err instanceof UserError) {
            console.error(err.message);
        } else {
            console.error('No se pudo completar la operacion:', err.message || err.code || err);
        }
        process.exitCode = 1;
    } finally {
        try { await closeAuditPool(); } catch { /* sin conexiones */ }
        try { await pool.end(); } catch { /* sin conexiones */ }
    }
}

main();
