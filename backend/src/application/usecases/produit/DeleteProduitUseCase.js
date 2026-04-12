class DeleteProduitUseCase {
  constructor(produitRepository, auditLogRepository) {
    this._produitRepo  = produitRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute(id, auditContext) {
    const deleted = await this._produitRepo.deleteById(id);
    if (!deleted) {
      const err = new Error('Produit non trouvé');
      err.statusCode = 404;
      throw err;
    }
    await this._auditLogRepo.create({ ...auditContext, action: 'DELETE_PRODUIT', details: { produitId: id } });
    return { message: 'Produit supprimé' };
  }
}
module.exports = DeleteProduitUseCase;
