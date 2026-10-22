import { apiRequest } from './client';

// Datos de la clase del docente: { displayName, classCode, classGrade, classLevel, gradeLocked, grades }.
export function getClass(token) {
    return apiRequest('/teacher/class', { token });
}

// Declara el grado de la clase una sola vez. El servidor exige `confirm: true`
// y responde 409 con code GRADE_LOCKED si el grado ya estaba declarado.
export function declareGrade(token, grade) {
    return apiRequest('/teacher/class/grade', { method: 'PUT', body: { grade, confirm: true }, token });
}

// Estudiantes de la clase: [{ userId, alias, avatar, xp, level, completedActivities, averages: { vocabulary, grammar, reading } }].
// Los promedios son porcentajes (0-100) o null si el estudiante no tiene intentos en ese módulo.
export function getStudents(token) {
    return apiRequest('/teacher/students', { token });
}

// Temas con más errores en la clase: [{ topic, attempts, errors, errorRate }] (errorRate en %, 0-100).
// Sin grado declarado el servidor responde una lista vacía.
export function getDifficultTopics(token, limit = 5) {
    return apiRequest(`/teacher/difficult-topics?limit=${encodeURIComponent(limit)}`, { token });
}
