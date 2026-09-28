// Guardamos el JWT y el rol en localStorage. Es una conveniencia del navegador,
// no una fuente de verdad — el backend siempre revalida el token en cada request.
const TOKEN_KEY = 'ep_token';
const ROLE_KEY = 'ep_role';

export function saveSession(token, role) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ROLE_KEY, role);
}

export function getSession() {
    const token = localStorage.getItem(TOKEN_KEY);
    const role = localStorage.getItem(ROLE_KEY);
    return token && role ? { token, role } : null;
}

export function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
}
