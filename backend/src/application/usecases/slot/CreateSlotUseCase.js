class CreateSlotUseCase {
  constructor(slotRepository, auditLogRepository) {
    this._slotRepo     = slotRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute({ nom, produitId, adresse, port, description }, auditContext) {
    if (!nom || !produitId || !adresse || !port) {
      const err = new Error('nom, produitId, adresse et port sont requis');
      err.statusCode = 400;
      throw err;
    }
    const lastId = await this._slotRepo.findLastId();
    const newId  = lastId + 1;
    const slot   = await this._slotRepo.create({
      id: newId, nom,
      produitId:   parseInt(produitId),
      adresse,
      port:        parseInt(port),
      description: description || ''
    });
    await this._auditLogRepo.create({ ...auditContext, action: 'CREATE_SLOT', details: { slotId: newId } });
    return { message: 'Slot créé', slot };
  }
}
module.exports = CreateSlotUseCase;
