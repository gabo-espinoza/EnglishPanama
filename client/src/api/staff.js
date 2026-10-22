import { apiRequest } from './client';

// API del personal de gestión (/api/staff/*). El token de staff se pasa de forma
// explícita en cada llamada (mismo estilo que api/auth.js). Los errores son ApiError
// (.status / .code). Un 401 significa sesión vencida o revocada; un 403, falta de permiso.

// Público. Devuelve { token, role, area, expiresIn } (expiresIn en segundos, 1200).
export function login(username, password, totp) {
    return apiRequest('/staff/auth/login', { method: 'POST', body: { username, password, totp } });
}

// Cualquier gestor. Devuelve { id, username, role, status, createdAt, area }.
export function me(token) {
    return apiRequest('/staff/me', { token });
}

// access_manager, auditor. Devuelve { accounts: [{ id, username, role, status, createdAt }] }.
export function listAccounts(token) {
    return apiRequest('/staff/accounts', { token });
}

// access_manager. Devuelve 201 { ...docente, temporaryPassword, classCode } (la contraseña se muestra una sola vez).
export function createTeacher(token, username, displayName) {
    return apiRequest('/staff/teachers', { method: 'POST', body: { username, displayName }, token });
}

// access_manager. Devuelve { id, username, mfaReset: true }.
export function resetTeacherMfa(token, teacherId) {
    return apiRequest(`/staff/teachers/${encodeURIComponent(teacherId)}/reset-mfa`, { method: 'POST', body: {}, token });
}

// access_manager. `reason`: de 5 a 40 caracteres, sin "|". Devuelve { id, username, gradeReset: true }.
// 409 con code GRADE_NOT_SET si la clase aún no tiene grado.
export function resetTeacherGrade(token, teacherId, reason) {
    return apiRequest(`/staff/teachers/${encodeURIComponent(teacherId)}/reset-grade`, { method: 'POST', body: { reason }, token });
}

// access_manager, auditor. `status` opcional: pending | approved | rejected.
// Devuelve { requests: [{ id, targetId, targetUsername, action, requestedBy, decidedBy, status, createdAt, decidedAt }] }.
export function listChangeRequests(token, status) {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return apiRequest(`/staff/change-requests${query}`, { token });
}

// access_manager. `action`: suspend | activate. Devuelve 201 { id, targetId, action, status: 'pending' }.
export function createChangeRequest(token, targetId, action) {
    return apiRequest('/staff/change-requests', { method: 'POST', body: { targetId, action }, token });
}

// auditor. `decision`: approved | rejected. 409 si la solicitud ya fue resuelta.
export function decideChangeRequest(token, requestId, decision) {
    return apiRequest(`/staff/change-requests/${encodeURIComponent(requestId)}/decision`, {
        method: 'POST',
        body: { decision },
        token
    });
}

// auditor. `filters` admite actorType, actorRole, action, from, to, limit, offset (los vacíos se omiten).
// Devuelve { total, rows: [{ id, occurred_at, actor_type, actor_id, actor_role, action, target, outcome, ip }] }.
export function listAudit(token, filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    });
    const query = params.toString();
    return apiRequest(`/staff/audit${query ? `?${query}` : ''}`, { token });
}

// auditor. Devuelve { ok: true, checked } o, si la cadena está rota, { ok: false, brokenAtId, reason }.
export function verifyAudit(token) {
    return apiRequest('/staff/audit/verify', { token });
}

// analyst. Métricas agregadas y anónimas.
export function analyticsDashboard(token) {
    return apiRequest('/staff/analytics/dashboard', { token });
}
