class TelnetCommand {
  constructor({ id, name, type, command, description, expectedResponse, expectedEvents, steps }) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.command = command;
    this.description = description;
    this.expectedResponse = expectedResponse;
    this.expectedEvents = expectedEvents || [];
    this.steps = steps || [];
  }
}
module.exports = TelnetCommand;
