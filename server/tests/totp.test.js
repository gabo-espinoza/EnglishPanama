const test = require('node:test');
const assert = require('node:assert/strict');
const totp = require('../src/utils/totp');

// TOTP del servidor: SHA-1, 6 digitos, 30 s, ventana +/-1 por desfase de reloj
// (diseno §5.2). Pruebas unitarias sin base de datos ni secreto real.
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // ejemplo del RFC 6238
const AT = Date.UTC(2026, 0, 1, 12, 0, 0);

test('generateToken devuelve 6 digitos', () => {
    assert.match(totp.generateToken(SECRET, AT), /^\d{6}$/);
});

test('verifyToken acepta el codigo del instante actual', () => {
    const code = totp.generateToken(SECRET, AT);
    assert.equal(totp.verifyToken(SECRET, code, 1, AT), true);
});

test('tolerancia de reloj: acepta la ventana anterior y la siguiente', () => {
    const code = totp.generateToken(SECRET, AT);
    assert.equal(totp.verifyToken(SECRET, code, 1, AT + 30000), true);
    assert.equal(totp.verifyToken(SECRET, code, 1, AT - 30000), true);
});

test('rechaza un codigo fuera de la ventana y formatos invalidos', () => {
    const code = totp.generateToken(SECRET, AT);
    assert.equal(totp.verifyToken(SECRET, code, 1, AT + 120000), false);
    for (const bad of ['12345', 'abcdef', '', null, undefined, {}, 1234567]) {
        assert.equal(totp.verifyToken(SECRET, bad, 1, AT), false);
    }
});

test('clave URI otpauth con los parametros del servidor', () => {
    const uri = totp.keyUri({ secret: SECRET, label: 'demo.docente' });
    assert.ok(uri.startsWith('otpauth://totp/'));
    assert.match(uri, /secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ/);
    assert.match(uri, /algorithm=SHA1/);
    assert.match(uri, /digits=6/);
    assert.match(uri, /period=30/);
});
