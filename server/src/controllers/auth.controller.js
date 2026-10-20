const authService = require('../services/auth.service');

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
        const result = await authService.setupMfa({ userId: req.user.id, totp: (req.body || {}).totp, enrollOnly: Boolean(req.enrollOnly) });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/mfa/confirm  (autenticado) - confirma el codigo y activa el MFA
async function confirmMfa(req, res, next) {
    try {
        const result = await authService.confirmMfa({ userId: req.user.id, totp: (req.body || {}).totp, enrollOnly: Boolean(req.enrollOnly) });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/change-password  (autenticado) - { currentPassword, newPassword }
async function changePassword(req, res, next) {
    try {
        const { currentPassword, newPassword } = req.body || {};
        const result = await authService.changePassword({ userId: req.user.id, currentPassword, newPassword });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/set-initial-password  (token pwd_change) - { newPassword, confirmPassword }
async function setInitialPassword(req, res, next) {
    try {
        const { newPassword, confirmPassword } = req.body || {};
        const result = await authService.setInitialPassword({ userId: req.user.id, newPassword, confirmPassword });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

module.exports = { setInitialPassword, changePassword, registerStudent, login, loginMfa, setupMfa, confirmMfa };
