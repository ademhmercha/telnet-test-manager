class IAuditLogRepository {
  async create(data)                         { throw new Error('Not implemented'); }
  async findAll(filter, sort, skip, limit)   { throw new Error('Not implemented'); }
  async count(filter)                        { throw new Error('Not implemented'); }
  async aggregate(pipeline)                  { throw new Error('Not implemented'); }
}
module.exports = IAuditLogRepository;
