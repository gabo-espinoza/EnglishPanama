const activityService = require('../services/activity.service');

async function listByModule(req, res, next) {
    try {
        const activities = await activityService.listActivitiesByModule(req.params.moduleSlug);
        res.json(activities);
    } catch (err) {
        next(err);
    }
}

async function getQuestions(req, res, next) {
    try {
        const activity = await activityService.getActivityQuestions(Number(req.params.id));
        res.json(activity);
    } catch (err) {
        next(err);
    }
}

async function submitAttempt(req, res, next) {
    try {
        const result = await activityService.submitAttempt(
            req.user.id,
            Number(req.params.id),
            req.body.answers
        );
        res.status(201).json(result);
    } catch (err) {
        next(err);
    }
}

module.exports = { listByModule, getQuestions, submitAttempt };
