const mysql = require('mysql2/promise');

// Pool de conexiones: cada request pide una conexión prestada y la devuelve,
// en vez de abrir una conexión nueva por request.
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
