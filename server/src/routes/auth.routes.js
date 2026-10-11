const express = require('express');
const authController = require('../controllers/auth.controller');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// El limite estricto de auth frena la fuerza bruta sobre las contrasenas.
router.post('/register/teacher', authLimiter, authController.registerTeacher);
router.post('/register/student', authLimiter, authController.registerStudent);
router.post('/login', authLimiter, authController.login);

module.exports = router;
