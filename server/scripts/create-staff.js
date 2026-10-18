#!/usr/bin/env node
// Crea una cuenta de gestion (solo se ejecuta en el servidor, por SSH).
//
//   node scripts/create-staff.js <usuario> <rol>
//
// La contrasena se pide por entrada estandar (no por argumento, para no dejarla
// en el historial del shell). Genera el secreto TOTP, lo cifra y muestra una sola
// vez el URI otpauth:// para que el gestor lo escanee con su app de autenticacion.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const readline = require('readline');
const bcrypt = require('bcrypt');
const pool = require('../src/config/db');
const totp = require('../src/utils/totp');
const mfaCrypto = require('../src/utils/mfaCrypto');
const audit = require('../src/services/audit.service');
const { closeAuditPool } = require('../src/config/auditDb');
const { isStaffRole, areaForRole, STAFF_ROLES } = require('../src/config/staffRoles');

const MIN_PASSWORD = 12;

function ask(query) {
    return new Promise((resolve) => {
        process.stdout.write(query);
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
        rl.once('line', (line) => { rl.close(); resolve(line.trim()); });
    });
}

async function main() {
    const [username, role] = process.argv.slice(2);
    if (!username || !role) {
        console.error('Uso: node scripts/create-staff.js <usuario> <rol>');
        console.error('Roles: ' + STAFF_ROLES.join(', '));
        process.exit(1);
    }
    if (!isStaffRole(role)) {
        console.error('Rol invalido. Roles permitidos: ' + STAFF_ROLES.join(', '));
        process.exit(1);
    }

    const password = await ask(`Contrasena para ${username} (min ${MIN_PASSWORD} caracteres): `);
    if (password.length < MIN_PASSWORD) {
        console.error('La contrasena debe tener al menos ' + MIN_PASSWORD + ' caracteres.');
        process.exit(1);
    }

    const secret = totp.generateSecret();
    const passwordHash = await bcrypt.hash(password, 12);

    try {
        const [result] = await pool.query(
            `INSERT INTO staff_accounts (username, password_hash, role, mfa_secret_enc)
             VALUES (?, ?, ?, ?)`,
            [username, passwordHash, role, mfaCrypto.encrypt(secret)]
        );
        await audit.record({
            actorType: 'system', action: 'staff.create',
            target: `${username}:${role}`, outcome: 'ok'
        });
        console.log('\nCuenta creada:');
        console.log('  id:    ' + result.insertId);
        console.log('  usuario: ' + username);
        console.log('  rol:     ' + role + ' (area: ' + areaForRole(role) + ')');
        console.log('\nEscanea este codigo en tu app de autenticacion (se muestra UNA vez):');
        console.log('  ' + totp.keyUri({ secret, label: username }));
        console.log('\nGuarda el codigo en un lugar seguro. Si se pierde, usa reset-staff-mfa.js.');
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            console.error('Ese usuario de gestion ya existe.');
        } else {
            console.error('No se pudo crear la cuenta:', err.message);
        }
        process.exitCode = 1;
    } finally {
        await closeAuditPool();
        await pool.end();
    }
}

main();
