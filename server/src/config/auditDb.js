// Conexion a la base de auditoria.
//
// La auditoria va en una base aparte (`englishpanama_audit`) con un usuario propio
// (`audit_writer`) que solo puede INSERT y SELECT: nadie desde la app puede editar
// ni borrar el registro. Si no hay variables AUDIT_DB_* configuradas se reutiliza la
// base principal (solo para desarrollo local). En produccion (NODE_ENV=production)
// las cuatro variables son obligatorias: sin ellas el registro no seria inmutable.
const mysql = require('mysql2/promise');

let pool = null;

function hasSeparateAuditDb() {
    return Boolean(process.env.AUDIT_DB_NAME);
}

const REQUIRED_IN_PRODUCTION = ['AUDIT_DB_HOST', 'AUDIT_DB_USER', 'AUDIT_DB_PASSWORD', 'AUDIT_DB_NAME'];

// Falla si en produccion falta alguna variable de la base de auditoria. Se llama al
// arrancar el servidor, para no descubrir en silencio que se audita con la base principal.
function assertAuditConfig() {
    if (process.env.NODE_ENV !== 'production') return;
    const missing = REQUIRED_IN_PRODUCTION.filter((name) => !process.env[name]);
    if (missing.length > 0) {
        throw new Error('Auditoria mal configurada para produccion. Falta: ' + missing.join(', '));
    }
}

function getAuditPool() {
    if (pool) return pool;
    assertAuditConfig();

    if (hasSeparateAuditDb()) {
        pool = mysql.createPool({
            host: process.env.AUDIT_DB_HOST || process.env.DB_HOST,
            user: process.env.AUDIT_DB_USER || process.env.DB_USER,
            password: process.env.AUDIT_DB_PASSWORD || process.env.DB_PASSWORD, // fallback solo fuera de produccion
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

module.exports = { getAuditPool, hasSeparateAuditDb, closeAuditPool, assertAuditConfig };

// Cierra el pool de auditoria si es propio (los scripts CLI lo usan para terminar).
async function closeAuditPool() {
    if (pool && hasSeparateAuditDb()) {
        await pool.end();
        pool = null;
    }
}
