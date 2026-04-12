const { buildAuditContext } = require('../middlewares/auditLog');

class TestController {
  constructor(runTestUseCase, stopTestUseCase, stopMonitoringUseCase, getTestResultsUseCase, getTestResultUseCase) {
    this._runUseCase            = runTestUseCase;
    this._stopUseCase           = stopTestUseCase;
    this._stopMonitoringUseCase = stopMonitoringUseCase;
    this._getResultsUseCase     = getTestResultsUseCase;
    this._getResultUseCase      = getTestResultUseCase;
  }

  async runTest(req, res) {
    try {
      const result = await this._runUseCase.execute(req.body, buildAuditContext(req));
      res.json(result);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }

  async stopTest(req, res) {
    try {
      const result = await this._stopUseCase.execute(req.body.testId, req.user.username, buildAuditContext(req));
      res.json(result);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }

  async stopMonitoring(req, res) {
    try {
      const result = await this._stopMonitoringUseCase.execute(req.body.testId, req.user.username);
      res.json(result);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }

  async getResults(req, res) {
    try { res.json(await this._getResultsUseCase.execute(req.query)); }
    catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
  }

  async getResult(req, res) {
    try { res.json(await this._getResultUseCase.execute(req.params.id)); }
    catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }
}

module.exports = TestController;
