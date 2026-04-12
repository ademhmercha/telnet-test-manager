class DeleteSlotUseCase {
  constructor(slotRepository, auditLogRepository) {
    this._slotRepo     = slotRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute(id, auditContext) {
    const deleted = await this._slotRepo.deleteById(id);
    if (!deleted) {
      const err = new Error('Slot non trouvé');
      err.statusCode = 404;
      throw err;
    }
    await this._auditLogRepo.create({ ...auditContext, action: 'DELETE_SLOT', details: { slotId: id } });
    return { message: 'Slot supprimé' };
  }
}
module.exports = DeleteSlotUseCase;
