const express = require('express');
const activityController = require('../controllers/activity.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas de actividades son solo para estudiantes autenticados.
router.use(requireAuth, requireRole('student'));

router.get('/:moduleSlug', activityController.listByModule);
router.get('/:id/questions', activityController.getQuestions);
router.post('/:id/attempts', activityController.submitAttempt);

module.exports = router;
