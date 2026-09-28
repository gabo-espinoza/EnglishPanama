const express = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// A medida que se arme cada feature, se suma acá:
// router.use('/activities', require('./activities.routes'));
// router.use('/ranking', require('./ranking.routes'));
// router.use('/teacher', require('./teacher.routes'));

module.exports = router;
