import { apiRequest } from './client';

export function login(username, password) {
    return apiRequest('/auth/login', { method: 'POST', body: { username, password } });
}

export function registerStudent(username, password, classCode) {
    return apiRequest('/auth/register/student', { method: 'POST', body: { username, password, classCode } });
}

export function registerTeacher(username, password, displayName) {
    return apiRequest('/auth/register/teacher', { method: 'POST', body: { username, password, displayName } });
}

// Segundo paso del login cuando la cuenta tiene MFA: reto del primer paso + codigo TOTP.
export function loginMfa(mfaToken, totp) {
    return apiRequest('/auth/login/mfa', { method: 'POST', body: { mfaToken, totp } });
}
