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

function xpForScore(correctCount) {
    return correctCount * XP_PER_CORRECT;
}

function levelForXp(totalXp) {
    return Math.floor(totalXp / XP_PER_LEVEL) + 1;
}

// Datos listos para pintar la barra de progreso del estudiante.
function progressForXp(totalXp) {
    return {
        level: levelForXp(totalXp),
        xpIntoLevel: totalXp % XP_PER_LEVEL,
        xpForNextLevel: XP_PER_LEVEL
    };
}

module.exports = { XP_PER_CORRECT, XP_PER_LEVEL, xpForScore, levelForXp, progressForXp };
