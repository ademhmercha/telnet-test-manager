const { Router } = require('express');

function createTestRouter(testController, authenticate, requirePermission) {
  const router = Router();
  router.post('/run-test',        authenticate, requirePermission('run_tests'), (req, res) => testController.runTest(req, res));
  router.post('/stop-test',       authenticate, requirePermission('run_tests'), (req, res) => testController.stopTest(req, res));
  router.post('/stop-monitoring', authenticate, requirePermission('run_tests'), (req, res) => testController.stopMonitoring(req, res));
  router.get('/test-results',     authenticate,                                 (req, res) => testController.getResults(req, res));
  router.get('/test-results/:id', authenticate,                                 (req, res) => testController.getResult(req, res));
  return router;
}

module.exports = { createTestRouter };
