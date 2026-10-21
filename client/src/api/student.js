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
