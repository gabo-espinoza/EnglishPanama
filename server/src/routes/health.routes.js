const express = require('express');
const pool = require('../config/db');

const router = express.Router();

// GET /api/health — confirma que el server está arriba y que llega a la base.
router.get('/', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', db: 'connected' });
    } catch (err) {
        res.status(500).json({ status: 'error', db: 'unreachable', message: err.message });
    }
});

module.exports = router;
