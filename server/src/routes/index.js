const express = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const staffRoutes = require('./staff.routes');
const activitiesRoutes = require('./activities.routes');
const dailyChallengeRoutes = require('./dailyChallenge.routes');
const rankingRoutes = require('./ranking.routes');
const teacherRoutes = require('./teacher.routes');
const demoRoutes = require('./demo.routes');
const contentRoutes = require('./content.routes');
const gameRoutes = require('./game.routes');
const reportsRoutes = require('./reports.routes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/staff', staffRoutes);
router.use('/activities', activitiesRoutes);
router.use('/daily-challenge', dailyChallengeRoutes);
router.use('/ranking', rankingRoutes);
router.use('/teacher', teacherRoutes);
router.use('/demo', demoRoutes);
router.use('/reports', reportsRoutes.platformRouter);
router.use('/staff/content', contentRoutes);
router.use('/staff/game', gameRoutes);
router.use('/staff/reports', reportsRoutes.staffRouter);

module.exports = router;
