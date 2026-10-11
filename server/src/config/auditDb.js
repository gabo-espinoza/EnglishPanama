// Conexion a la base de auditoria.
//
// La auditoria va en una base aparte (`englishpanama_audit`) con un usuario propio
// (`audit_writer`) que solo puede INSERT y SELECT: nadie desde la app puede editar
// ni borrar el registro. Si no hay variables AUDIT_DB_* configuradas se reutiliza la
// base principal (solo para desarrollo local); en produccion se configura siempre.
const mysql = require('mysql2/promise');

let pool = null;

function hasSeparateAuditDb() {
    return Boolean(process.env.AUDIT_DB_NAME);
}

function getAuditPool() {
    if (pool) return pool;

    if (hasSeparateAuditDb()) {
        pool = mysql.createPool({
            host: process.env.AUDIT_DB_HOST || process.env.DB_HOST,
            user: process.env.AUDIT_DB_USER || process.env.DB_USER,
            password: process.env.AUDIT_DB_PASSWORD || process.env.DB_PASSWORD,
            database: process.env.AUDIT_DB_NAME,
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,
            timezone: 'Z'
        });
    } else {
        // Reutiliza la base principal (requiere que audit_log exista ahi).
        pool = require('./db');
    }
    return pool;
}

module.exports = { getAuditPool, hasSeparateAuditDb, closeAuditPool };

// Cierra el pool de auditoria si es propio (los scripts CLI lo usan para terminar).
async function closeAuditPool() {
    if (pool && hasSeparateAuditDb()) {
        await pool.end();
        pool = null;
    }
}
