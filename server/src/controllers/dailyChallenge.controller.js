const dailyChallengeService = require('../services/dailyChallenge.service');

async function getToday(req, res, next) {
    try {
        const challenge = await dailyChallengeService.getDailyChallenge(req.user.id);
        res.json(challenge);
    } catch (err) {
        next(err);
    }
}

async function complete(req, res, next) {
    try {
        const result = await dailyChallengeService.completeDailyChallenge(req.user.id);
        res.status(201).json(result);
    } catch (err) {
        next(err);
    }
}

module.exports = { getToday, complete };
