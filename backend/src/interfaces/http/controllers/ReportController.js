class ReportController {
  constructor(getReportsUseCase, generateReportUseCase, getReportUseCase, deleteReportUseCase) {
    this._getReportsUseCase   = getReportsUseCase;
    this._generateUseCase     = generateReportUseCase;
    this._getReportUseCase    = getReportUseCase;
    this._deleteReportUseCase = deleteReportUseCase;
  }

  async getAll(req, res) {
    try { res.json(await this._getReportsUseCase.execute()); }
    catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
  }

  async generate(req, res) {
    try {
      const result = await this._generateUseCase.execute(req.body, req.user.username);
      res.json(result);
    } catch (e) {
      console.error('Erreur génération rapport:', e);
      res.status(e.statusCode || 500).json({ message: e.message });
    }
  }

  async getOne(req, res) {
    try { res.json(await this._getReportUseCase.execute(req.params.id)); }
    catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }

  async delete(req, res) {
    try { res.json(await this._deleteReportUseCase.execute(req.params.id)); }
    catch (e) { res.status(e.statusCode || 500).json({ message: e.message }); }
  }
}

module.exports = ReportController;
