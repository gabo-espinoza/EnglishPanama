const userService = require('../services/user.service');

async function getMe(req, res, next) {
    try {
        const profile = await userService.getProfile(req.user.id, req.user.role);
        res.json(profile);
    } catch (err) {
        next(err);
    }
}

async function updateMe(req, res, next) {
    try {
        const profile = await userService.updateProfile(req.user.id, req.user.role, req.body);
        res.json(profile);
    } catch (err) {
        next(err);
    }
}

module.exports = { getMe, updateMe };
