class UpdateTelnetCommandUseCase {
  constructor(telnetCommandRepository, auditLogRepository) {
    this._repo         = telnetCommandRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute(id, { name, type, command, description, expectedResponse, expectedEvents }, auditContext) {
    const existing = await this._repo.findById(id);
    if (!existing) {
      const err = new Error(`Commande "${id}" introuvable`);
      err.statusCode = 404;
      throw err;
    }
    const update = {};
    if (name             !== undefined) update.name             = name;
    if (type             !== undefined) update.type             = type;
    if (command          !== undefined) update.command          = command;
    if (description      !== undefined) update.description      = description;
    if (expectedResponse !== undefined) update.expectedResponse = expectedResponse || undefined;
    if (expectedEvents   !== undefined) update.expectedEvents   = expectedEvents?.length ? expectedEvents : undefined;

    const updated = await this._repo.updateById(id, update);
    await this._auditLogRepo.create({ ...auditContext, action: 'UPDATE_TELNET_COMMAND', details: { commandId: id } });
    const { _id, __v, ...cmd } = updated;
    return { message: 'Commande mise à jour', command: cmd };
  }
}
module.exports = UpdateTelnetCommandUseCase;
