const IAuditLogRepository = require('../../../domain/repositories/IAuditLogRepository');

class MongoAuditLogRepository extends IAuditLogRepository {
  constructor(AuditLogModel) {
    super();
    this._AuditLog = AuditLogModel;
  }

  async create(data) {
    console.log(`[AUDIT] ${JSON.stringify(data)}`);
    try {
      await this._AuditLog.create(data);
    } catch (e) {
      console.error('Erreur audit log:', e.message);
    }
  }

  async findAll(filter = {}, sort = { timestamp: -1 }, skip = 0, limit = 100) {
    return this._AuditLog.find(filter, { _id: 0, __v: 0 })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async count(filter = {}) {
    return this._AuditLog.countDocuments(filter);
  }

  async aggregate(pipeline) {
    return this._AuditLog.aggregate(pipeline);
  }
}

module.exports = MongoAuditLogRepository;
