// Fecha "hoy" y dia del anio en UTC.
//
// El resto del backend esta fijado a UTC (config/db.js y config/auditDb.js usan
// timezone: 'Z'). Si el reto diario se calculara con la zona horaria local del
// proceso de Node, cerca de la medianoche la fecha del reto y la fecha guardada
// en la base podrian no coincidir. Estas tres funciones son puras y se prueban
// en tests/day.test.js.

const MS_PER_DAY = 86400000;

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

module.exports = { addDaysUtc, toDateOnlyUtc, dayOfYearUtc };
