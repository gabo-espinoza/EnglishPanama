// Sesión de estudiantes y docentes: vive SOLO en memoria (una variable del módulo).
//
// No se guarda en localStorage ni en sessionStorage a propósito: recargar la página, abrir otra
// pestaña o cerrar el navegador la descarta y hay que iniciar sesión de nuevo (ver
// sessionPolicy.js). Así no queda ningún token escrito en el equipo, que en un colegio puede
// ser compartido. Es una conveniencia de la pantalla, no la fuente de verdad: el backend
// revalida el token en cada petición.
let current = null;

export function saveSession(token, role) {
    current = token && role ? { token, role } : null;
}

export function getSession() {
    return current ? { token: current.token, role: current.role } : null;
}

export function clearSession() {
    current = null;
}
