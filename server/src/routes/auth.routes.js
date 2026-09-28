const express = require('express');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register/teacher', authController.registerTeacher);
router.post('/register/student', authController.registerStudent);
router.post('/login', authController.login);

module.exports = router;
