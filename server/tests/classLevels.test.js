const test = require('node:test');
const assert = require('node:assert');
const { GRADE_LEVELS, VALID_GRADES, LEVELS, isValidGrade, levelForGrade } = require('../src/config/classLevels');

test('mapea 3, 4 y 5 a A1.1, A1.2 y A1.3', () => {
    assert.deepStrictEqual({ ...GRADE_LEVELS }, { 3: 'A1.1', 4: 'A1.2', 5: 'A1.3' });
    assert.deepStrictEqual(VALID_GRADES, [3, 4, 5]);
    assert.deepStrictEqual(LEVELS, ['A1.1', 'A1.2', 'A1.3']);
    assert.strictEqual(levelForGrade(3), 'A1.1');
    assert.strictEqual(levelForGrade(4), 'A1.2');
    assert.strictEqual(levelForGrade(5), 'A1.3');
});

test('isValidGrade acepta solo 3, 4 y 5 como numero entero', () => {
    for (const ok of [3, 4, 5]) assert.strictEqual(isValidGrade(ok), true);
    for (const bad of ['4', 4.5, true, 0, 6, null, undefined, NaN]) {
        assert.strictEqual(isValidGrade(bad), false, `debe rechazar ${String(bad)}`);
    }
});

test('levelForGrade devuelve null si no hay grado valido', () => {
    for (const bad of [null, undefined, '4', 6, NaN]) assert.strictEqual(levelForGrade(bad), null);
});

test('la constante esta congelada', () => {
    assert.ok(Object.isFrozen(GRADE_LEVELS));
    try { GRADE_LEVELS[3] = 'X'; GRADE_LEVELS[9] = 'Y'; } catch (e) { /* modo estricto */ }
    assert.strictEqual(GRADE_LEVELS[3], 'A1.1');
    assert.strictEqual(GRADE_LEVELS[9], undefined);
});
