// Fase B: /api/staff/content (modulo 6 del diseno §4.1/§5.3).
// area 'content' con separacion de funciones: el gestor escribe y envia,
// el revisor aprueba o rechaza. Nunca la misma cuenta.
const express = require('express');
const controller = require('../controllers/content.controller');
const { requireStaff } = require('../middleware/staffAuth');

const router = express.Router();

const lectura = requireStaff({ area: 'content', roles: ['content_manager', 'content_reviewer'] });
const gestor = requireStaff({ area: 'content', roles: ['content_manager'] });
const revisor = requireStaff({ area: 'content', roles: ['content_reviewer'] });

router.get('/activities', lectura, controller.list);
router.get('/activities/:id', lectura, controller.detail);

router.post('/activities', gestor, controller.create);
router.put('/activities/:id', gestor, controller.update);
router.post('/activities/:id/questions', gestor, controller.addQuestion);
router.put('/activities/:id/questions/:qid', gestor, controller.updateQuestion);
router.delete('/activities/:id/questions/:qid', gestor, controller.deleteQuestion);
router.delete('/activities/:id', gestor, controller.remove);
router.post('/activities/:id/submit', gestor, controller.submit);
router.post('/activities/:id/withdraw', gestor, controller.withdraw);
router.post('/activities/:id/revision', gestor, controller.revision);
router.post('/activities/:id/archive', gestor, controller.archive);

router.post('/activities/:id/approve', revisor, controller.approve);
router.post('/activities/:id/reject', revisor, controller.reject);

module.exports = router;
