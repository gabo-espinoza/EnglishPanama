const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { assertAuthConfig } = require('../src/config/authConfig');

// Valores sinteticos generados en la prueba (nunca secretos reales).
function prodEnv(overrides = {}) {
    return {
        NODE_ENV: 'production',
        JWT_SECRET: crypto.randomBytes(32).toString('hex'),
        STAFF_JWT_SECRET: crypto.randomBytes(32).toString('hex'),
        STAFF_MFA_KEY: crypto.randomBytes(32).toString('base64'),
        ...overrides
    };
}

test('en produccion acepta secretos distintos, largos y una clave MFA de 32 bytes', () => {
    assert.doesNotThrow(() => assertAuthConfig(prodEnv()));
});

test('fuera de produccion no exige nada', () => {
    assert.doesNotThrow(() => assertAuthConfig({ NODE_ENV: 'test' }));
    assert.doesNotThrow(() => assertAuthConfig({}));
});

test('en produccion rechaza STAFF_JWT_SECRET igual a JWT_SECRET', () => {
    const secret = crypto.randomBytes(32).toString('hex');
    assert.throws(
        () => assertAuthConfig(prodEnv({ JWT_SECRET: secret, STAFF_JWT_SECRET: secret })),
        /STAFF_JWT_SECRET debe ser distinto de JWT_SECRET/
    );
});

test('en produccion rechaza secretos JWT de menos de 32 caracteres', () => {
    assert.throws(() => assertAuthConfig(prodEnv({ JWT_SECRET: 'a'.repeat(31) })), /demasiado cortos.*JWT_SECRET/);
    assert.throws(() => assertAuthConfig(prodEnv({ STAFF_JWT_SECRET: 'b'.repeat(31) })), /demasiado cortos.*STAFF_JWT_SECRET/);
    assert.doesNotThrow(() => assertAuthConfig(prodEnv({ JWT_SECRET: 'a'.repeat(32), STAFF_JWT_SECRET: 'b'.repeat(32) })));
});

test('en produccion sigue exigiendo los tres secretos y la clave MFA de 32 bytes', () => {
    assert.throws(() => assertAuthConfig(prodEnv({ STAFF_JWT_SECRET: '' })), /Faltan secretos en produccion: STAFF_JWT_SECRET/);
    assert.throws(() => assertAuthConfig(prodEnv({ STAFF_MFA_KEY: crypto.randomBytes(16).toString('base64') })), /32 bytes/);
});
