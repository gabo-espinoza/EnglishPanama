// Sesión del personal de gestión (staff). Claves PROPIAS: no deben chocar con
// ep_token / ep_role (sesión de estudiantes y docentes), para que cerrar una
// sesión no cierre la otra. Es una conveniencia del navegador, no la fuente de
// verdad: el servidor revalida el token en cada petición y GET /api/staff/me
// fija el rol y el área reales.
const TOKEN_KEY = 'ep_staff_token';
const ROLE_KEY = 'ep_staff_role';
const AREA_KEY = 'ep_staff_area';

export function saveStaffSession(token, role, area) {
    try {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(ROLE_KEY, role);
        localStorage.setItem(AREA_KEY, area || '');
        return true;
    } catch {
        // Almacenamiento no disponible (modo privado o bloqueado): la sesión no se guarda.
        return false;
    }
}

export function getStaffSession() {
    try {
        const token = localStorage.getItem(TOKEN_KEY);
        const role = localStorage.getItem(ROLE_KEY);
        const area = localStorage.getItem(AREA_KEY) || null;
        return token && role ? { token, role, area } : null;
    } catch {
        return null;
    }
}

export function clearStaffSession() {
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ROLE_KEY);
        localStorage.removeItem(AREA_KEY);
    } catch {
        // Nada que limpiar si el almacenamiento no está disponible.
    }
}
