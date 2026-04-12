class CreateTelnetCommandUseCase {
  constructor(telnetCommandRepository, auditLogRepository) {
    this._repo         = telnetCommandRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute({ id, name, type, command, description, expectedResponse, expectedEvents }, auditContext) {
    if (!id || !name || !type || !command) {
      const err = new Error('Champs requis: id, name, type, command');
      err.statusCode = 400;
      throw err;
    }
    const existing = await this._repo.findById(id);
    if (existing) {
      const err = new Error(`Une commande avec l'id "${id}" existe déjà`);
      err.statusCode = 409;
      throw err;
    }
    const newCmd = { id, name, type, command, description: description || '' };
    if (expectedResponse) newCmd.expectedResponse = expectedResponse;
    if (Array.isArray(expectedEvents) && expectedEvents.length > 0) newCmd.expectedEvents = expectedEvents;

    await this._repo.create(newCmd);
    await this._auditLogRepo.create({ ...auditContext, action: 'CREATE_TELNET_COMMAND', details: { commandId: id } });
    return { message: 'Commande ajoutée', command: newCmd };
  }
}
module.exports = CreateTelnetCommandUseCase;
