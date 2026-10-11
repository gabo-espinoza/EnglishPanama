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

module.exports = { getStudents, getDifficultTopics };
