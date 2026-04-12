class DeletePosteUseCase {
  constructor(posteRepository, auditLogRepository) {
    this._posteRepo    = posteRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute(id, auditContext) {
    const deleted = await this._posteRepo.deleteById(id);
    if (!deleted) {
      const err = new Error('Poste non trouvé');
      err.statusCode = 404;
      throw err;
    }
    await this._auditLogRepo.create({ ...auditContext, action: 'DELETE_POSTE', details: { posteId: id } });
    return { message: 'Poste supprimé' };
  }
}
module.exports = DeletePosteUseCase;
