class UpdateSlotUseCase {
  constructor(slotRepository, auditLogRepository) {
    this._slotRepo     = slotRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute(id, { nom, produitId, adresse, port, description }, auditContext) {
    const update = {};
    if (nom         !== undefined) update.nom         = nom;
    if (produitId   !== undefined) update.produitId   = parseInt(produitId);
    if (adresse     !== undefined) update.adresse     = adresse;
    if (port        !== undefined) update.port        = parseInt(port);
    if (description !== undefined) update.description = description;

    const updated = await this._slotRepo.updateById(id, update);
    if (!updated) {
      const err = new Error('Slot non trouvé');
      err.statusCode = 404;
      throw err;
    }
    await this._auditLogRepo.create({ ...auditContext, action: 'UPDATE_SLOT', details: { slotId: id } });
    const { _id, __v, ...s } = updated;
    return { message: 'Slot mis à jour', slot: s };
  }
}
module.exports = UpdateSlotUseCase;
