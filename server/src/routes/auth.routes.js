const express = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuthOrEnroll } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// El limite estricto de auth frena la fuerza bruta sobre las contrasenas y sobre
// los codigos TOTP (6 digitos tambien son adivinables por fuerza bruta).
router.post('/register/teacher', authLimiter, authController.registerTeacher);
router.post('/register/student', authLimiter, authController.registerStudent);

// Inicio de sesion en dos pasos. El primero valida usuario y contrasena; si la
// cuenta tiene MFA, NO devuelve sesion, solo un reto corto. El segundo valida el
// codigo TOTP y recien ahi entrega el JWT.
router.post('/login', authLimiter, authController.login);
router.post('/login/mfa', authLimiter, authController.loginMfa);

// Vinculacion del autenticador: generar secreto + QR y confirmar con un codigo antes
// de que el MFA quede activo. Acepta la sesion normal (MFA opcional) o el token de
// vinculacion que reciben los docentes en su primer inicio de sesion (MFA obligatorio).
router.post('/mfa/setup', authLimiter, requireAuthOrEnroll, authController.setupMfa);
router.post('/mfa/confirm', authLimiter, requireAuthOrEnroll, authController.confirmMfa);

module.exports = router;
