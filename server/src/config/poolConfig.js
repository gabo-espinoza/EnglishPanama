// Opciones de los pools de MySQL (base principal y base de auditoria), armadas a partir del
// entorno. Son funciones puras: reciben el entorno y devuelven el objeto que se pasa a
// mysql.createPool, para poder probarlas sin abrir conexiones (tests/pool-config.test.js).
//
// timezone 'Z' hace que mysql2 trate los DATETIME como UTC, que es la zona en la que escribe
// el servidor MySQL (NOW() y DATE_ADD(NOW(), ...)). Sin esto, las fechas se reinterpretan como
// hora local al leerlas y cualquier comparacion en JavaScript queda desplazada.

const DEFAULT_MYSQL_PORT = 3306;

// Primer valor que sea un puerto valido (entero de 1 a 65535); si ninguno lo es, 3306.
function pickPort(...values) {
    for (const value of values) {
        if (value === undefined || value === null || value === '') continue;
        const port = Number(value);
        if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
    }
    return DEFAULT_MYSQL_PORT;
}

function buildMainPoolConfig(env = process.env) {
    return {
        host: env.DB_HOST,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
        port: pickPort(env.DB_PORT),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        timezone: 'Z'
    };
}

// Base de auditoria separada. Cada AUDIT_DB_* cae en su DB_* si falta (solo tiene sentido fuera
// de produccion: alli assertAuditConfig exige las cuatro). El puerto es AUDIT_DB_PORT, luego
// DB_PORT y por ultimo 3306: la base de auditoria puede vivir en otra instancia de MySQL.
function buildAuditPoolConfig(env = process.env) {
    return {
        host: env.AUDIT_DB_HOST || env.DB_HOST,
        user: env.AUDIT_DB_USER || env.DB_USER,
        password: env.AUDIT_DB_PASSWORD || env.DB_PASSWORD,
        database: env.AUDIT_DB_NAME,
        port: pickPort(env.AUDIT_DB_PORT, env.DB_PORT),
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        timezone: 'Z'
    };
}

module.exports = { buildMainPoolConfig, buildAuditPoolConfig, DEFAULT_MYSQL_PORT };
