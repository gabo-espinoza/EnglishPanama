// Fase C: modulo 7 (gestion del juego y ranking).
const game = require('../services/game.service');

function wrap(fn, status = 200) {
    return async (req, res, next) => {
        try { res.status(status).json(await fn(req)); } catch (err) { next(err); }
    };
}

const getRules = wrap(() => game.getRules());
const updateRules = wrap((req) => game.updateRules(req.staff, req.body));
const listAliases = wrap(() => game.listAliases());
const setAliasHidden = wrap((req) => game.setAliasHidden(
    req.staff, req.params.studentId, (req.body || {}).hidden
));
const listDailyChallenges = wrap(() => game.listDailyChallenges());
const addDailyChallenge = wrap((req) => game.addDailyChallenge(req.staff, req.body), 201);
const removeDailyChallenge = wrap((req) => game.removeDailyChallenge(req.staff, req.params.id));

module.exports = {
    getRules, updateRules, listAliases, setAliasHidden,
    listDailyChallenges, addDailyChallenge, removeDailyChallenge
};
