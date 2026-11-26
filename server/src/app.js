const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const app = express();

// Detras de un proxy (Nginx en produccion) el rate limit necesita la IP real.
// Se activa solo con TRUST_PROXY=true para no confiar en cabeceras falsificadas en local.
if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}

// Cabeceras de seguridad (helmet). Se permite compartir recursos entre origenes
// porque el frontend vive en otro dominio.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS: si se define CORS_ORIGIN (lista separada por comas) solo se aceptan esos
// origenes; si no, se permite cualquiera (util en desarrollo).
const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
app.use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    // PUT se usa en PUT /api/teacher/class/grade; sin el metodo, el preflight de un
    // frontend en otro origen seria rechazado.
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Ninguna respuesta de la API se guarda en cache (ni en el navegador ni en un proxy
// compartido): llevan datos de perfil, ranking y tokens. Va antes del limitador y del
// parser para que tambien lo reciban los 429, 400 y 413.
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

// Limite de tamano del body: las respuestas de un intento son pequenas.
app.use(express.json({ limit: '100kb' }));

// Limite general de peticiones para toda la API.
app.use('/api', apiLimiter, routes);

// Ruta de la API que no existe: JSON, igual que el resto de las respuestas (el cliente
// estatico lo sirve nginx, no esta app).
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada.' });
});

app.use(errorHandler);

module.exports = app;
