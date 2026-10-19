const { rateLimit } = require('express-rate-limit');

// Limite general de la API: frena rafagas y scraping sin molestar el uso normal.
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas peticiones. Intenta de nuevo en un momento.' }
});

// Intentos de autenticacion con error que admite cada IP en 15 minutos. Detras de un colegio
// todo el salon comparte una IP publica: para una clase o la demostracion se puede subir con
// AUTH_RATE_LIMIT_MAX en el .env (por ejemplo, 200). Un valor ausente o invalido deja 20.
const DEFAULT_AUTH_RATE_LIMIT_MAX = 20;
const parsedMax = Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10);
const AUTH_RATE_LIMIT_MAX = Number.isInteger(parsedMax) && parsedMax > 0 ? parsedMax : DEFAULT_AUTH_RATE_LIMIT_MAX;

// Limite estricto para login y registro: frena la fuerza bruta sobre contrasenas.
// Solo cuentan las respuestas con error (>= 400): entrar bien no gasta el cupo, asi un salon
// completo puede iniciar sesion y vincular su MFA a la vez. La fuerza bruta sigue acotada,
// porque cada intento fallido cuenta y, ademas, cada cuenta se bloquea tras 3 fallos (10 s).
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: AUTH_RATE_LIMIT_MAX,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de autenticacion. Espera unos minutos.' }
});

module.exports = { apiLimiter, authLimiter, AUTH_RATE_LIMIT_MAX };
