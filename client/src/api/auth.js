import { apiRequest } from './client';

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
// token de un solo propósito que entrega el login (viaja en el estado del router, en memoria).
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
