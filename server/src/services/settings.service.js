const pool = require('../config/db');

// Clave en app_settings que usa el modo demo para desplazar el "dia" del reto diario.
const DEMO_OFFSET_KEY = 'demo_day_offset';

async function getSetting(key, fallback = null) {
    const [rows] = await pool.query(
        'SELECT setting_value FROM app_settings WHERE setting_key = ?',
        [key]
    );
    return rows.length === 0 ? fallback : rows[0].setting_value;
}

async function setSetting(key, value) {
    await pool.query(
        'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ' +
        'ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
        [key, String(value)]
    );
}

async function getDemoDayOffset() {
    const value = await getSetting(DEMO_OFFSET_KEY, '0');
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
}

// Incremento atomico: un solo UPDATE, sin leer y volver a escribir. Dos llamadas
// concurrentes a POST /api/demo/advance-day ya no pueden perder un incremento.
async function incrementSetting(key) {
    const [result] = await pool.query(
        'UPDATE app_settings SET setting_value = CAST(setting_value AS UNSIGNED) + 1 WHERE setting_key = ?',
        [key]
    );
    if (result.affectedRows === 0) {
        await setSetting(key, 1);
        return 1;
    }
    const parsed = parseInt(await getSetting(key, '1'), 10);
    return Number.isNaN(parsed) ? 1 : parsed;
}

module.exports = { getSetting, setSetting, getDemoDayOffset, incrementSetting, DEMO_OFFSET_KEY };
