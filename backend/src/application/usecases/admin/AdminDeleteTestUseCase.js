class AdminDeleteTestUseCase {
  constructor(testResultRepository, auditLogRepository) {
    this._testResultRepo = testResultRepository;
    this._auditLogRepo   = auditLogRepository;
  }

  async execute(id, auditContext) {
    const deleted = await this._testResultRepo.deleteById(parseInt(id));
    if (!deleted) {
      const err = new Error('Test non trouvé');
      err.statusCode = 404;
      throw err;
    }
    await this._auditLogRepo.create({ ...auditContext, action: 'DELETE_TEST', details: { testId: parseInt(id) } });
    return { message: 'Test supprimé' };
  }
}
module.exports = AdminDeleteTestUseCase;
