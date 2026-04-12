class GetAuditLogsUseCase {
  constructor(auditLogRepository) { this._repo = auditLogRepository; }

  async execute({ search, action, username, limit = 100, offset = 0 }) {
    const filter = {};
    if (action)   filter.action   = new RegExp(action,   'i');
    if (username) filter.username = new RegExp(username, 'i');
    if (search)   filter.$or = [
      { action:   new RegExp(search, 'i') },
      { username: new RegExp(search, 'i') },
      { url:      new RegExp(search, 'i') }
    ];

    const [logs, total] = await Promise.all([
      this._repo.findAll(filter, { timestamp: -1 }, parseInt(offset), parseInt(limit)),
      this._repo.count(filter)
    ]);
    return { logs, total };
  }
}
module.exports = GetAuditLogsUseCase;
