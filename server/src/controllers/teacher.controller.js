const teacherService = require('../services/teacher.service');

async function getStudents(req, res, next) {
    try {
        const students = await teacherService.getStudents(req.user.id);
        res.json(students);
    } catch (err) {
        next(err);
    }
}

async function getDifficultTopics(req, res, next) {
    try {
        const topics = await teacherService.getDifficultTopics(req.user.id, req.query.limit);
        res.json(topics);
    } catch (err) {
        next(err);
    }
}

async function getClass(req, res, next) {
    try {
        const info = await teacherService.getClass(req.user.id);
        res.json(info);
    } catch (err) {
        next(err);
    }
}

async function declareGrade(req, res, next) {
    try {
        const info = await teacherService.declareGrade(req.user.id, req.body || {});
        res.json(info);
    } catch (err) {
        next(err);
    }
}

module.exports = { getStudents, getDifficultTopics, getClass, declareGrade };
