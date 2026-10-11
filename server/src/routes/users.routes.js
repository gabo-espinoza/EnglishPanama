const express = require('express');
const userController = require('../controllers/user.controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Perfil del usuario autenticado (estudiante o docente).
router.get('/me', requireAuth, userController.getMe);
router.patch('/me', requireAuth, userController.updateMe);

module.exports = router;
