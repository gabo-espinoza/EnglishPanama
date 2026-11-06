const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRanking } = require('../src/services/ranking.service');
const { buildStudentProfile } = require('../src/services/user.service');
const { buildStudentRow } = require('../src/services/teacher.service');

// Los caminos de lectura (ranking, /users/me, lista del docente) deben usar la regla
// xpPerLevel vigente. Pruebas puras: la regla se inyecta, sin tocar las reglas globales.

const rules150 = { xpPerLevel: 150 };

test('ranking: con xpPerLevel=150 el nivel cambia en 150', () => {
    const rows = [
        { studentId: 1, alias: 'a', avatar: 'default', xp: 150, aliasHidden: 0 },
        { studentId: 2, alias: 'b', avatar: 'default', xp: 149, aliasHidden: 0 }
    ];
    const [r1, r2] = buildRanking(rows, 1, rules150);
    assert.equal(r1.level, 2);
    assert.equal(r1.xpIntoLevel, 0);
    assert.equal(r1.xpForNextLevel, 150);
    assert.equal(r2.level, 1);
    assert.equal(r2.xpIntoLevel, 149);
    assert.equal(r2.xpForNextLevel, 150);
});

test('ranking: sin reglas o con el valor por defecto se comporta como antes (100)', () => {
    const rows = [{ studentId: 1, alias: 'a', avatar: 'default', xp: 140, aliasHidden: 0 }];
    const esperado = { level: 2, xpIntoLevel: 40, xpForNextLevel: 100 };
    for (const resultado of [buildRanking(rows, 1), buildRanking(rows, 1, { xpPerLevel: 100 })]) {
        assert.equal(resultado[0].level, esperado.level);
        assert.equal(resultado[0].xpIntoLevel, esperado.xpIntoLevel);
        assert.equal(resultado[0].xpForNextLevel, esperado.xpForNextLevel);
    }
});

const base = { alias: 'ana', avatar: 'default', teacherId: 9, classCode: 'ABC', classGrade: null };

test('users/me: con xpPerLevel=150 el nivel cambia en 150', () => {
    const p149 = buildStudentProfile(5, { ...base, xp: 149 }, rules150);
    assert.equal(p149.level, 1);
    assert.equal(p149.xpIntoLevel, 149);
    assert.equal(p149.xpForNextLevel, 150);
    const p150 = buildStudentProfile(5, { ...base, xp: 150 }, rules150);
    assert.equal(p150.level, 2);
    assert.equal(p150.xpIntoLevel, 0);
    assert.equal(p150.xpForNextLevel, 150);
});

test('users/me: con el valor por defecto coincide con el calculo anterior', () => {
    for (const rules of [undefined, { xpPerLevel: 100 }]) {
        const p = buildStudentProfile(5, { ...base, xp: 140 }, rules);
        assert.equal(p.level, 2);
        assert.equal(p.xpIntoLevel, 40);
        assert.equal(p.xpForNextLevel, 100);
        assert.equal(p.id, 5);
        assert.equal(p.role, 'student');
    }
});

test('lista del docente: con xpPerLevel=150 el nivel cambia en 150', () => {
    const s = { userId: 3, alias: 'x', avatar: 'default' };
    assert.equal(buildStudentRow({ ...s, xp: 149 }, rules150).level, 1);
    assert.equal(buildStudentRow({ ...s, xp: 150 }, rules150).level, 2);
    assert.equal(buildStudentRow({ ...s, xp: 100 }, rules150).level, 1);
});

test('lista del docente: con el valor por defecto coincide con antes', () => {
    const s = { userId: 3, alias: 'x', avatar: 'default' };
    for (const rules of [undefined, { xpPerLevel: 100 }]) {
        assert.equal(buildStudentRow({ ...s, xp: 99 }, rules).level, 1);
        assert.equal(buildStudentRow({ ...s, xp: 100 }, rules).level, 2);
    }
    assert.deepEqual(buildStudentRow({ ...s, xp: 0 }).averages, { vocabulary: null, grammar: null, reading: null });
});
