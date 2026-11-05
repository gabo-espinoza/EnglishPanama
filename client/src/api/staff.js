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

// Consulta con filtros opcionales: omite los valores vacíos.
function withQuery(path, filters) {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    });
    const query = params.toString();
    return query ? `${path}?${query}` : path;
}

const contentPath = (id) => `/staff/content/activities/${encodeURIComponent(id)}`;

// ---------------------------------------------------------------------------
// Contenido (/api/staff/content, área content). Separación de funciones: el gestor
// (content_manager) escribe y envía; el revisor (content_reviewer) aprueba o rechaza.
// No existe un endpoint propio de "cola de revisión": el revisor usa
// listContentActivities(token, { status: 'in_review' }). Un estado incompatible
// responde 409 con code INVALID_STATE; una actividad inexistente, 404.
// Ciclo: draft -> in_review -> published -> archived (reject y withdraw vuelven a draft).
// ---------------------------------------------------------------------------

// content_manager, content_reviewer. `filters`: status (draft | in_review | published | archived),
// module (vocabulary | grammar | reading), level (A1.1 | A1.2 | A1.3). El revisor solo recibe
// in_review y published. Devuelve un ARREGLO de { id, title, gameType, level, status, authorId,
// reviewerId, reviewNote, replacesId, updatedAt, moduleSlug }.
export function listContentActivities(token, filters = {}) {
    return apiRequest(withQuery('/staff/content/activities', filters), { token });
}

// content_manager, content_reviewer. Devuelve la actividad con passageText, sortOrder y
// questions: [{ id, topic, prompt, options, correctAnswer }] (incluye las respuestas correctas).
export function getContentActivity(token, id) {
    return apiRequest(contentPath(id), { token });
}

// content_manager. `fields`: { moduleSlug, title (<=100), gameType (memory | multiple_choice |
// sentence_order | fill_blank), level, passageText? (<=4000) }. Crea un borrador; devuelve la actividad.
export function createContentActivity(token, fields) {
    return apiRequest('/staff/content/activities', { method: 'POST', body: fields, token });
}

// content_manager. Edición parcial de un borrador (mismos campos que al crear). 409 si no es draft.
export function updateContentActivity(token, id, fields) {
    return apiRequest(contentPath(id), { method: 'PUT', body: fields, token });
}

// content_manager. Solo borradores. Devuelve { deleted: true }.
export function deleteContentActivity(token, id) {
    return apiRequest(contentPath(id), { method: 'DELETE', token });
}

// content_manager. `question`: { topic (<=50), prompt (<=500), options (2 a 8 textos de <=120),
// correctAnswer }. correctAnswer es una de las opciones (texto) o, en sentence_order, un arreglo
// con el orden. Solo en borradores. Devuelve la actividad completa actualizada.
export function addContentQuestion(token, id, question) {
    return apiRequest(`${contentPath(id)}/questions`, { method: 'POST', body: question, token });
}

// content_manager. Reemplaza la pregunta completa (mismo cuerpo que al agregar). 404 si no existe.
export function updateContentQuestion(token, id, questionId, question) {
    return apiRequest(`${contentPath(id)}/questions/${encodeURIComponent(questionId)}`, { method: 'PUT', body: question, token });
}

// content_manager. Devuelve la actividad completa actualizada.
export function deleteContentQuestion(token, id, questionId) {
    return apiRequest(`${contentPath(id)}/questions/${encodeURIComponent(questionId)}`, { method: 'DELETE', token });
}

// content_manager. draft -> in_review. 409 NO_QUESTIONS si no tiene preguntas.
export function submitContentActivity(token, id) {
    return apiRequest(`${contentPath(id)}/submit`, { method: 'POST', body: {}, token });
}

// content_manager. in_review -> draft.
export function withdrawContentActivity(token, id) {
    return apiRequest(`${contentPath(id)}/withdraw`, { method: 'POST', body: {}, token });
}

// content_manager. Copia una actividad publicada a un borrador nuevo (replacesId = original).
// Devuelve el borrador nuevo (con su propio id).
export function createContentRevision(token, id) {
    return apiRequest(`${contentPath(id)}/revision`, { method: 'POST', body: {}, token });
}

// content_manager. published -> archived.
export function archiveContentActivity(token, id) {
    return apiRequest(`${contentPath(id)}/archive`, { method: 'POST', body: {}, token });
}

