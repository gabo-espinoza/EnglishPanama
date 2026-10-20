#!/usr/bin/env node
// Regenera el secreto TOTP de una cuenta de gestion (por si se pierde el celular).
// Queda registrado en auditoria.
//
//   node scripts/reset-staff-mfa.js <usuario>
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('../src/config/db');
const totp = require('../src/utils/totp');
const mfaCrypto = require('../src/utils/mfaCrypto');
const audit = require('../src/services/audit.service');
const { closeAuditPool } = require('../src/config/auditDb');

async function main() {
    const [username] = process.argv.slice(2);
    if (!username) {
        console.error('Uso: node scripts/reset-staff-mfa.js <usuario>');
        process.exit(1);
    }

    const [rows] = await pool.query('SELECT id, role FROM staff_accounts WHERE username = ?', [username]);
    if (rows.length === 0) {
        console.error('No existe una cuenta de gestion con ese usuario.');
        process.exit(1);
    }

    const secret = totp.generateSecret();
    await pool.query(
        'UPDATE staff_accounts SET mfa_secret_enc = ?, token_version = token_version + 1 WHERE id = ?',
        [mfaCrypto.encrypt(secret), rows[0].id]
    );
    await audit.record({
        actorType: 'system', action: 'staff.mfa.reset',
        target: username, outcome: 'ok'
    });

    console.log('Secreto TOTP regenerado para ' + username + '.');
    console.log('Escanea este nuevo codigo (se muestra UNA vez):');
    console.log('  ' + totp.keyUri({ secret, label: username }));
}

main()
    .catch((err) => { console.error('Error:', err.message); process.exitCode = 1; })
    .finally(async () => { await closeAuditPool(); await pool.end(); });
