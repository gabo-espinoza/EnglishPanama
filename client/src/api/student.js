import { apiRequest } from './client';

// Perfil del estudiante. `level` es el nivel de XP (numérico); el nivel de la clase
// (A1.x) viene en `classLevel` y el grado en `classGrade`.
export function getProfile(token) {
    return apiRequest('/users/me', { token });
}

// Actividades del nivel de la clase para un módulo (vocabulary, grammar o reading).
// Devuelve [] si el docente aún no declaró el grado.
export function getActivities(token, moduleSlug) {
    return apiRequest(`/activities/${moduleSlug}`, { token });
}

// Cambia el avatar. Se envía el identificador corto (ej. "fox"), nunca un emoji.
// Devuelve el perfil actualizado.
export function updateAvatar(token, avatar) {
    return apiRequest('/users/me', { method: 'PATCH', token, body: { avatar } });
}

// Ranking de la clase del estudiante: [{ position, alias, avatar, xp, level, ... }].
export function getRanking(token) {
    return apiRequest('/ranking', { token });
}

// Reto diario de hoy: { date, challengeId, question: { id, prompt, options, topic }, completed }.
// Responde 404 si no hay retos para el nivel de la clase.
export function getDailyChallenge(token) {
    return apiRequest('/daily-challenge', { token });
}
