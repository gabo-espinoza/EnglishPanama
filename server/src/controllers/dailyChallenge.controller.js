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
        const result = await dailyChallengeService.completeDailyChallenge(req.user.id, req.body?.answer);
        // Respuesta incorrecta: 200 sin nada escrito. Correcta: 201 con el XP otorgado.
        res.status(result.correct ? 201 : 200).json(result);
    } catch (err) {
        next(err);
    }
}

module.exports = { getToday, complete };
