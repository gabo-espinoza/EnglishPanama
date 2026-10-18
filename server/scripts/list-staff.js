#!/usr/bin/env node
// Lista las cuentas de gestion (solo lectura). No muestra secretos ni contrasenas.
//
//   node scripts/list-staff.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('../src/config/db');
const { areaForRole } = require('../src/config/staffRoles');

async function main() {
    const [rows] = await pool.query(
        `SELECT id, username, role, status, created_at
         FROM staff_accounts ORDER BY role ASC, username ASC`
    );
    if (rows.length === 0) {
        console.log('No hay cuentas de gestion.');
        return;
    }
    console.log(`Total de cuentas de gestion: ${rows.length}\n`);
    console.log('id  usuario            rol                area      estado');
    console.log('--  -----------------  -----------------  --------  ---------');
    for (const row of rows) {
        console.log(
            String(row.id).padEnd(3)
            + ' ' + String(row.username).padEnd(18)
            + ' ' + String(row.role).padEnd(18)
            + ' ' + String(areaForRole(row.role) || '-').padEnd(9)
            + ' ' + row.status
        );
    }
}

main()
    .catch((err) => { console.error('Error:', err.message); process.exitCode = 1; })
    .finally(() => pool.end());
