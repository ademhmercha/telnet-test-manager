const { Router } = require('express');

function createReferenceRouter(referenceController, authenticate, requirePermission, requireRole, auditLog) {
  const router = Router();
  router.get('/',    authenticate, requirePermission('read'),  auditLog('VIEW_REFERENCES'), (req, res) => referenceController.getAll(req, res));
  router.post('/',   authenticate, requirePermission('write'),                              (req, res) => referenceController.create(req, res));
  router.put('/:id', authenticate, requirePermission('write'),                              (req, res) => referenceController.update(req, res));
  router.delete('/:id', authenticate, requireRole('admin'),                                 (req, res) => referenceController.delete(req, res));
  return router;
}

module.exports = { createReferenceRouter };
