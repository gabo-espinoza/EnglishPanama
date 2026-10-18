// Siembra las cuentas de gestion de DEMOSTRACION (idempotente).
//
//   node scripts/seed-demo-staff.js
//
// Crea 3 cuentas por cada rol (24 en total) repartidas en 7 departamentos,
// para demostrar que la administracion esta dividida y que ningun usuario
// tiene el control total. Si una cuenta ya existe, se deja igual.
//
// SOLO PARA DESARROLLO Y DEMOSTRACION. Se niega a correr con NODE_ENV=production:
// en produccion las cuentas se crean una a una con scripts/create-staff.js.
//
// La contrasena sale de la variable DEMO_STAFF_PASSWORD (obligatoria, minimo 12
// caracteres, sin valor por defecto en el codigo). El secreto TOTP se genera, se cifra
// y NUNCA se imprime: para entregar el MFA a una persona se usa scripts/reset-staff-mfa.js.
//
// Requiere que staff.sql ya este cargado (el script no modifica el esquema).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt = require('bcrypt');
const pool = require('../src/config/db');
const totp = require('../src/utils/totp');
const mfaCrypto = require('../src/utils/mfaCrypto');
const audit = require('../src/services/audit.service');
const { closeAuditPool } = require('../src/config/auditDb');
const { STAFF_ROLES, areaForRole } = require('../src/config/staffRoles');

const MIN_PASSWORD = 12;

// 3 cuentas por rol. Los alias son genericos (nunca nombres reales).
const ROSTER = [
    ['ana.accesos', 'access_manager'],
    ['bruno.accesos', 'access_manager'],
    ['nadia.accesos', 'access_manager'],
    ['carla.auditor', 'auditor'],
    ['diego.auditor', 'auditor'],
    ['oscar.auditor', 'auditor'],
    ['elena.contenido', 'content_manager'],
    ['fran.contenido', 'content_manager'],
    ['pablo.contenido', 'content_manager'],
    ['gabriela.revision', 'content_reviewer'],
    ['hugo.revision', 'content_reviewer'],
    ['rosa.revision', 'content_reviewer'],
    ['irene.juego', 'game_manager'],
    ['jorge.juego', 'game_manager'],
    ['sergio.juego', 'game_manager'],
    ['karla.soporte', 'support'],
    ['luis.soporte', 'support'],
    ['tomas.soporte', 'support'],
    ['ulises.datos', 'analyst'],
    ['valeria.datos', 'analyst'],
    ['wendy.datos', 'analyst'],
    ['ximena.comunidad', 'moderator'],
    ['yago.comunidad', 'moderator'],
    ['zoe.comunidad', 'moderator']
];

function assertSafeToRun() {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Este script es solo de demostracion y no corre con NODE_ENV=production. '
            + 'Usa scripts/create-staff.js para crear cuentas reales.');
    }
    const password = process.env.DEMO_STAFF_PASSWORD; if (typeof password !== 'string') throw new Error('Define DEMO_STAFF_PASSWORD en el .env (minimo ' + MIN_PASSWORD + ' caracteres).');
    if (password.length < MIN_PASSWORD) {
        throw new Error(`Define DEMO_STAFF_PASSWORD en el .env (minimo ${MIN_PASSWORD} caracteres).`);
    }
    return password;
}

async function main() {
    try { var PASSWORD = assertSafeToRun(); } catch (e) { console.error(e.message || 'Error'); process.exitCode = 1; return; }

    for (const [, role] of ROSTER) {
        if (!STAFF_ROLES.includes(role)) {
            throw new Error('Rol no soportado: ' + role);
        }
    }

    const [existingRows] = await pool.query('SELECT username FROM staff_accounts');
    const existing = new Set(existingRows.map((r) => r.username));

    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    let created = 0;

    for (const [username, role] of ROSTER) {
        if (existing.has(username)) continue;
        const secret = totp.generateSecret();
        await pool.query(
            `INSERT INTO staff_accounts (username, password_hash, role, mfa_secret_enc)
             VALUES (?, ?, ?, ?)`,
            [username, passwordHash, role, mfaCrypto.encrypt(secret)]
        );
        await audit.record({
            actorType: 'system', action: 'staff.create',
            target: `${username}:${role}`, outcome: 'ok'
        });
        created += 1;
    }

    const [byRole] = await pool.query(
        'SELECT role, COUNT(*) AS n FROM staff_accounts GROUP BY role ORDER BY role'
    );

    console.log(`Cuentas creadas ahora: ${created}`);
    console.log(`Cuentas de gestion totales: ${ROSTER.length} (objetivo) / ` +
        byRole.reduce((s, r) => s + Number(r.n), 0) + ' en la base');
    console.log('Reparto por rol:');
    for (const r of byRole) {
        console.log(`  ${r.role}: ${r.n} (area: ${areaForRole(r.role)})`);
    }
}

main()
    .then(async () => { await closeAuditPool(); await pool.end(); })
    .catch(async (err) => {
        console.error('Error sembrando cuentas:', err.message);
        try { await closeAuditPool(); await pool.end(); } catch { /* sin conexiones */ }
        process.exitCode = 1;
    });
