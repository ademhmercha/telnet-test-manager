class AdminBulkDeleteTestsUseCase {
  constructor(testResultRepository, auditLogRepository) {
    this._testResultRepo = testResultRepository;
    this._auditLogRepo   = auditLogRepository;
  }

  async execute({ status, before }, auditContext) {
    const filter = {};
    if (status && status !== 'all') filter.status = status.toUpperCase();
    if (before) filter.startTime = { $lte: new Date(before).toISOString() };

    if (!Object.keys(filter).length) {
      const err = new Error('Filtre requis (status ou before)');
      err.statusCode = 400;
      throw err;
    }

    const result = await this._testResultRepo.deleteMany(filter);
    await this._auditLogRepo.create({
      ...auditContext,
      action:  'BULK_DELETE_TESTS',
      details: { filter, deleted: result.deletedCount }
    });
    return { message: `${result.deletedCount} test(s) supprimé(s)` };
  }
}
module.exports = AdminBulkDeleteTestsUseCase;
