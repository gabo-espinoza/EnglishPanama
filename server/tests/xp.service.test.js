const test = require('node:test');
const assert = require('node:assert/strict');
const {
    XP_PER_CORRECT, XP_PER_LEVEL, xpForScore, levelForXp, progressForXp
} = require('../src/services/xp.service');

// Reglas de XP y niveles (diseno §1 / §3). Pruebas unitarias sin base de datos:
// antes no habia ninguna prueba de los limites 0/99/100/101.

test('constantes del diseno', () => {
    assert.equal(XP_PER_CORRECT, 5);
    assert.equal(XP_PER_LEVEL, 100);
});

test('xpForScore: 5 puntos por respuesta correcta', () => {
    assert.equal(xpForScore(0), 0);
    assert.equal(xpForScore(1), 5);
    assert.equal(xpForScore(8), 40);
});

test('levelForXp: el cambio de nivel ocurre exactamente en 100', () => {
    assert.equal(levelForXp(0), 1);
    assert.equal(levelForXp(99), 1);
    assert.equal(levelForXp(100), 2);
    assert.equal(levelForXp(101), 2);
    assert.equal(levelForXp(195), 2);
    assert.equal(levelForXp(200), 3);
});

test('progressForXp: progreso dentro del nivel y umbral', () => {
    assert.deepEqual(progressForXp(0), { level: 1, xpIntoLevel: 0, xpForNextLevel: 100 });
    assert.deepEqual(progressForXp(99), { level: 1, xpIntoLevel: 99, xpForNextLevel: 100 });
    assert.deepEqual(progressForXp(100), { level: 2, xpIntoLevel: 0, xpForNextLevel: 100 });
    assert.deepEqual(progressForXp(140), { level: 2, xpIntoLevel: 40, xpForNextLevel: 100 });
});
