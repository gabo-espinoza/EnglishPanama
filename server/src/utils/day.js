// "Hoy" y dia del anio del reto diario, en hora de Panama.
//
// Panama (America/Panama) es UTC-5 fijo todo el anio: no tiene horario de verano. Por eso basta
// un desplazamiento fijo de -5 horas, sin dependencias ni tablas de zonas horarias. El reto
// cambia a las 00:00 de Panama (05:00 UTC), no a las 19:00 locales como pasaba con el dia UTC.
//
// El dia se calcula SIEMPRE en JavaScript y se pasa a MySQL como parametro (DATE 'YYYY-MM-DD').
// Nunca se usa CURDATE()/NOW() para esto: la zona horaria de la sesion de MySQL es +00:00 en las
// pruebas y desconocida en otras VM. Estas funciones son puras y se prueban en tests/day.test.js.

const MS_PER_DAY = 86400000;
const PANAMA_UTC_OFFSET_HOURS = -5;
const PANAMA_UTC_OFFSET_MS = PANAMA_UTC_OFFSET_HOURS * 3600000;

function addDaysUtc(date, days) {
    return new Date(date.getTime() + days * MS_PER_DAY);
}

function toDateOnlyUtc(date) {
    return date.toISOString().slice(0, 10);
}

function dayOfYearUtc(date) {
    const year = date.getUTCFullYear();
    const startOfYear = Date.UTC(year, 0, 0);
    const today = Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
    return Math.floor((today - startOfYear) / MS_PER_DAY);
}

// Instante -> "reloj de pared" de Panama: un Date cuyos getters UTC devuelven la fecha y hora
// que marcan los relojes de Panama en ese instante.
function toPanamaWallClock(instant) {
    return new Date(instant.getTime() + PANAMA_UTC_OFFSET_MS);
}

// Dia efectivo del reto diario: la fecha de Panama del instante, desplazada `offsetDays` dias
// (modo demo). Devuelve la fecha 'YYYY-MM-DD' y el dia del anio de esa misma fecha.
function effectiveDay(instant, offsetDays = 0) {
    const wall = addDaysUtc(toPanamaWallClock(instant), offsetDays);
    return { date: toDateOnlyUtc(wall), dayOfYear: dayOfYearUtc(wall) };
}

module.exports = {
    addDaysUtc, toDateOnlyUtc, dayOfYearUtc,
    PANAMA_UTC_OFFSET_HOURS, toPanamaWallClock, effectiveDay
};
