const mysql = require('mysql2/promise');

// Pool de conexiones: cada request pide una conexion prestada y la devuelve,
// en vez de abrir una conexion nueva por request.
//
// timezone 'Z' hace que mysql2 trate los DATETIME como UTC, que es la zona en la
// que escribe el servidor MySQL (NOW() y DATE_ADD(NOW(), ...)). Sin esto, las
// fechas se reinterpretan como hora local al leerlas y cualquier comparacion en
// JavaScript queda desplazada por la diferencia con UTC.
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: 'Z'
});

module.exports = pool;
