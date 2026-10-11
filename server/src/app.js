const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const app = express();

// Detrás de un proxy (Nginx en producción) el rate limit necesita la IP real.
// Se activa solo con TRUST_PROXY=true para no confiar en cabeceras falsificadas en local.
if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}

// Cabeceras de seguridad (helmet). Se permite compartir recursos entre orígenes
// porque el frontend vive en otro dominio.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS: si se define CORS_ORIGIN (lista separada por comas) solo se aceptan esos
// orígenes; si no, se permite cualquiera (útil en desarrollo).
const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
app.use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Límite de tamaño del body: las respuestas de un intento son pequeñas.
app.use(express.json({ limit: '100kb' }));

// Límite general de peticiones para toda la API.
app.use('/api', apiLimiter, routes);

app.use(errorHandler);

module.exports = app;
