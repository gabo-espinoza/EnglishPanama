const test = require('node:test');
const assert = require('node:assert/strict');
const reports = require('../src/services/reports.service');
const game = require('../src/services/game.service');
const xp = require('../src/services/xp.service');
const { buildRanking } = require('../src/services/ranking.service');

// Fase C (modulos 7, 8 y 9) y reglas de XP configurables. pruebas puras.

test('reportes: cada rol ve solo su bandeja', () => {
    assert.deepEqual(reports.scopeForRole('support'), { kind: 'error' });
    assert.deepEqual(reports.scopeForRole('moderator'), { kind: 'inappropriate' });
    assert.deepEqual(reports.scopeForRole('content_manager'), { status: 'escalated' });
    assert.equal(reports.scopeForRole('analyst'), null);
});

test('reportes: nota y ids se validan en el servidor', () => {
    assert.equal(reports.cleanNote('  pregunta mal redactada  '), 'pregunta mal redactada');
    assert.equal(reports.cleanNote(null), null);
    assert.throws(() => reports.cleanNote('x'.repeat(301)), /larga/);
    assert.throws(() => reports.cleanNote('<b>x</b>'), /no permitidos/);
    assert.equal(reports.positiveInt('7', 'x'), 7);
    assert.throws(() => reports.positiveInt('abc', 'x'), /no es valido/);
    assert.throws(() => reports.positiveInt(-1, 'x'), /no es valido/);
});

test('juego: reglas por defecto y limites', () => {
    assert.deepEqual(game.validateRules({}), { xpPerCorrect: 5, xpPerLevel: 100, dailyChallengeXp: 10 });
    assert.deepEqual(
        game.validateRules({ xpPerCorrect: 10, xpPerLevel: 200, dailyChallengeXp: 20 }),
        { xpPerCorrect: 10, xpPerLevel: 200, dailyChallengeXp: 20 }
    );
    assert.throws(() => game.validateRules({ xpPerCorrect: 0 }), /entre 1 y 50/);
    assert.throws(() => game.validateRules({ xpPerLevel: 5 }), /entre 10 y 1000/);
    assert.throws(() => game.validateRules({ dailyChallengeXp: 999 }), /entre 1 y 100/);
    assert.throws(() => game.validateRules({ xpPerCorrect: 2.5 }), /entre 1 y 50/);
});

test('XP: las reglas configurables cambian puntos y niveles', () => {
    assert.equal(xp.xpForScore(4), 20);              // por defecto 5
    assert.equal(xp.xpForScore(4, 10), 40);         // regla editada
    assert.equal(xp.levelForXp(200), 3);            // por defecto 100
    assert.equal(xp.levelForXp(200, 200), 2);      // regla editada
    assert.deepEqual(xp.progressForXp(250, 200), {
        level: 2, xpIntoLevel: 50, xpForNextLevel: 200
    });
});

test('ranking: un alias oculto conserva su posicion', () => {
    const rows = [
        { alias: 'ana', avatar: 'fox', xp: 50, aliasHidden: false },
        { alias: 'zoe', avatar: 'cat', xp: 40, aliasHidden: true }
    ];
    const r = buildRanking(rows);
    assert.deepEqual(r.map((x) => x.position), [1, 2]);
    assert.equal(r[0].alias, 'ana');
    assert.equal(r[1].alias, 'Jugador oculto');
    assert.equal(r[1].xp, 40);
});
