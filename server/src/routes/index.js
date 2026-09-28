const express = require('express');
const healthRoutes = require('./health.routes');

const router = express.Router();

router.use('/health', healthRoutes);

// A medida que se arme cada feature, se suma acá:
// router.use('/auth', require('./auth.routes'));
// router.use('/activities', require('./activities.routes'));
// router.use('/ranking', require('./ranking.routes'));
// router.use('/teacher', require('./teacher.routes'));

module.exports = router;
