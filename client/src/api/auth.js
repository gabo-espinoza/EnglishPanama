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
