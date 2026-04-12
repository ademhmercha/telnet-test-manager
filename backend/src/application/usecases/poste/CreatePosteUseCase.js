class CreatePosteUseCase {
  constructor(posteRepository, auditLogRepository) {
    this._posteRepo    = posteRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute({ nom, description, statut }, auditContext) {
    if (!nom) {
      const err = new Error('Le nom est requis');
      err.statusCode = 400;
      throw err;
    }
    const lastId = await this._posteRepo.findLastId();
    const newId  = lastId + 1;
    const poste  = await this._posteRepo.create({
      id: newId, nom,
      description: description || '',
      statut: statut || 'actif'
    });
    await this._auditLogRepo.create({ ...auditContext, action: 'CREATE_POSTE', details: { posteId: newId } });
    return { message: 'Poste créé', poste };
  }
}
module.exports = CreatePosteUseCase;
