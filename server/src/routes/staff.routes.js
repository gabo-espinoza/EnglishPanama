const express = require('express');
const { requireStaff } = require('../middleware/staffAuth');
const { authLimiter } = require('../middleware/rateLimiter');
const staffAuthController = require('../controllers/staffAuth.controller');
const staffAccountsController = require('../controllers/staffAccounts.controller');
const staffAuditController = require('../controllers/staffAudit.controller');

const router = express.Router();

// --- Autenticacion de personal (publico) ---
router.post('/auth/login', authLimiter, staffAuthController.login);

// --- Cualquier gestor autenticado ---
router.get('/me', requireStaff(), staffAuthController.me);

// --- Gestor de usuarios y accesos + Auditor ---
router.get('/accounts', requireStaff({ roles: ['access_manager', 'auditor'] }), staffAccountsController.listAccounts);

// --- Gestor de usuarios y accesos ---
router.post('/change-requests', requireStaff({ area: 'access', roles: ['access_manager'] }), staffAccountsController.createChangeRequest);
router.post('/teachers', requireStaff({ area: 'access', roles: ['access_manager'] }), staffAccountsController.createTeacher);

// --- Solicitudes de cambio (ver: accesos + auditor; decidir: solo auditor) ---
router.get('/change-requests', requireStaff({ roles: ['access_manager', 'auditor'] }), staffAccountsController.listChangeRequests);
router.post('/change-requests/:id/decision', requireStaff({ area: 'audit', roles: ['auditor'] }), staffAccountsController.decideChangeRequest);

// --- Datos y reportes (solo analista): metricas de solo lectura, sin tocar cuentas ---
router.get('/analytics/dashboard', requireStaff({ area: 'analytics', roles: ['analyst'] }), staffAccountsController.analytics);

// --- Auditoria (solo auditor) ---
router.get('/audit', requireStaff({ area: 'audit', roles: ['auditor'] }), staffAuditController.listAudit);
router.get('/audit/verify', requireStaff({ area: 'audit', roles: ['auditor'] }), staffAuditController.verifyAudit);

module.exports = router;
