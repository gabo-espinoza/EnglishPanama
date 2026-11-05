const test = require('node:test');
const assert = require('node:assert/strict');
const { matchCounter, generateToken, verifyToken, PERIOD } = require('../src/utils/totp');

// Anti-replay (diseno §5.2). Pruebas unitarias puras: el contador lo calcula
// totp.js; la persistencia del ultimo contador la hace la base de datos.
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // ejemplo del RFC 6238
const AT = Date.UTC(2026, 0, 1, 12, 0, 0);
const COUNTER = Math.floor(AT / (PERIOD * 1000));

test('matchCounter devuelve el contador del codigo actual', () => {
    const code = generateToken(SECRET, AT);
    assert.equal(matchCounter(SECRET, code, 1, AT), COUNTER);
});

test('matchCounter distingue la ventana anterior y la siguiente', () => {
    const previous = generateToken(SECRET, AT - 30000);
    const next = generateToken(SECRET, AT + 30000);
    assert.equal(matchCounter(SECRET, previous, 1, AT), COUNTER - 1);
    // La ventana +/-1 existe para tolerar desfase de reloj: el codigo del paso
    // siguiente tambien se acepta, pero con SU contador (no el del actual).
    assert.equal(matchCounter(SECRET, next, 1, AT), COUNTER + 1);

    const tooFar = generateToken(SECRET, AT + 120000);
    assert.equal(matchCounter(SECRET, tooFar, 1, AT), null);
});

test('matchCounter devuelve null con formatos invalidos', () => {
    for (const bad of ['12345', 'abcdef', '', null, undefined, {}, 1234567]) {
        assert.equal(matchCounter(SECRET, bad, 1, AT), null);
    }
});

test('verifyToken sigue siendo compatible con matchCounter', () => {
    const code = generateToken(SECRET, AT);
    assert.equal(verifyToken(SECRET, code, 1, AT), true);
    assert.equal(verifyToken(SECRET, '000000', 1, AT), false);
});

test('anti-replay: el mismo contador solo se acepta una vez', () => {
    // Simula la condicion atomica del UPDATE usada en auth.service.js:
    //   (mfa_last_counter IS NULL OR mfa_last_counter < ?)
    const code = generateToken(SECRET, AT);
    const counter = matchCounter(SECRET, code, 1, AT);
    let last = null;
    const accepts = (c) => last === null || last < c;

    assert.equal(accepts(counter), true); // primer uso
    last = counter;
    assert.equal(accepts(counter), false); // reuso del mismo codigo
    assert.equal(accepts(counter - 1), false); // codigo de una ventana anterior
    assert.equal(accepts(counter + 1), true); // codigo nuevo si avanza el reloj
});
