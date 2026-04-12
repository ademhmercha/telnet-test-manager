const { Router } = require('express');

function createAdminRouter(adminController, authenticate, requirePermission, requireRole) {
  const router = Router();

  router.get('/audit-logs',           authenticate, requireRole('admin'), requirePermission('audit'),        (req, res) => adminController.getAuditLogs(req, res));
  router.get('/users',                authenticate, requireRole('admin'), requirePermission('manage_users'), (req, res) => adminController.getUsers(req, res));
  router.post('/users',               authenticate, requireRole('admin'), requirePermission('manage_users'), (req, res) => adminController.createUser(req, res));
  router.put('/users/:id',            authenticate, requireRole('admin'), requirePermission('manage_users'), (req, res) => adminController.updateUser(req, res));
  router.post('/users/:id/reset-password', authenticate, requireRole('admin'), requirePermission('manage_users'), (req, res) => adminController.resetPassword(req, res));
  router.delete('/users/:id',         authenticate, requireRole('admin'), requirePermission('manage_users'), (req, res) => adminController.deleteUser(req, res));
  router.get('/stats',                authenticate, requireRole('admin'), requirePermission('audit'),        (req, res) => adminController.getStats(req, res));
  router.get('/tests',                authenticate, requireRole('admin'),                                    (req, res) => adminController.getTests(req, res));
  router.post('/tests/:id/stop',      authenticate, requireRole('admin'),                                    (req, res) => adminController.stopTest(req, res));
  router.delete('/tests/:id',         authenticate, requireRole('admin'),                                    (req, res) => adminController.deleteTest(req, res));
  router.delete('/tests',             authenticate, requireRole('admin'),                                    (req, res) => adminController.bulkDeleteTests(req, res));
  router.get('/analytics',            authenticate, requireRole('admin'),                                    (req, res) => adminController.getAnalytics(req, res));
  router.get('/system-logs',          authenticate, requireRole('admin'), requirePermission('view_logs'),    (req, res) => adminController.getSystemLogs(req, res));

  return router;
}

module.exports = { createAdminRouter };
