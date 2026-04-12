class DeleteTelnetCommandUseCase {
  constructor(telnetCommandRepository, auditLogRepository) {
    this._repo         = telnetCommandRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute(id, auditContext) {
    const deleted = await this._repo.deleteById(id);
    if (!deleted) {
      const err = new Error(`Commande "${id}" introuvable`);
      err.statusCode = 404;
      throw err;
    }
    await this._auditLogRepo.create({ ...auditContext, action: 'DELETE_TELNET_COMMAND', details: { commandId: id } });
    return { message: 'Commande supprimée' };
  }
}
module.exports = DeleteTelnetCommandUseCase;
