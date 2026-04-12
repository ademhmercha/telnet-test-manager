const IPosteRepository = require('../../../domain/repositories/IPosteRepository');

class MongoPosteRepository extends IPosteRepository {
  constructor(PosteModel) {
    super();
    this._Poste = PosteModel;
  }

  async findAll() {
    return this._Poste.find({}, { _id: 0, __v: 0 }).lean();
  }

  async findLastId() {
    const last = await this._Poste.findOne({}, { id: 1 }).sort({ id: -1 }).lean();
    return last?.id || 0;
  }

  async create(data) {
    const poste = await this._Poste.create(data);
    const { _id, __v, ...p } = poste.toObject();
    return p;
  }

  async updateById(id, update) {
    return this._Poste.findOneAndUpdate({ id }, { $set: update }, { new: true, lean: true });
  }

  async deleteById(id) {
    return this._Poste.findOneAndDelete({ id });
  }
}

module.exports = MongoPosteRepository;
