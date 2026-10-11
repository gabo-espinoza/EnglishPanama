const express = require('express');
const demoController = require('../controllers/demo.controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Requiere una sesion (cualquier rol) y DEMO_MODE=true en el servidor.
router.post('/advance-day', requireAuth, demoController.advanceDay);

module.exports = router;
