// Reloj inyectable. El codigo de produccion llama a now(); las pruebas fijan un instante con
// setNow() para comprobar los cambios de dia sin esperar. setNow(null) restaura el reloj real.
let fixed = null;

function now() {
    return fixed ? new Date(fixed.getTime()) : new Date();
}

function setNow(instant) {
    fixed = instant === null || instant === undefined ? null : new Date(instant);
}

module.exports = { now, setNow };
