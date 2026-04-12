class UpdateProduitUseCase {
  constructor(produitRepository, auditLogRepository) {
    this._produitRepo  = produitRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute(id, { nom, posteId, description }, auditContext) {
    const update = {};
    if (nom         !== undefined) update.nom     = nom;
    if (posteId     !== undefined) update.posteId = parseInt(posteId);
    if (description !== undefined) update.description = description;

    const updated = await this._produitRepo.updateById(id, update);
    if (!updated) {
      const err = new Error('Produit non trouvé');
      err.statusCode = 404;
      throw err;
    }
    await this._auditLogRepo.create({ ...auditContext, action: 'UPDATE_PRODUIT', details: { produitId: id } });
    const { _id, __v, ...p } = updated;
    return { message: 'Produit mis à jour', produit: p };
  }
}
module.exports = UpdateProduitUseCase;
