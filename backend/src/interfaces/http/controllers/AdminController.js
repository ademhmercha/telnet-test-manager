const { buildAuditContext } = require('../middlewares/auditLog');

class AdminController {
  constructor({
    getAuditLogsUseCase,
    getUsersUseCase,
    createUserUseCase,
    updateUserUseCase,
    resetPasswordUseCase,
    deleteUserUseCase,
    getStatsUseCase,
    getAdminTestsUseCase,
    adminStopTestUseCase,
    adminDeleteTestUseCase,
    adminBulkDeleteTestsUseCase,
    getAnalyticsUseCase,
    getSystemLogsUseCase
  }) {
    this._getAuditLogsUseCase        = getAuditLogsUseCase;
    this._getUsersUseCase            = getUsersUseCase;
    this._createUserUseCase          = createUserUseCase;
    this._updateUserUseCase          = updateUserUseCase;
    this._resetPasswordUseCase       = resetPasswordUseCase;
    this._deleteUserUseCase          = deleteUserUseCase;
    this._getStatsUseCase            = getStatsUseCase;
    this._getAdminTestsUseCase       = getAdminTestsUseCase;
    this._adminStopTestUseCase       = adminStopTestUseCase;
    this._adminDeleteTestUseCase     = adminDeleteTestUseCase;
    this._adminBulkDeleteTestsUseCase = adminBulkDeleteTestsUseCase;
    this._getAnalyticsUseCase        = getAnalyticsUseCase;
    this._getSystemLogsUseCase       = getSystemLogsUseCase;
  }

  async getAuditLogs(req, res) {
    try { res.json(await this._getAuditLogsUseCase.execute(req.query)); }
    catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
  }

  async getUsers(req, res) {
    try { res.json(await this._getUsersUseCase.execute()); }
    catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
  }

  async createUser(req, res) {
    try {
      const result = await this._createUserUseCase.execute(req.body, buildAuditContext(req));
      res.status(201).json(result);
    } catch (e) {
      console.error(e);
      res.status(e.statusCode || 500).json({ error: e.message });
    }
  }

  async updateUser(req, res) {
    try {
      const result = await this._updateUserUseCase.execute(parseInt(req.params.id), req.body, req.user.id, buildAuditContext(req));
      res.json(result);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }

  async resetPassword(req, res) {
    try {
      const result = await this._resetPasswordUseCase.execute(parseInt(req.params.id), req.body.newPassword, buildAuditContext(req));
      res.json(result);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }

  async deleteUser(req, res) {
    try {
      const result = await this._deleteUserUseCase.execute(parseInt(req.params.id), req.user.id, buildAuditContext(req));
      res.json(result);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }

  async getStats(req, res) {
    try { res.json(await this._getStatsUseCase.execute()); }
    catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
  }

  async getTests(req, res) {
    try { res.json(await this._getAdminTestsUseCase.execute(req.query)); }
    catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
  }

  async stopTest(req, res) {
    try {
      const result = await this._adminStopTestUseCase.execute(req.params.id, req.user.username, buildAuditContext(req));
      res.json(result);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }

  async deleteTest(req, res) {
    try {
      const result = await this._adminDeleteTestUseCase.execute(req.params.id, buildAuditContext(req));
      res.json(result);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }

  async bulkDeleteTests(req, res) {
    try {
      const result = await this._adminBulkDeleteTestsUseCase.execute(req.body, buildAuditContext(req));
      res.json(result);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }

  async getAnalytics(req, res) {
    try { res.json(await this._getAnalyticsUseCase.execute(req.query.period)); }
    catch (e) {
      console.error('Analytics error:', e);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  async getSystemLogs(req, res) {
    try { res.json(await this._getSystemLogsUseCase.execute()); }
    catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
  }
}

module.exports = AdminController;
