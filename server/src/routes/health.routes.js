const express = require('express');
const pool = require('../config/db');

const router = express.Router();

// GET /api/health - confirma que el server esta arriba y que llega a la base.
router.get('/', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', db: 'connected' });
    } catch (err) {
        // El detalle queda en el log interno: un 500 nunca expone la traza (docs/api.md).
        console.error('[health] base de datos no disponible:', err.message);
        res.status(500).json({ status: 'error', db: 'unreachable' });
    }
});

module.exports = router;
