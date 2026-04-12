class IReportRepository {
  async findAll()      { throw new Error('Not implemented'); }
  async findById(id)   { throw new Error('Not implemented'); }
  async create(data)   { throw new Error('Not implemented'); }
  async deleteById(id) { throw new Error('Not implemented'); }
}
module.exports = IReportRepository;
