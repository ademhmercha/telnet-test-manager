const IProduitRepository = require('../../../domain/repositories/IProduitRepository');

class MongoProduitRepository extends IProduitRepository {
  constructor(ProduitModel) {
    super();
    this._Produit = ProduitModel;
  }

  async findAll(filter = {}) {
    return this._Produit.find(filter, { _id: 0, __v: 0 }).lean();
  }

  async findByIds(ids) {
    return this._Produit.find({ id: { $in: ids } }, { id: 1, nom: 1, _id: 0 }).lean();
  }

  async findLastId() {
    const last = await this._Produit.findOne({}, { id: 1 }).sort({ id: -1 }).lean();
    return last?.id || 0;
  }

  async create(data) {
    const produit = await this._Produit.create(data);
    const { _id, __v, ...p } = produit.toObject();
    return p;
  }

  async updateById(id, update) {
    return this._Produit.findOneAndUpdate({ id }, { $set: update }, { new: true, lean: true });
  }

  async deleteById(id) {
    return this._Produit.findOneAndDelete({ id });
  }
}

module.exports = MongoProduitRepository;
