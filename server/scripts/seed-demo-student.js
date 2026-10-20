#!/usr/bin/env node
// Crea las cuentas ficticias de plataforma para demostrar el segundo factor (MFA).
//
//   node scripts/seed-demo-student.js
//
// Crea (de forma idempotente) un docente de demostracion con su codigo de clase y la
// cuenta `estudiante01` asociada, SIN correo electronico. El MFA NO queda activado:
// se vincula desde la propia API (POST /api/auth/mfa/setup y /api/auth/mfa/confirm)
// para poder demostrar el flujo completo de vinculacion.
//
// Solo para desarrollo/demostracion: se niega a correr con NODE_ENV=production.
// Requiere que schema.sql ya este cargado (el script no modifica el esquema).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt = require('bcrypt');
const pool = require('../src/config/db');

const TEACHER_USERNAME = 'profe.demo';
const STUDENT_USERNAME = 'estudiante01';
const TEACHER_DISPLAY_NAME = 'Docente de demostracion';
const MIN_PASSWORD = 8;
const CLASS_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I

function generateClassCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += CLASS_CODE_CHARS[Math.floor(Math.random() * CLASS_CODE_CHARS.length)];
    }
    return code;
}

function assertSafeToRun() {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Este script es de demostracion y no corre con NODE_ENV=production.');
    }
    // Se admite DEMO_STUDENT_PASSWORD propia; si no, reutiliza la contrasena de demo
    // ya definida para el personal (DEMO_STAFF_PASSWORD) y no obliga a inventar otra.
    const password = process.env.DEMO_STUDENT_PASSWORD || process.env.DEMO_STAFF_PASSWORD;
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
        throw new Error(`Define DEMO_STUDENT_PASSWORD (o DEMO_STAFF_PASSWORD) en el .env, minimo ${MIN_PASSWORD} caracteres.`);
    }
    return password;
}

async function ensureTeacher(passwordHash) {
    const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', [TEACHER_USERNAME]);
    if (rows.length > 0) {
        const [t] = await pool.query('SELECT class_code FROM teachers WHERE user_id = ?', [rows[0].id]);
        return { userId: rows[0].id, classCode: t[0] ? t[0].class_code : null, created: false };
    }

    const [res] = await pool.query(
        "INSERT INTO users (role, username, password_hash) VALUES ('teacher', ?, ?)",
        [TEACHER_USERNAME, passwordHash]
    );
    let classCode;
    for (let attempt = 0; attempt < 5; attempt++) {
        classCode = generateClassCode();
        try {
            await pool.query(
                'INSERT INTO teachers (user_id, display_name, class_code) VALUES (?, ?, ?)',
                [res.insertId, TEACHER_DISPLAY_NAME, classCode]
            );
            break;
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY' && attempt < 4) continue;
            throw err;
        }
    }
    return { userId: res.insertId, classCode, created: true };
}

async function ensureStudent(passwordHash, teacherId) {
    const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', [STUDENT_USERNAME]);
    if (rows.length > 0) return { userId: rows[0].id, created: false };

    const [res] = await pool.query(
        "INSERT INTO users (role, username, password_hash) VALUES ('student', ?, ?)",
        [STUDENT_USERNAME, passwordHash]
    );
    await pool.query('INSERT INTO students (user_id, teacher_id) VALUES (?, ?)', [res.insertId, teacherId]);
    return { userId: res.insertId, created: true };
}

async function main() {
    let password;
    try { password = assertSafeToRun(); } catch (e) { console.error(e.message); process.exitCode = 1; return; }

    const [exists] = await pool.query(
        "SHOW COLUMNS FROM users LIKE 'mfa_secret_enc'"
    );
    if (exists.length === 0) {
        throw new Error('Falta la migracion de MFA. Ejecuta database/migrations/phase2-platform-mfa.sql.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const teacher = await ensureTeacher(passwordHash);
    const student = await ensureStudent(passwordHash, teacher.userId);

    console.log(`Docente ${TEACHER_USERNAME}: ${teacher.created ? 'creado' : 'ya existia'} (codigo de clase ${teacher.classCode}).`);
    console.log(`Estudiante ${STUDENT_USERNAME}: ${student.created ? 'creado' : 'ya existia'}.`);
    console.log('El MFA queda DESACTIVADO. Vincula el autenticador asi:');
    console.log('  1. POST /api/auth/login con { username, password } -> devuelve el token de sesion.');
    console.log('  2. POST /api/auth/mfa/setup con ese token -> devuelve otpauthUri (escanealo).');
    console.log('  3. POST /api/auth/mfa/confirm con { totp } -> activa el MFA.');
    console.log('Desde ahi, el login devolvera mfaRequired y pedira el codigo de 6 digitos.');
}

main()
    .catch((err) => { console.error('Error:', err.message); process.exitCode = 1; })
    .finally(async () => { try { await pool.end(); } catch { /* sin conexiones */ } });
