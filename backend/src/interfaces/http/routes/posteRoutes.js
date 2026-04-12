const { Router } = require('express');

function createPosteRouter(posteController, authenticate, requirePermission, requireRole, auditLog) {
  const router = Router();
  router.get('/',    authenticate, requirePermission('read'),  auditLog('VIEW_POSTES'), (req, res) => posteController.getAll(req, res));
  router.post('/',   authenticate, requirePermission('write'),                          (req, res) => posteController.create(req, res));
  router.put('/:id', authenticate, requirePermission('write'),                          (req, res) => posteController.update(req, res));
  router.delete('/:id', authenticate, requireRole('admin'),                             (req, res) => posteController.delete(req, res));
  return router;
}

module.exports = { createPosteRouter };