// content_reviewer. in_review -> published. 403 con code SAME_AUTHOR si la cuenta es la autora.
export function approveContentActivity(token, id) {
    return apiRequest(`${contentPath(id)}/approve`, { method: 'POST', body: {}, token });
}

// content_reviewer. in_review -> draft. `note` obligatoria (<=500, sin "<" ni ">").
export function rejectContentActivity(token, id, note) {
    return apiRequest(`${contentPath(id)}/reject`, { method: 'POST', body: { note }, token });
}

// ---------------------------------------------------------------------------
// Juego (/api/staff/game, área game, solo game_manager).
// ---------------------------------------------------------------------------

// Devuelve { xpPerCorrect, xpPerLevel, dailyChallengeXp }.
export function getGameRules(token) {
    return apiRequest('/staff/game/rules', { token });
}

// `rules`: xpPerCorrect (1-50), xpPerLevel (10-1000), dailyChallengeXp (1-100), enteros.
// Un campo omitido vuelve al valor por defecto (5 / 100 / 10): envía siempre los tres.
// Devuelve las reglas guardadas.
export function updateGameRules(token, rules) {
    return apiRequest('/staff/game/rules', { method: 'PUT', body: rules, token });
}

// Devuelve un ARREGLO de { studentId, alias, xp, aliasHidden } (nunca nombres reales).
export function listGameAliases(token) {
    return apiRequest('/staff/game/aliases', { token });
}

// Oculta (hidden: true) o muestra (false) el alias en el ranking. Devuelve { studentId, aliasHidden }.
// 404 si el estudiante no existe.
export function setAliasHidden(token, studentId, hidden) {
    return apiRequest(`/staff/game/aliases/${encodeURIComponent(studentId)}`, { method: 'PUT', body: { hidden: Boolean(hidden) }, token });
}

// Devuelve un ARREGLO de { id, position, questionId, prompt, activityTitle, activityStatus }.
export function listDailyChallenges(token) {
    return apiRequest('/staff/game/daily-challenges', { token });
}

// Devuelve un ARREGLO de { id, activityId, activityTitle, module, level, gameType, text } solo de
// actividades publicadas (nunca la respuesta correcta). Filtros opcionales: module (vocabulary |
// grammar | reading), level (A1.1 | A1.2 | A1.3), q (texto, hasta 100 caracteres) y limit (50 por
// defecto, maximo 100).
export function listGameQuestions(token, { module, level, q, limit } = {}) {
    const params = new URLSearchParams();
    if (module) params.set('module', module);
    if (level) params.set('level', level);
    if (q) params.set('q', q);
    if (limit) params.set('limit', String(limit));
    const query = params.toString();
    return apiRequest(`/staff/game/questions${query ? `?${query}` : ''}`, { token });
}

// `questionId` obligatorio; `position` opcional (si falta, va al final). 404 si la pregunta no
// existe. Devuelve 201 { id, questionId, position }.
export function addDailyChallenge(token, questionId, position) {
    const body = { questionId };
    if (position !== undefined && position !== null && position !== '') body.position = position;
    return apiRequest('/staff/game/daily-challenges', { method: 'POST', body, token });
}

// Quita un reto del pool. Devuelve { deleted: true }. 404 si no existe.
export function removeDailyChallenge(token, challengeId) {
    return apiRequest(`/staff/game/daily-challenges/${encodeURIComponent(challengeId)}`, { method: 'DELETE', token });
}

// ---------------------------------------------------------------------------
// Reportes de contenido (/api/staff/reports). Cada rol ve solo su bandeja:
//   support -> kind error; moderator -> kind inappropriate; content_manager -> status escalated.
// ---------------------------------------------------------------------------

// support, moderator, content_manager. `filters`: status (open | escalated | resolved | dismissed)
// y kind (solo el propio del rol; otro da 403). Devuelve un ARREGLO (máx. 200) de
// { id, kind, activityId, questionId, reporterRole, reporterAlias, reporterActive, note, status,
// createdAt, handledBy, activityTitle }.
export function listReports(token, filters = {}) {
    return apiRequest(withQuery('/staff/reports', filters), { token });
}

// `decision`: escalate | resolve | dismiss (support y moderator); resolve | dismiss
// (content_manager). Otra combinación da 403. 409 con code REPORT_CLOSED si el reporte ya fue
// atendido o no existe. Devuelve { id, status }.
export function decideReport(token, reportId, decision) {
    return apiRequest(`/staff/reports/${encodeURIComponent(reportId)}`, { method: 'PATCH', body: { decision }, token });
}
