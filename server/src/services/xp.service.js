// Reglas de experiencia (XP) y niveles del MVP.
//
// - Cada respuesta correcta otorga XP_PER_CORRECT puntos.
// - Cada nivel requiere XP_PER_LEVEL puntos acumulados.
//
// Coincide con el ejemplo del contrato de API:
//   8 aciertos -> 40 XP (5 por acierto)
//   140 XP acumulados -> nivel 2 (100 XP por nivel)
const XP_PER_CORRECT = 5;
const XP_PER_LEVEL = 100;

function xpForScore(correctCount, perCorrect = XP_PER_CORRECT) {
    return correctCount * perCorrect;
}

function levelForXp(totalXp, perLevel = XP_PER_LEVEL) {
    return Math.floor(totalXp / perLevel) + 1;
}

// Datos listos para pintar la barra de progreso del estudiante.
function progressForXp(totalXp, perLevel = XP_PER_LEVEL) {
    return {
        level: levelForXp(totalXp, perLevel),
        xpIntoLevel: totalXp % perLevel,
        xpForNextLevel: perLevel
    };
}

module.exports = { XP_PER_CORRECT, XP_PER_LEVEL, xpForScore, levelForXp, progressForXp };
