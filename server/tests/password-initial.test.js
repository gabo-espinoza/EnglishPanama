// Pruebas del cambio obligatorio de contrasena en el primer inicio de sesion de un docente
// recien creado por el gestor de accesos.
//
// Se omiten solas si no hay MySQL, JWT_SECRET o STAFF_MFA_KEY.
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');

require('dotenv').config();

const app = require('../src/app');
const pool = require('../src/config/db');
const staffAccounts = require('../src/services/staffAccounts.service');
const { closeAuditPool } = require('../src/config/auditDb');

let server;
let ready = false;

const suffix = String(Date.now()).slice(-7);
const userIds = [];

test.before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));

    if (!process.env.JWT_SECRET || !process.env.STAFF_MFA_KEY) return;
    try { await pool.query('SELECT 1'); } catch { return; }
    ready = true;
});

test.after(async () => {
    if (ready && userIds.length) {
        await pool.query('DELETE FROM students WHERE user_id IN (?)', [userIds]);
        await pool.query('DELETE FROM teachers WHERE user_id IN (?)', [userIds]);
        await pool.query('DELETE FROM users WHERE id IN (?)', [userIds]);
    }
    server.close();
    try { await pool.end(); } catch { /* sin conexiones */ }
    try { await closeAuditPool(); } catch { /* sin conexiones */ }
});

test('createTeacher deja must_change_password en 1', async (t) => {
    if (!ready) { t.skip('sin MySQL o claves'); return; }
    const created = await staffAccounts.createTeacher({
        username: `prof.ini.${suffix}`, displayName: 'Docente Nuevo', actorId: 1
    });
    userIds.push(created.id);
    const [rows] = await pool.query('SELECT must_change_password FROM users WHERE id = ?', [created.id]);
    assert.strictEqual(Number(rows[0].must_change_password), 1);

    // Un usuario insertado sin la columna queda en 0 (compatibilidad con cuentas existentes).
    const hash = await bcrypt.hash('ClaveCualquiera-1', 4);
    const [plain] = await pool.query(
        "INSERT INTO users (role, username, password_hash) VALUES ('student', ?, ?)",
        [`estu.ini.${suffix}`, hash]
    );
    userIds.push(plain.insertId);
    const [plainRows] = await pool.query('SELECT must_change_password FROM users WHERE id = ?', [plain.insertId]);
    assert.strictEqual(Number(plainRows[0].must_change_password), 0);
});
