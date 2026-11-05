const express = require('express');
const demoController = require('../controllers/demo.controller');
const { requireAuth } = require('../middleware/auth');
const { demoLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Requiere una sesion (cualquier rol) y DEMO_MODE=true en el servidor.
// Se mantiene "cualquier rol" porque es el contrato documentado en docs/api.md;
// el limite dedicado evita el abuso sin cambiar quien puede llamarlo.
router.post('/advance-day', requireAuth, demoLimiter, demoController.advanceDay);

module.exports = router;
