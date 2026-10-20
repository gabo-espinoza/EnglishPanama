const express = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuth, requireAuthOrEnroll, requirePasswordToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// El limite estricto de auth frena la fuerza bruta sobre las contrasenas y sobre
// los codigos TOTP (6 digitos tambien son adivinables por fuerza bruta).
// Las cuentas de docente NO se crean por registro: las crea el gestor de accesos
// (POST /api/staff/teachers). Se deja la ruta con una respuesta clara en lugar de un 404 generico.
router.post('/register/teacher', (req, res) => {
    res.status(403).json({
        error: 'El registro de docentes esta deshabilitado: las cuentas de docente las crea el gestor de accesos.'
    });
});
router.post('/register/student', authLimiter, authController.registerStudent);

// Inicio de sesion en dos pasos. El primero valida usuario y contrasena; si la
// cuenta tiene MFA, NO devuelve sesion, solo un reto corto. El segundo valida el
// codigo TOTP y recien ahi entrega el JWT.
router.post('/login', authLimiter, authController.login);
router.post('/login/mfa', authLimiter, authController.loginMfa);

// Cambio de contrasena propio: exige sesion normal y la contrasena actual.
router.post('/change-password', authLimiter, requireAuth, authController.changePassword);

// Contrasena inicial del docente creado por el gestor de accesos: solo acepta el token
// restringido "pwd_change" que devuelve el login mientras must_change_password sea 1.
router.post('/set-initial-password', authLimiter, requirePasswordToken, authController.setInitialPassword);

// Vinculacion del autenticador: generar secreto + QR y confirmar con un codigo antes
// de que el MFA quede activo. Acepta la sesion normal (MFA opcional) o el token de
// vinculacion que reciben los docentes en su primer inicio de sesion (MFA obligatorio).
router.post('/mfa/setup', authLimiter, requireAuthOrEnroll, authController.setupMfa);
router.post('/mfa/confirm', authLimiter, requireAuthOrEnroll, authController.confirmMfa);

module.exports = router;
