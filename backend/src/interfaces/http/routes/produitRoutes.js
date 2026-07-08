const { Router } = require('express');

function createProduitRouter(produitController, authenticate, requirePermission, requireRole, auditLog) {
  const router = Router();
  router.get('/',    authenticate, requirePermission('read'),  auditLog('VIEW_PRODUITS'), (req, res) => produitController.getAll(req, res));
  router.post('/',   authenticate, requirePermission('write'),                            (req, res) => produitController.create(req, res));
  router.put('/:id', authenticate, requirePermission('write'),                            (req, res) => produitController.update(req, res));
  router.delete('/:id', authenticate, requirePermission('delete'),                        (req, res) => produitController.delete(req, res));
  return router;
}

module.exports = { createProduitRouter };
