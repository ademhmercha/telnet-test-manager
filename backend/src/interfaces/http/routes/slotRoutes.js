const { Router } = require('express');

function createSlotRouter(slotController, authenticate, requirePermission, requireRole, auditLog) {
  const router = Router();
  router.get('/',    authenticate, requirePermission('read'),  auditLog('VIEW_SLOTS'), (req, res) => slotController.getAll(req, res));
  router.post('/',   authenticate, requirePermission('write'),                         (req, res) => slotController.create(req, res));
  router.put('/:id', authenticate, requirePermission('write'),                         (req, res) => slotController.update(req, res));
  router.delete('/:id', authenticate, requirePermission('delete'),                     (req, res) => slotController.delete(req, res));
  return router;
}

module.exports = { createSlotRouter };
