const { getDemoDayOffset, setSetting, DEMO_OFFSET_KEY } = require('./settings.service');

// Avanza el "dia" del modo demo en 1. Solo se expone cuando DEMO_MODE=true
// (el controlador lo verifica), para poder mostrar el reto diario en la presentacion.
async function advanceDay() {
    const current = await getDemoDayOffset();
    const next = current + 1;
    await setSetting(DEMO_OFFSET_KEY, next);
    return { demoDayOffset: next };
}

module.exports = { advanceDay };
