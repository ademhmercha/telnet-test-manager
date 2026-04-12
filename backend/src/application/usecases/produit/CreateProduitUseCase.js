class CreateProduitUseCase {
  constructor(produitRepository, auditLogRepository) {
    this._produitRepo  = produitRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute({ nom, posteId, description }, auditContext) {
    if (!nom || !posteId) {
      const err = new Error('nom et posteId sont requis');
      err.statusCode = 400;
      throw err;
    }
    const lastId  = await this._produitRepo.findLastId();
    const newId   = lastId + 1;
    const produit = await this._produitRepo.create({
      id: newId, nom, posteId: parseInt(posteId), description: description || ''
    });
    await this._auditLogRepo.create({ ...auditContext, action: 'CREATE_PRODUIT', details: { produitId: newId } });
    return { message: 'Produit créé', produit };
  }
}
module.exports = CreateProduitUseCase;
