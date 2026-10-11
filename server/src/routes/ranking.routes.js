const express = require('express');
const rankingController = require('../controllers/ranking.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireRole('student'), rankingController.getRanking);

module.exports = router;
