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
