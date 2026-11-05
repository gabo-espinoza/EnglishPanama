const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAnswer } = require('../src/utils/answers');

// La correccion de respuestas se hace siempre en el servidor (diseno §3).
// normalizeAnswer es compartida por los intentos de actividad y el reto diario.

test('normaliza texto: trim y minusculas', () => {
    assert.equal(normalizeAnswer('  Lima  '), 'lima');
    assert.equal(normalizeAnswer('LIMA'), 'lima');
});

test('numeros y booleanos se comparan como texto', () => {
    assert.equal(normalizeAnswer(4), '4');
    assert.equal(normalizeAnswer(true), 'true');
    assert.equal(normalizeAnswer(4), normalizeAnswer('4'));
});

test('arreglos: orden importa, se comparan por elementos', () => {
    assert.equal(normalizeAnswer(['a', 'B']), 'a|b');
    assert.notEqual(normalizeAnswer(['a', 'b']), normalizeAnswer(['b', 'a']));
});

test('objetos: las claves se ordenan antes de comparar', () => {
    assert.equal(normalizeAnswer({ b: 2, a: 1 }), normalizeAnswer({ a: 1, b: 2 }));
});

test('valores vacios no revelan la respuesta correcta', () => {
    assert.equal(normalizeAnswer(null), '');
    assert.equal(normalizeAnswer(undefined), '');
    assert.notEqual(normalizeAnswer(null), normalizeAnswer('lima'));
});
