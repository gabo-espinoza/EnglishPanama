// Fase C: /api/staff/game, area 'game', solo game_manager.
const express = require('express');
const controller = require('../controllers/game.controller');
const { requireStaff } = require('../middleware/staffAuth');

const router = express.Router();
const guard = requireStaff({ area: 'game', roles: ['game_manager'] });

router.get('/rules', guard, controller.getRules);
router.put('/rules', guard, controller.updateRules);

router.get('/aliases', guard, controller.listAliases);
router.put('/aliases/:studentId', guard, controller.setAliasHidden);

router.get('/daily-challenges', guard, controller.listDailyChallenges);
router.post('/daily-challenges', guard, controller.addDailyChallenge);
router.delete('/daily-challenges/:id', guard, controller.removeDailyChallenge);

module.exports = router;
