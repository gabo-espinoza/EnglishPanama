const test = require('node:test');
const assert = require('node:assert/strict');
const {
    addDaysUtc, toDateOnlyUtc, dayOfYearUtc, toPanamaWallClock, effectiveDay, PANAMA_UTC_OFFSET_HOURS
} = require('../src/utils/day');

// El dia del reto diario es el de Panama (UTC-5 fijo, sin horario de verano), no el del
// proceso de Node ni el UTC. Estas pruebas no necesitan MySQL.

test('Panama es UTC-5 fijo', () => {
    assert.equal(PANAMA_UTC_OFFSET_HOURS, -5);
});

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

test('effectiveDay: el dia cambia a las 05:00Z (00:00 de Panama), no a las 00:00Z', () => {
    assert.equal(effectiveDay(new Date('2026-11-05T03:00:00Z')).date, '2026-11-04'); // 22:00 PA
    assert.equal(effectiveDay(new Date('2026-11-05T04:59:59Z')).date, '2026-11-04');
    assert.equal(effectiveDay(new Date('2026-11-05T05:00:00Z')).date, '2026-11-05'); // 00:00 PA
    assert.equal(effectiveDay(new Date('2026-11-05T00:30:00Z')).date, '2026-11-04'); // 19:30 PA
});

test('effectiveDay: cruces de anio, mes y bisiesto en hora de Panama', () => {
    assert.equal(effectiveDay(new Date('2027-01-01T04:59:00Z')).date, '2026-12-31');
    assert.equal(effectiveDay(new Date('2027-01-01T05:00:00Z')).date, '2027-01-01');
    assert.equal(effectiveDay(new Date('2024-03-01T04:00:00Z')).date, '2024-02-29');
    assert.equal(effectiveDay(new Date('2026-01-01T03:00:00Z')).dayOfYear, 365); // 31-dic en Panama
    assert.equal(effectiveDay(new Date('2024-12-31T12:00:00Z')).dayOfYear, 366);
});

test('effectiveDay: el offset del modo demo suma dias de Panama', () => {
    const now = new Date('2026-11-05T03:00:00Z'); // 4-nov en Panama
    assert.equal(effectiveDay(now, 1).date, '2026-11-05');
    assert.equal(effectiveDay(now, 30).date, '2026-12-04');
    assert.equal(effectiveDay(now, -4).date, '2026-10-31');
});

test('toPanamaWallClock: los getters UTC dan la hora de pared de Panama', () => {
    const w = toPanamaWallClock(new Date('2026-11-05T03:00:00Z'));
    assert.equal(w.getUTCHours(), 22);
    assert.equal(w.getUTCDate(), 4);
});

test('la fecha efectiva no cambia con la hora del dia de Panama', () => {
    const a = effectiveDay(new Date('2026-06-15T05:00:00Z'));
    const b = effectiveDay(new Date('2026-06-16T04:59:59Z'));
    assert.deepEqual(a, b);
});
