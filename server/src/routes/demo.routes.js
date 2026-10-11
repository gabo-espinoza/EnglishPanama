const express = require('express');
const demoController = require('../controllers/demo.controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Requiere una sesión (cualquier rol) y DEMO_MODE=true en el servidor.
router.post('/advance-day', requireAuth, demoController.advanceDay);

module.exports = router;
