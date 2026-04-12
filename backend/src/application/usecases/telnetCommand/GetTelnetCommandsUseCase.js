class GetTelnetCommandsUseCase {
  constructor(telnetCommandRepository) { this._repo = telnetCommandRepository; }
  async execute() {
    const commands = await this._repo.findAll();
    return { message: 'Commandes Telnet disponibles', commands };
  }
}
module.exports = GetTelnetCommandsUseCase;
