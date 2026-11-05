const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRanking } = require('../src/services/ranking.service');

// El SQL ordena por xp DESC, username ASC; buildRanking solo asigna posiciones.
// Antes no habia ninguna prueba del ranking mas alla de los 401/403.

test('asigna posiciones secuenciales en el orden recibido', () => {
    const rows = [
        { alias: 'ana', avatar: 'fox', xp: 0 },
        { alias: 'ben', avatar: 'cat', xp: 0 },
        { alias: 'cielo', avatar: 'owl', xp: 100 }
    ];
    const result = buildRanking(rows);
    assert.deepEqual(result.map((r) => r.position), [1, 2, 3]);
    assert.deepEqual(result.map((r) => r.alias), ['ana', 'ben', 'cielo']);
});

test('empates conservan el orden por alias y posiciones distintas', () => {
    const result = buildRanking([
        { alias: 'ana', avatar: 'fox', xp: 50 },
        { alias: 'zoe', avatar: 'cat', xp: 50 }
    ]);
    assert.deepEqual(result.map((r) => r.position), [1, 2]);
    assert.equal(result[0].alias, 'ana');
    assert.equal(result[0].level, 1);
    assert.equal(result[0].xpIntoLevel, 50);
});

test('el nivel se calcula con las reglas de XP (100 XP = nivel 2)', () => {
    const [r] = buildRanking([{ alias: 'cielo', avatar: 'owl', xp: 100 }]);
    assert.equal(r.level, 2);
    assert.equal(r.xpIntoLevel, 0);
    assert.equal(r.xpForNextLevel, 100);
});

test('solo expone alias, avatar, XP y progreso: nunca datos personales', () => {
    const [r] = buildRanking([
        { alias: 'ana', avatar: 'fox', xp: 10, teacher_id: 7, password_hash: 'x', correct_answer: 'lima' }
    ]);
    assert.deepEqual(Object.keys(r).sort(), ['alias', 'avatar', 'level', 'position', 'xp', 'xpForNextLevel', 'xpIntoLevel']);
    assert.ok(!('teacher_id' in r) && !('password_hash' in r) && !('correct_answer' in r));
});
