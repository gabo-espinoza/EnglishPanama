const express = require('express');
const teacherController = require('../controllers/teacher.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// El panel docente es solo para docentes autenticados.
router.use(requireAuth, requireRole('teacher'));

router.get('/students', teacherController.getStudents);
router.get('/difficult-topics', teacherController.getDifficultTopics);

module.exports = router;
