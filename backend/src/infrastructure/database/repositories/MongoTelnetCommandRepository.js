const ITelnetCommandRepository = require('../../../domain/repositories/ITelnetCommandRepository');

class MongoTelnetCommandRepository extends ITelnetCommandRepository {
  constructor(TelnetCommandModel) {
    super();
    this._TelnetCommand = TelnetCommandModel;
  }

  async findAll() {
    return this._TelnetCommand.find({}, { _id: 0, __v: 0 }).lean();
  }

  async findById(id) {
    return this._TelnetCommand.findOne({ id }).lean();
  }

  async create(data) {
    return this._TelnetCommand.create(data);
  }

  async updateById(id, update) {
    return this._TelnetCommand.findOneAndUpdate({ id }, { $set: update }, { new: true, lean: true });
  }

  async deleteById(id) {
    return this._TelnetCommand.findOneAndDelete({ id });
  }
}

module.exports = MongoTelnetCommandRepository;
