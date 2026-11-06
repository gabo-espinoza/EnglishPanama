const test = require('node:test');
const assert = require('node:assert/strict');
const { assertValidAnswers } = require('../src/services/activity.service');

// Validacion de entradas en el servidor (diseno §5.6). Prueba unitaria pura:
// la correccion de respuestas no debe recibir tipos ni tamanos raros.

test('respuestas validas se indexan por questionId', () => {
    const map = assertValidAnswers([
        { questionId: 1, answer: 'lima' },
        { questionId: '2', answer: 4 },
        { questionId: 3, answer: ['a', 'b'] }
    ]);
    assert.equal(map.get(1), 'lima');
    assert.equal(map.get(2), 4);
    assert.deepEqual(map.get(3), ['a', 'b']);
});

test('una respuesta ausente cuenta como incorrecta, no como error', () => {
    const map = assertValidAnswers([{ questionId: 7 }]);
    assert.equal(map.get(7), undefined);
});

test('rechaza cuerpo vacio y items sin questionId', () => {
    assert.throws(() => assertValidAnswers([]), /al menos una respuesta/);
    assert.throws(() => assertValidAnswers(null), /al menos una respuesta/);
    assert.throws(() => assertValidAnswers([{ answer: 'x' }]), /questionId/);
    assert.throws(() => assertValidAnswers(['texto']), /questionId/);
});

test('rechaza questionId no entero, negativo o fuera de rango', () => {
    for (const qid of ['abc', 1.5, -1, 0, '1e999']) {
        assert.throws(() => assertValidAnswers([{ questionId: qid, answer: 'x' }]), /questionId no es valido/);
    }
});

test('rechaza respuestas demasiado largas o con demasiados elementos', () => {
    assert.throws(
        () => assertValidAnswers([{ questionId: 1, answer: 'x'.repeat(201) }]),
        /demasiado larga/
    );
    assert.throws(
        () => assertValidAnswers([{ questionId: 1, answer: new Array(51).fill('x') }]),
        /demasiados elementos/
    );
});
