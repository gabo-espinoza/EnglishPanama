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

// Vinculacion del autenticador. `token` es el token de vinculacion que recibe un docente
// en su primer inicio de sesion (o una sesion normal, si el MFA es opcional para la cuenta).
export function mfaSetup(token) {
    return apiRequest('/auth/mfa/setup', { method: 'POST', body: {}, token });
}

export function mfaConfirm(token, totp) {
    return apiRequest('/auth/mfa/confirm', { method: 'POST', body: { totp }, token });
}
