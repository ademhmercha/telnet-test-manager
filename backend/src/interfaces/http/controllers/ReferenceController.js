const { buildAuditContext } = require('../middlewares/auditLog');

class ReferenceController {
  constructor(getReferencesUseCase, createReferenceUseCase, updateReferenceUseCase, deleteReferenceUseCase) {
    this._getUseCase    = getReferencesUseCase;
    this._createUseCase = createReferenceUseCase;
    this._updateUseCase = updateReferenceUseCase;
    this._deleteUseCase = deleteReferenceUseCase;
  }

  async getAll(req, res) {
    try { res.json(await this._getUseCase.execute(req.query.produitId)); }
    catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
  }

  async create(req, res) {
    try {
      const result = await this._createUseCase.execute(req.body, buildAuditContext(req));
      res.status(201).json(result);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }

  async update(req, res) {
    try {
      const result = await this._updateUseCase.execute(parseInt(req.params.id), req.body, buildAuditContext(req));
      res.json(result);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }

  async delete(req, res) {
    try {
      const result = await this._deleteUseCase.execute(parseInt(req.params.id), buildAuditContext(req));
      res.json(result);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }
}

module.exports = ReferenceController;
