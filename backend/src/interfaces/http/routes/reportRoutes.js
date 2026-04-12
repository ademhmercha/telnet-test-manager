const { Router } = require('express');

function createReportRouter(reportController, authenticate, requirePermission) {
  const router = Router();
  router.get('/',           authenticate, requirePermission('read'),      (req, res) => reportController.getAll(req, res));
  router.post('/generate',  authenticate, requirePermission('run_tests'), (req, res) => reportController.generate(req, res));
  router.get('/:id',        authenticate, requirePermission('read'),      (req, res) => reportController.getOne(req, res));
  router.delete('/:id',     authenticate, requirePermission('run_tests'), (req, res) => reportController.delete(req, res));
  return router;
}

module.exports = { createReportRouter };
