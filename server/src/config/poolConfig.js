// Opciones de los pools de MySQL (base principal y base de auditoria), armadas a partir del
// entorno. Son funciones puras: reciben el entorno y devuelven el objeto que se pasa a
// mysql.createPool, para poder probarlas sin abrir conexiones (tests/pool-config.test.js).
//
// timezone 'Z' hace que mysql2 trate los DATETIME como UTC, que es la zona en la que escribe
// el servidor MySQL (NOW() y DATE_ADD(NOW(), ...)). Sin esto, las fechas se reinterpretan como
// hora local al leerlas y cualquier comparacion en JavaScript queda desplazada.

const fs = require('fs');

const DEFAULT_MYSQL_PORT = 3306;

// TLS opcional hacia MySQL. Con la ruta de un certificado de CA (PEM) la conexion va cifrada y
// se verifica el certificado del servidor contra esa CA (rejectUnauthorized: true). Sin ruta no se
// agrega la opcion ssl y la conexion queda como siempre. Si la ruta no se puede leer, falla al
// crear el pool (al arrancar): mejor que conectarse sin cifrar en silencio.
function buildSsl(caPath, variable, readFile) {
    if (!caPath) return undefined;
    let ca;
    try {
        ca = readFile(caPath);
    } catch (err) {
        throw new Error(`No se pudo leer el certificado de ${variable} (${caPath}): ${err.code || err.message}`);
    }
    return { ca, rejectUnauthorized: true };
}

function withSsl(config, ssl) {
    return ssl ? { ...config, ssl } : config;
}

// Primer valor que sea un puerto valido (entero de 1 a 65535); si ninguno lo es, 3306.
function pickPort(...values) {
    for (const value of values) {
        if (value === undefined || value === null || value === '') continue;
        const port = Number(value);
        if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
    }
    return DEFAULT_MYSQL_PORT;
}

// `readFile` se inyecta en las pruebas; por defecto lee el archivo del disco.
function buildMainPoolConfig(env = process.env, { readFile = fs.readFileSync } = {}) {
    return withSsl({
        host: env.DB_HOST,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
        port: pickPort(env.DB_PORT),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        timezone: 'Z'
    }, buildSsl(env.DB_SSL_CA, 'DB_SSL_CA', readFile));
}

// Base de auditoria separada. Cada AUDIT_DB_* cae en su DB_* si falta (solo tiene sentido fuera
// de produccion: alli assertAuditConfig exige las cuatro). El puerto es AUDIT_DB_PORT, luego
// DB_PORT y por ultimo 3306: la base de auditoria puede vivir en otra instancia de MySQL.
// TLS: AUDIT_DB_SSL_CA y, si falta, DB_SSL_CA.
function buildAuditPoolConfig(env = process.env, { readFile = fs.readFileSync } = {}) {
    const caVariable = env.AUDIT_DB_SSL_CA ? 'AUDIT_DB_SSL_CA' : 'DB_SSL_CA';
    return withSsl({
        host: env.AUDIT_DB_HOST || env.DB_HOST,
        user: env.AUDIT_DB_USER || env.DB_USER,
        password: env.AUDIT_DB_PASSWORD || env.DB_PASSWORD,
        database: env.AUDIT_DB_NAME,
        port: pickPort(env.AUDIT_DB_PORT, env.DB_PORT),
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        timezone: 'Z'
    }, buildSsl(env.AUDIT_DB_SSL_CA || env.DB_SSL_CA, caVariable, readFile));
}

module.exports = { buildMainPoolConfig, buildAuditPoolConfig, DEFAULT_MYSQL_PORT };
