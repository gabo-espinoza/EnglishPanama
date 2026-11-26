// Opciones de los pools de MySQL (src/config/poolConfig.js). Pruebas puras: no abren conexiones.
const test = require('node:test');
const assert = require('node:assert');
const { buildMainPoolConfig, buildAuditPoolConfig } = require('../src/config/poolConfig');

const AUDIT_BASE = { AUDIT_DB_HOST: 'audit.local', AUDIT_DB_USER: 'audit_writer', AUDIT_DB_NAME: 'englishpanama_audit' };

test('la base principal usa DB_PORT y, si falta o no es valido, 3306', () => {
    assert.strictEqual(buildMainPoolConfig({ DB_PORT: '3307' }).port, 3307);
    assert.strictEqual(buildMainPoolConfig({}).port, 3306);
    assert.strictEqual(buildMainPoolConfig({ DB_PORT: 'abc' }).port, 3306);
    const cfg = buildMainPoolConfig({ DB_HOST: 'h', DB_USER: 'u', DB_NAME: 'n' });
    assert.strictEqual(cfg.host, 'h');
    assert.strictEqual(cfg.user, 'u');
    assert.strictEqual(cfg.database, 'n');
    assert.strictEqual(cfg.timezone, 'Z');
    assert.strictEqual(cfg.connectionLimit, 10);
});

test('la auditoria usa AUDIT_DB_PORT aunque DB_PORT sea otro', () => {
    assert.strictEqual(buildAuditPoolConfig({ ...AUDIT_BASE, DB_PORT: '3306', AUDIT_DB_PORT: '3310' }).port, 3310);
    assert.strictEqual(buildAuditPoolConfig({ ...AUDIT_BASE, AUDIT_DB_PORT: '3311' }).port, 3311);
});

test('sin AUDIT_DB_PORT la auditoria cae en DB_PORT y luego en 3306', () => {
    assert.strictEqual(buildAuditPoolConfig({ ...AUDIT_BASE, DB_PORT: '3308' }).port, 3308);
    assert.strictEqual(buildAuditPoolConfig({ ...AUDIT_BASE, AUDIT_DB_PORT: '', DB_PORT: '3308' }).port, 3308);
    assert.strictEqual(buildAuditPoolConfig({ ...AUDIT_BASE }).port, 3306);
    assert.strictEqual(buildAuditPoolConfig({ ...AUDIT_BASE, AUDIT_DB_PORT: 'x' }).port, 3306);
});

test('la auditoria toma sus propias credenciales y cae en las DB_* solo si faltan', () => {
    const own = buildAuditPoolConfig({ ...AUDIT_BASE, DB_HOST: 'main', DB_USER: 'app_user' });
    assert.strictEqual(own.host, 'audit.local');
    assert.strictEqual(own.user, 'audit_writer');
    assert.strictEqual(own.database, 'englishpanama_audit');
    assert.strictEqual(own.connectionLimit, 5);
    const fallback = buildAuditPoolConfig({ AUDIT_DB_NAME: 'a', DB_HOST: 'main', DB_USER: 'app_user' });
    assert.strictEqual(fallback.host, 'main');
    assert.strictEqual(fallback.user, 'app_user');
});
