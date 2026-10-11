const { rateLimit } = require('express-rate-limit');

// Límite general de la API: frena ráfagas y scraping sin molestar el uso normal.
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas peticiones. Intenta de nuevo en un momento.' }
});

// Límite estricto para login y registro: frena la fuerza bruta sobre contraseñas.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de autenticación. Espera unos minutos.' }
});

module.exports = { apiLimiter, authLimiter };
