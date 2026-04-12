const ISlotRepository = require('../../../domain/repositories/ISlotRepository');

class MongoSlotRepository extends ISlotRepository {
  constructor(SlotModel) {
    super();
    this._Slot = SlotModel;
  }

  async findAll(filter = {}) {
    return this._Slot.find(filter, { _id: 0, __v: 0 }).lean();
  }

  async findById(id) {
    return this._Slot.findOne({ id }).lean();
  }

  async findLastId() {
    const last = await this._Slot.findOne({}, { id: 1 }).sort({ id: -1 }).lean();
    return last?.id || 0;
  }

  async create(data) {
    const slot = await this._Slot.create(data);
    const { _id, __v, ...s } = slot.toObject();
    return s;
  }

  async updateById(id, update) {
    return this._Slot.findOneAndUpdate({ id }, { $set: update }, { new: true, lean: true });
  }

  async deleteById(id) {
    return this._Slot.findOneAndDelete({ id });
  }
}

module.exports = MongoSlotRepository;
