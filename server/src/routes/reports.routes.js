// Fase C: POST /api/reports (plataforma) y /api/staff/reports (gestion).
const express = require('express');
const controller = require('../controllers/reports.controller');
const { requireAuth } = require('../middleware/auth');
const { requireStaff } = require('../middleware/staffAuth');
const { reportLimiter } = require('../middleware/rateLimiter');

const platformRouter = express.Router();
// Solo estudiantes y docentes pueden reportar, con limite por cuenta.
// Un unico middleware acepta ambos roles (dos requireRole encadenados
// rechazarian al docente en el primero y no llegarian al segundo).
const allowReporters = (req, res, next) => {
    if (!req.user || !['student', 'teacher'].includes(req.user.role)) {
        return res.status(403).json({ error: 'No tienes permiso para reportar contenido.' });
    }
    return next();
};
platformRouter.post('/', reportLimiter, requireAuth, allowReporters, controller.create);

const staffRouter = express.Router();
const scope = requireStaff({
    roles: ['support', 'moderator', 'content_manager']
});
staffRouter.get('/', scope, controller.list);
staffRouter.patch('/:id', scope, controller.decide);

module.exports = { platformRouter, staffRouter };
