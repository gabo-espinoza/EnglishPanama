const express = require('express');
const dailyChallengeController = require('../controllers/dailyChallenge.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('student'));

router.get('/', dailyChallengeController.getToday);
router.post('/complete', dailyChallengeController.complete);

module.exports = router;
