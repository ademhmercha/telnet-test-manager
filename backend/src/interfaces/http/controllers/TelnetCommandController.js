const { buildAuditContext } = require('../middlewares/auditLog');

class TelnetCommandController {
  constructor(getUseCase, createUseCase, updateUseCase, deleteUseCase) {
    this._getUseCase    = getUseCase;
    this._createUseCase = createUseCase;
    this._updateUseCase = updateUseCase;
    this._deleteUseCase = deleteUseCase;
  }

  async getAll(req, res) {
    try { res.json(await this._getUseCase.execute()); }
    catch (e) {
      console.error('Erreur lecture commandes:', e);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }

  async create(req, res) {
    try {
      const result = await this._createUseCase.execute(req.body, buildAuditContext(req));
      res.status(201).json(result);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }

  async update(req, res) {
    try {
      const result = await this._updateUseCase.execute(req.params.id, req.body, buildAuditContext(req));
      res.json(result);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
  }

  async delete(req, res) {
    try {
      const result = await this._deleteUseCase.execute(req.params.id, buildAuditContext(req));
      res.json(result);
    } catch (e) {
      console.error('Erreur suppression commande:', e);
      res.status(e.statusCode || 500).json({ error: e.message });
    }
  }
}

module.exports = TelnetCommandController;
