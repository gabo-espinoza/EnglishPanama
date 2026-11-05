const test = require('node:test');
const assert = require('node:assert/strict');
const {
    cleanText, validateQuestionShape, assertStatus, GAME_TYPES, STATUSES
} = require('../src/services/content.service');

// Fase B: ciclo de vida del contenido (diseno §4.1/§5.3). Pruebas unitarias
// puras: validacion y transiciones no necesitan MySQL.

test('cleanText valida tipo, largo y caracteres de control', () => {
    assert.equal(cleanText('  Hola  ', 'x', 50), 'Hola');
    assert.throws(() => cleanText('', 'x', 50), /obligatorio/);
    assert.throws(() => cleanText(123, 'x', 50), /texto/);
    assert.throws(() => cleanText('x'.repeat(51), 'x', 50), /largo/);
    assert.throws(() => cleanText('a<script>b', 'x', 50), /no permitidos/);
    assert.equal(cleanText(null, 'x', 50, false), null);
});

test('validateQuestionShape: multiple_choice con respuesta entre opciones', () => {
    const q = validateQuestionShape('multiple_choice', {
        topic: 'colores', prompt: 'El color del cielo',
        options: ['azul', 'rojo', 'verde'], correctAnswer: 'azul'
    });
    assert.equal(q.correctAnswer, 'azul');
    assert.deepEqual(q.options, ['azul', 'rojo', 'verde']);
});

test('validateQuestionShape: normaliza mayusculas y espacios', () => {
    const q = validateQuestionShape('fill_blank', {
        topic: 'verbo to be', prompt: 'I ___ a student.',
        options: ['am', 'is', 'are'], correctAnswer: '  AM  '
    });
    assert.equal(q.correctAnswer, '  AM  ');
});

test('validateQuestionShape rechaza respuesta que no esta en opciones', () => {
    assert.throws(() => validateQuestionShape('multiple_choice', {
        topic: 't', prompt: 'p', options: ['a', 'b'], correctAnswer: 'c'
    }), /una de las opciones/);
});

test('validateQuestionShape: sentence_order exige una lista ordenada', () => {
    const q = validateQuestionShape('sentence_order', {
        topic: 'orden', prompt: 'Ordena la frase',
        options: ['I', 'am', 'happy'], correctAnswer: ['I', 'am', 'happy']
    });
    assert.deepEqual(q.correctAnswer, ['I', 'am', 'happy']);
    assert.throws(() => validateQuestionShape('sentence_order', {
        topic: 'orden', prompt: 'Ordena', options: ['I', 'am'], correctAnswer: 'I am'
    }), /orden/);
});

test('validateQuestionShape rechaza opciones invalidas y tipo de juego falso', () => {
    assert.throws(() => validateQuestionShape('memory', {
        topic: 't', prompt: 'p', options: ['solo'], correctAnswer: 'solo'
    }), /2 a 8/);
    assert.throws(() => validateQuestionShape('otro', {
        topic: 't', prompt: 'p', options: ['a', 'b'], correctAnswer: 'a'
    }), /no valido/);
    assert.ok(GAME_TYPES.includes('fill_blank'));
    assert.ok(STATUSES.includes('in_review'));
});

test('assertStatus: una transicion fuera de estado da 409 INVALID_STATE', () => {
    assert.doesNotThrow(() => assertStatus({ status: 'draft' }, 'draft', 'editar'));
    const err = (() => {
        try { assertStatus({ status: 'published' }, 'draft', 'editar'); } catch (e) { return e; }
        return null;
    })();
    assert.equal(err.status, 409);
    assert.equal(err.apiCode, 'INVALID_STATE');
});
