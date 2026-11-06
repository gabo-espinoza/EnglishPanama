// Identificadores numericos que llegan en la URL. Number('abc') da NaN y Number('1.5') o
// Number('1e2') pasan por numeros que nadie envio: el servidor termina en un 500 o deja
// `activity:NaN` en la auditoria. Aqui solo se aceptan enteros positivos en texto plano.
const AppError = require('./AppError');

function parseId(value, label = 'El identificador') {
    const text = typeof value === 'number' ? String(value) : value;
    if (typeof text !== 'string' || !/^[1-9]\d{0,9}$/.test(text)) {
        throw new AppError(`${label} no es valido.`, 400);
    }
    return Number(text);
}

module.exports = { parseId };
