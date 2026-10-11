const express = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const activitiesRoutes = require('./activities.routes');
const dailyChallengeRoutes = require('./dailyChallenge.routes');
const rankingRoutes = require('./ranking.routes');
const teacherRoutes = require('./teacher.routes');
const demoRoutes = require('./demo.routes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/activities', activitiesRoutes);
router.use('/daily-challenge', dailyChallengeRoutes);
router.use('/ranking', rankingRoutes);
router.use('/teacher', teacherRoutes);
router.use('/demo', demoRoutes);

module.exports = router;
