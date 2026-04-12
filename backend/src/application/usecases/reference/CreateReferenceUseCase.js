class CreateReferenceUseCase {
  constructor(referenceRepository, auditLogRepository) {
    this._referenceRepo = referenceRepository;
    this._auditLogRepo  = auditLogRepository;
  }

  async execute({ nom, produitId, description, version, statut }, auditContext) {
    if (!nom || !produitId) {
      const err = new Error('nom et produitId sont requis');
      err.statusCode = 400;
      throw err;
    }
    const lastId = await this._referenceRepo.findLastId();
    const newId  = lastId + 1;
    const ref    = await this._referenceRepo.create({
      id: newId, nom, produitId: parseInt(produitId),
      description: description || '', version: version || '',
      statut: statut || 'actif'
    });
    await this._auditLogRepo.create({ ...auditContext, action: 'CREATE_REFERENCE', details: { referenceId: newId } });
    return { message: 'Référence créée', reference: ref };
  }
}
module.exports = CreateReferenceUseCase;
