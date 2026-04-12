class ISlotRepository {
  async findAll(filter)        { throw new Error('Not implemented'); }
  async findById(id)           { throw new Error('Not implemented'); }
  async findLastId()           { throw new Error('Not implemented'); }
  async create(data)           { throw new Error('Not implemented'); }
  async updateById(id, update) { throw new Error('Not implemented'); }
  async deleteById(id)         { throw new Error('Not implemented'); }
}
module.exports = ISlotRepository;
