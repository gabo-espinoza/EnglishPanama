// Comprobaciones de los secretos de autenticacion al arrancar (solo en produccion).
//
// Si faltara un secreto, cada endpoint de autenticacion responderia 500. Fallar al arrancar es
// mas claro y evita un bucle de reinicios silencioso (docs/migraciones-produccion.md).
//
// Ademas:
// - JWT_SECRET y STAFF_JWT_SECRET deben ser distintos: si fueran iguales, un token de la
//   plataforma tendria una firma valida para el area de gestion (y al reves), y se pierde la
//   separacion de las dos superficies de sesion.
// - Ambos deben tener al menos 32 caracteres: un secreto corto se puede adivinar por fuerza
//   bruta a partir de un token firmado.

const MIN_JWT_SECRET_LENGTH = 32;

function assertAuthConfig(env = process.env) {
    if (env.NODE_ENV !== 'production') return;
    const required = ['JWT_SECRET', 'STAFF_JWT_SECRET', 'STAFF_MFA_KEY'];
    const missing = required.filter((key) => !env[key]);
    if (missing.length > 0) {
        throw new Error('Faltan secretos en produccion: ' + missing.join(', '));
    }
    const short = ['JWT_SECRET', 'STAFF_JWT_SECRET'].filter((key) => env[key].length < MIN_JWT_SECRET_LENGTH);
    if (short.length > 0) {
        throw new Error(`Secretos demasiado cortos en produccion (minimo ${MIN_JWT_SECRET_LENGTH} caracteres): ` + short.join(', '));
    }
    if (env.JWT_SECRET === env.STAFF_JWT_SECRET) {
        throw new Error('STAFF_JWT_SECRET debe ser distinto de JWT_SECRET.');
    }
    if (Buffer.from(env.STAFF_MFA_KEY, 'base64').length !== 32) {
        throw new Error('STAFF_MFA_KEY debe tener 32 bytes codificados en base64.');
    }
}

module.exports = { assertAuthConfig, MIN_JWT_SECRET_LENGTH };
