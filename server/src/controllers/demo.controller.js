const demoService = require('../services/demo.service');
const AppError = require('../utils/AppError');

// POST /api/demo/advance-day
// Solo funciona si DEMO_MODE=true en el servidor. Asi, aunque el endpoint
// exista en produccion, queda inerte por defecto.
async function advanceDay(req, res, next) {
    try {
        if (process.env.DEMO_MODE !== 'true') {
            throw new AppError('El modo demo esta desactivado.', 403);
        }
        const result = await demoService.advanceDay();
        res.json(result);
    } catch (err) {
        next(err);
    }
}

module.exports = { advanceDay };
