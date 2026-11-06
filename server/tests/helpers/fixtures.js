// Utilidades compartidas por las pruebas con base de datos (MySQL real).
// Crean cuentas con tokens firmados directamente (sin pasar por el login) y limpian al final.
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = require('../../src/app');
const pool = require('../../src/config/db');
const totp = require('../../src/utils/totp');
const mfaCrypto = require('../../src/utils/mfaCrypto');
const { areaForRole } = require('../../src/config/staffRoles');

const suffix = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 100)).padStart(2, '0');
let counter = 0;
const created = { users: [], staff: [], activities: [] };

async function start() {
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
    const env = process.env.JWT_SECRET && process.env.STAFF_JWT_SECRET && process.env.STAFF_MFA_KEY;
    let ready = false;
    if (env) {
        try { await pool.query('SELECT 1'); ready = true; } catch { ready = false; }
    }
    return { server, baseUrl, ready };
}

async function stop(server) {
    try {
        if (created.activities.length) await pool.query('DELETE FROM activities WHERE id IN (?)', [created.activities]);
        if (created.users.length) {
            await pool.query('DELETE FROM students WHERE user_id IN (?)', [created.users]);
            await pool.query('DELETE FROM teachers WHERE user_id IN (?)', [created.users]);
            await pool.query('DELETE FROM users WHERE id IN (?)', [created.users]);
        }
        if (created.staff.length) await pool.query('DELETE FROM staff_accounts WHERE id IN (?)', [created.staff]);
    } catch { /* limpieza de mejor esfuerzo */ }
    server.close();
    try { await pool.end(); } catch { /* sin conexiones */ }
    try { await require('../../src/config/auditDb').closeAuditPool(); } catch { /* sin conexiones */ }
}

async function createStaff(role) {
    counter += 1;
    const secret = totp.generateSecret();
    const username = `fx.${role.slice(0, 6)}.${suffix}${counter}`;
    const [res] = await pool.query(
        'INSERT INTO staff_accounts (username, password_hash, role, mfa_secret_enc) VALUES (?, ?, ?, ?)',
        [username, await bcrypt.hash('PruebaFixture123', 4), role, mfaCrypto.encrypt(secret)]
    );
    created.staff.push(res.insertId);
    const token = jwt.sign(
        { sub: res.insertId, typ: 'staff', role, aud: areaForRole(role), tv: 0 },
        process.env.STAFF_JWT_SECRET, { expiresIn: '10m' }
    );
    return { id: res.insertId, username, role, token, secret };
}

async function createTeacher({ mfaSecret = null } = {}) {
    counter += 1;
    const username = `fx.prof.${suffix}${counter}`;
    const [res] = await pool.query(
        "INSERT INTO users (role, username, password_hash, mfa_secret_enc) VALUES ('teacher', ?, ?, ?)",
        [username, await bcrypt.hash('PruebaFixture123', 4), mfaSecret ? mfaCrypto.encrypt(mfaSecret) : null]
    );
    await pool.query(
        'INSERT INTO teachers (user_id, display_name, class_code) VALUES (?, ?, ?)',
        [res.insertId, 'Docente Fixture', ('F' + suffix.slice(-4) + counter).slice(0, 10).toUpperCase()]
    );
    created.users.push(res.insertId);
    const token = jwt.sign({ id: res.insertId, role: 'teacher', tv: 0 }, process.env.JWT_SECRET, { expiresIn: '10m' });
    return { id: res.insertId, username, token, secret: mfaSecret };
}

async function createStudent(teacherId, { hidden = false, xp = 0 } = {}) {
    counter += 1;
    const username = `fx.est.${suffix}${counter}`;
    const [res] = await pool.query(
        "INSERT INTO users (role, username, password_hash) VALUES ('student', ?, ?)",
        [username, await bcrypt.hash('PruebaFixture123', 4)]
    );
    await pool.query(
        'INSERT INTO students (user_id, teacher_id, xp, alias_hidden) VALUES (?, ?, ?, ?)',
        [res.insertId, teacherId, xp, hidden ? 1 : 0]
    );
    created.users.push(res.insertId);
    const token = jwt.sign({ id: res.insertId, role: 'student', tv: 0 }, process.env.JWT_SECRET, { expiresIn: '10m' });
    return { id: res.insertId, username, token };
}

// Por defecto 'draft': una actividad publicada entraria en los listados y en el pool del reto
// diario que leen otras pruebas en paralelo.
async function createActivity({ status = 'draft', level = 'A1.1' } = {}) {
    counter += 1;
    // En una base recien creada el modulo aun no existe (otras pruebas lo siembran en paralelo).
    await pool.query("INSERT IGNORE INTO modules (slug, name) VALUES ('vocabulary', 'Vocabulary')");
    const [mods] = await pool.query("SELECT id FROM modules WHERE slug = 'vocabulary'");
    const [res] = await pool.query(
        "INSERT INTO activities (module_id, title, game_type, level, status) VALUES (?, ?, 'multiple_choice', ?, ?)",
        [mods[0].id, `Fixture ${suffix}${counter}`, level, status]
    );
    created.activities.push(res.insertId);
    return res.insertId;
}

function http(baseUrl, token, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
}

module.exports = {
    start, stop, createStaff, createTeacher, createStudent, createActivity, http, pool, suffix, created
};
