const IReferenceRepository = require('../../../domain/repositories/IReferenceRepository');

class MongoReferenceRepository extends IReferenceRepository {
  constructor(ReferenceModel) {
    super();
    this._Reference = ReferenceModel;
  }

  async findAll(filter = {}) {
    return this._Reference.find(filter, { _id: 0, __v: 0 }).lean();
  }

  async findLastId() {
    const last = await this._Reference.findOne({}, { id: 1 }).sort({ id: -1 }).lean();
    return last?.id || 0;
  }

  async create(data) {
    const ref = await this._Reference.create(data);
    const { _id, __v, ...r } = ref.toObject();
    return r;
  }

  async updateById(id, update) {
    return this._Reference.findOneAndUpdate({ id }, { $set: update }, { new: true, lean: true });
  }

  async deleteById(id) {
    return this._Reference.findOneAndDelete({ id });
  }
}

module.exports = MongoReferenceRepository;
