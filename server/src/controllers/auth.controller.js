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

module.exports = { registerTeacher, registerStudent, login };
