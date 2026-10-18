const authService = require('../services/auth.service');

async function registerTeacher(req, res, next) {
    try {
        const result = await authService.registerTeacher(req.body);
        res.status(201).json(result);
    } catch (err) {
        next(err);
    }
}

async function registerStudent(req, res, next) {
    try {
        const result = await authService.registerStudent(req.body);
        res.status(201).json(result);
    } catch (err) {
        next(err);
    }
}

async function login(req, res, next) {
    try {
        const result = await authService.login(req.body);
        res.json(result);
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/login/mfa  (publico) - segundo factor: { mfaToken, totp }
async function loginMfa(req, res, next) {
    try {
        const { mfaToken, totp: code } = req.body || {};
        const result = await authService.verifyMfa({ mfaToken, totp: code });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/mfa/setup  (autenticado) - genera el secreto y el URI otpauth
async function setupMfa(req, res, next) {
    try {
        const result = await authService.setupMfa({ userId: req.user.id, totp: (req.body || {}).totp });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/mfa/confirm  (autenticado) - confirma el codigo y activa el MFA
async function confirmMfa(req, res, next) {
    try {
        const result = await authService.confirmMfa({ userId: req.user.id, totp: (req.body || {}).totp });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

module.exports = { registerTeacher, registerStudent, login, loginMfa, setupMfa, confirmMfa };
