import { clearSession } from './session';
import { clearStaffSession } from './staffSession';

// Política de sesión del cliente:
//   1. Recargar la página cierra la sesión y lleva al login.
//   2. Cinco minutos sin actividad cierran la sesión y llevan al login (IdleLogout.jsx).
// Es una medida del navegador, no del servidor: ver docs/frontend.md ("Sesión").

export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const RELOAD_NOTICE = 'Por seguridad, la sesión se cierra al recargar la página. Inicia sesión de nuevo.';
export const IDLE_NOTICE = 'Tu sesión se cerró por 5 minutos de inactividad. Inicia sesión de nuevo.';

// Pantallas que no requieren sesión: ahí no corre el contador de inactividad.
const PUBLIC_PATHS = ['/', '/login', '/register', '/staff/login'];

export function isPublicPath(pathname) {
    return PUBLIC_PATHS.includes(pathname);
}

// El área de gestión tiene su propio inicio de sesión.
export function loginPathFor(pathname) {
    return pathname === '/staff' || pathname.startsWith('/staff/') ? '/staff/login' : '/login';
}

export function clearAllSessions() {
    clearSession();
    clearStaffSession();
}

// Aviso que se muestra en el login tras un cierre automático. Vive en memoria y solo lo deja
// applyReloadPolicy (el estado del router no sirve ahí: se escribe antes de montar el router).
let pendingNotice = null;

export function peekPendingNotice() {
    return pendingNotice;
}

export function clearPendingNotice() {
    pendingNotice = null;
}

// Versiones anteriores guardaban el token en localStorage. Se borra lo que haya quedado para que
// no siga escrito en el equipo.
const LEGACY_KEYS = ['ep_token', 'ep_role', 'ep_staff_token', 'ep_staff_role', 'ep_staff_area'];

export function purgeLegacyStorage() {
    try {
        LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {
        // Almacenamiento no disponible: no hay nada que borrar.
    }
}

export function wasPageReloaded() {
    try {
        const [entry] = performance.getEntriesByType('navigation');
        return entry ? entry.type === 'reload' : false;
    } catch {
        return false;
    }
}

// Se llama UNA vez al arrancar, antes de montar el router. La sesión ya no existe (vive en memoria),
// pero el navegador conserva el estado del historial entre recargas, y ahí viajan tokens de un solo
// propósito (primer ingreso, vinculación del MFA, reto del segundo paso). Al recargar se descarta
// ese estado y, si la pantalla actual no es pública, se vuelve al login con un aviso.
export function applyReloadPolicy() {
    purgeLegacyStorage();
    clearAllSessions();
    if (!wasPageReloaded()) return;

    const { pathname, search } = window.location;
    if (isPublicPath(pathname)) {
        window.history.replaceState(null, '', pathname + search);
        return;
    }
    pendingNotice = RELOAD_NOTICE;
    window.history.replaceState(null, '', loginPathFor(pathname));
}
