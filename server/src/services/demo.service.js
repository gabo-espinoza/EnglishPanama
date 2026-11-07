const { incrementSetting, DEMO_OFFSET_KEY } = require('./settings.service');
const audit = require('./audit.service');

// Avanza el "dia" del modo demo en 1. Solo se expone cuando DEMO_MODE=true
// (el controlador lo verifica), para poder mostrar el reto diario en la presentacion.
// El incremento es atomico en la base: dos llamadas concurrentes no pierden un dia.
async function advanceDay(actor) {
    const next = await incrementSetting(DEMO_OFFSET_KEY);
    await audit.record({
        actorType: actor ? actor.role : 'user',
        actorId: actor ? actor.id : null,
        actorRole: actor ? actor.role : null,
        action: 'demo.advance_day', outcome: 'ok'
    });
    return { demoDayOffset: next };
}

module.exports = { advanceDay };
