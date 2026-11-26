const mysql = require('mysql2/promise');
const { buildMainPoolConfig } = require('./poolConfig');

// Pool de conexiones: cada request pide una conexion prestada y la devuelve,
// en vez de abrir una conexion nueva por request. Las opciones (host, puerto, zona horaria)
// se arman en poolConfig.js.
const pool = mysql.createPool(buildMainPoolConfig());

module.exports = pool;
