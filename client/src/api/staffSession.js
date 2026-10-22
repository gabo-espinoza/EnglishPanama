// Sesión del personal de gestión (staff): vive SOLO en memoria, igual que la de estudiantes y
// docentes (ver session.js y sessionPolicy.js): recargar la página la descarta. Es una variable
// PROPIA: cerrar una sesión no cierra la otra. No es la fuente de verdad: el servidor revalida el
// token en cada petición y GET /api/staff/me fija el rol y el área reales.
let current = null;

export function saveStaffSession(token, role, area) {
    current = token && role ? { token, role, area: area || null } : null;
    return current !== null;
}

export function getStaffSession() {
    return current ? { token: current.token, role: current.role, area: current.area } : null;
}

export function clearStaffSession() {
    current = null;
}
