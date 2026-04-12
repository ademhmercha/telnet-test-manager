const { buildAuditContext } = require('../middlewares/auditLog');

class ProduitController {
  constructor(getProduitsUseCase, createProduitUseCase, updateProduitUseCase, deleteProduitUseCase) {
    this._getUseCase    = getProduitsUseCase;
    this._createUseCase = createProduitUseCase;
    this._updateUseCase = updateProduitUseCase;
    this._deleteUseCase = deleteProduitUseCase;
  }

  async getAll(req, res) {
    try { res.json(await this._getUseCase.execute(req.query.posteId)); }
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

module.exports = ProduitController;
