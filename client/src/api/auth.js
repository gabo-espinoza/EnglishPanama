import { apiRequest } from './client';
import { clearSession, getSession } from './session';

export function login(username, password) {
    return apiRequest('/auth/login', { method: 'POST', body: { username, password } });
}

export function registerStudent(username, password, classCode) {
    return apiRequest('/auth/register/student', { method: 'POST', body: { username, password, classCode } });
}

// Segundo paso del login cuando la cuenta tiene MFA: reto del primer paso + codigo TOTP.
export function loginMfa(mfaToken, totp) {
    return apiRequest('/auth/login/mfa', { method: 'POST', body: { mfaToken, totp } });
}

// Primer ingreso de un docente: reemplaza la contraseña temporal. `passwordToken` es el
// token de un solo propósito que entrega el login (viaja en el estado del router, historial del navegador; nunca en localStorage ni en la URL).
export function setInitialPassword(passwordToken, newPassword, confirmPassword) {
    return apiRequest('/auth/set-initial-password', {
        method: 'POST',
        body: { newPassword, confirmPassword },
        token: passwordToken
    });
}

// Vinculacion del autenticador. `token` es el token de vinculacion que recibe un docente
// en su primer inicio de sesion (o una sesion normal, si el MFA es opcional para la cuenta).
export function mfaSetup(token) {
    return apiRequest('/auth/mfa/setup', { method: 'POST', body: {}, token });
}

export function mfaConfirm(token, totp) {
    return apiRequest('/auth/mfa/confirm', { method: 'POST', body: { totp }, token });
}

// Cierre de sesión de estudiantes y docentes. Primero pide al servidor que revoque la sesión
// (POST /auth/logout sube token_version: el token actual y cualquier otra sesión abierta de la
// cuenta dejan de valer) y después borra la sesión de la memoria del navegador.
// La petición se lanza con el token ANTES de borrarlo, pero la sesión local se borra sin esperar
// la respuesta: así la pantalla no se queda colgada y un nuevo inicio de sesión no puede ser
// borrado por una respuesta tardía. Los errores (sin red, token ya vencido) se ignoran: la sesión
// local se cierra igual. La promesa devuelta nunca se rechaza.
export function logout() {
    const session = getSession();
    const request = session
        ? apiRequest('/auth/logout', { method: 'POST', body: {}, token: session.token }).then(() => undefined, () => undefined)
        : Promise.resolve();
    clearSession();
    return request;
}
