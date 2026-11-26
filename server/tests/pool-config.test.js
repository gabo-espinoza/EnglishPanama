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

// ------------------------------------------------------------------ TLS opcional hacia MySQL

// Lector falso: devuelve un PEM ficticio por ruta y registra que rutas se leyeron.
function fakeReader(files) {
    const read = [];
    const readFile = (p) => {
        read.push(p);
        if (!(p in files)) {
            const err = new Error('no existe');
            err.code = 'ENOENT';
            throw err;
        }
        return Buffer.from(files[p]);
    };
    return { readFile, read };
}

test('sin DB_SSL_CA ni AUDIT_DB_SSL_CA no se agrega ssl (comportamiento de siempre)', () => {
    const { readFile, read } = fakeReader({});
    assert.strictEqual('ssl' in buildMainPoolConfig({ DB_HOST: 'h' }, { readFile }), false);
    assert.strictEqual('ssl' in buildAuditPoolConfig({ ...AUDIT_BASE }, { readFile }), false);
    assert.deepStrictEqual(read, [], 'sin variables no se lee ningun archivo');
});

test('DB_SSL_CA activa TLS verificado en la base principal y, por defecto, en la de auditoria', () => {
    const { readFile } = fakeReader({ '/etc/ep/ca.pem': 'CA-PRINCIPAL' });
    const main = buildMainPoolConfig({ DB_SSL_CA: '/etc/ep/ca.pem' }, { readFile });
    assert.strictEqual(main.ssl.ca.toString(), 'CA-PRINCIPAL');
    assert.strictEqual(main.ssl.rejectUnauthorized, true);
    const audit = buildAuditPoolConfig({ ...AUDIT_BASE, DB_SSL_CA: '/etc/ep/ca.pem' }, { readFile });
    assert.strictEqual(audit.ssl.ca.toString(), 'CA-PRINCIPAL');
    assert.strictEqual(audit.ssl.rejectUnauthorized, true);
});

test('AUDIT_DB_SSL_CA tiene prioridad sobre DB_SSL_CA en la base de auditoria', () => {
    const { readFile } = fakeReader({ '/a/ca.pem': 'CA-PRINCIPAL', '/b/ca.pem': 'CA-AUDITORIA' });
    const env = { ...AUDIT_BASE, DB_SSL_CA: '/a/ca.pem', AUDIT_DB_SSL_CA: '/b/ca.pem' };
    assert.strictEqual(buildAuditPoolConfig(env, { readFile }).ssl.ca.toString(), 'CA-AUDITORIA');
    assert.strictEqual(buildMainPoolConfig(env, { readFile }).ssl.ca.toString(), 'CA-PRINCIPAL');
    // Solo AUDIT_DB_SSL_CA: la base principal sigue sin TLS.
    const onlyAudit = { ...AUDIT_BASE, AUDIT_DB_SSL_CA: '/b/ca.pem' };
    assert.strictEqual('ssl' in buildMainPoolConfig(onlyAudit, { readFile }), false);
    assert.strictEqual(buildAuditPoolConfig(onlyAudit, { readFile }).ssl.ca.toString(), 'CA-AUDITORIA');
});

test('un certificado que no se puede leer falla al armar el pool (no conecta sin cifrar)', () => {
    const { readFile } = fakeReader({});
    assert.throws(() => buildMainPoolConfig({ DB_SSL_CA: '/no/existe.pem' }, { readFile }), /DB_SSL_CA.*ENOENT/);
    assert.throws(() => buildAuditPoolConfig({ ...AUDIT_BASE, AUDIT_DB_SSL_CA: '/no/existe.pem' }, { readFile }), /AUDIT_DB_SSL_CA.*ENOENT/);
});
