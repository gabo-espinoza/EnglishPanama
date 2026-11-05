const test = require('node:test');
const assert = require('node:assert/strict');
const { addDaysUtc, toDateOnlyUtc, dayOfYearUtc } = require('../src/utils/day');

// El reto diario debe usar la misma zona horaria que la base (UTC), no la del
// proceso de Node. Estas pruebas no necesitan MySQL.

test('toDateOnlyUtc devuelve la fecha UTC, no la local', () => {
    assert.equal(toDateOnlyUtc(new Date('2026-01-01T00:30:00Z')), '2026-01-01');
    assert.equal(toDateOnlyUtc(new Date('2026-12-31T23:30:00Z')), '2026-12-31');
});

test('addDaysUtc suma dias completos sin desviarse por horario de verano', () => {
    const d = new Date('2026-03-08T12:00:00Z');
    assert.equal(toDateOnlyUtc(addDaysUtc(d, 1)), '2026-03-09');
    assert.equal(toDateOnlyUtc(addDaysUtc(d, -1)), '2026-03-07');
    assert.equal(toDateOnlyUtc(addDaysUtc(d, 30)), '2026-04-07');
});

test('dayOfYearUtc: 1 de enero = 1; 31 de diciembre = 365 / 366', () => {
    assert.equal(dayOfYearUtc(new Date('2026-01-01T12:00:00Z')), 1);
    assert.equal(dayOfYearUtc(new Date('2026-12-31T12:00:00Z')), 365);
    assert.equal(dayOfYearUtc(new Date('2024-12-31T12:00:00Z')), 366);
});

test('la fecha efectiva no cambia con la hora del dia', () => {
    const a = new Date('2026-06-15T00:00:00Z');
    const b = new Date('2026-06-15T23:59:59Z');
    assert.equal(toDateOnlyUtc(a), toDateOnlyUtc(b));
    assert.equal(dayOfYearUtc(a), dayOfYearUtc(b));
});
