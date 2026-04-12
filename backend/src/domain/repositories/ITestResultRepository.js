class ITestResultRepository {
  async findAll(filter, limit)                          { throw new Error('Not implemented'); }
  async findById(id)                                    { throw new Error('Not implemented'); }
  async findWithPagination(filter, sort, skip, limit)   { throw new Error('Not implemented'); }
  async count(filter)                                   { throw new Error('Not implemented'); }
  async findRecent(since, fields)                       { throw new Error('Not implemented'); }
  async findLast(fields)                                { throw new Error('Not implemented'); }
  async aggregate(pipeline)                             { throw new Error('Not implemented'); }
  async create(data)                                    { throw new Error('Not implemented'); }
  async updateById(id, update, options)                 { throw new Error('Not implemented'); }
  async updateWithFilter(filter, update, options)       { throw new Error('Not implemented'); }
  async pushLog(id, message)                            { throw new Error('Not implemented'); }
  async updateStep(id, stepIndex, status, timestamp, log) { throw new Error('Not implemented'); }
  async complete(id, status, endTime, error)            { throw new Error('Not implemented'); }
  async finalizePendingSteps(id, finalStatus)           { throw new Error('Not implemented'); }
  async deleteById(id)                                  { throw new Error('Not implemented'); }
  async deleteMany(filter)                              { throw new Error('Not implemented'); }
}
module.exports = ITestResultRepository;
