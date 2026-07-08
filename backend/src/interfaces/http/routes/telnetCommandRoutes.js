const { Router } = require('express');

function createTelnetCommandRouter(telnetCommandController, authenticate, requirePermission, requireRole) {
  const router = Router();
  router.get('/',    authenticate,                           (req, res) => telnetCommandController.getAll(req, res));
  router.post('/',   authenticate, requirePermission('write'), (req, res) => telnetCommandController.create(req, res));
  router.put('/:id', authenticate, requirePermission('write'), (req, res) => telnetCommandController.update(req, res));
  router.delete('/:id', authenticate, requirePermission('delete'),   (req, res) => telnetCommandController.delete(req, res));
  return router;
}

module.exports = { createTelnetCommandRouter };
