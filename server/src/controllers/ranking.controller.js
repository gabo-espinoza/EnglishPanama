const rankingService = require('../services/ranking.service');

async function getRanking(req, res, next) {
    try {
        const ranking = await rankingService.getClassRanking(req.user.id);
        res.json(ranking);
    } catch (err) {
        next(err);
    }
}

module.exports = { getRanking };
