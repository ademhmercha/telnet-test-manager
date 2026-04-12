class AdminStopTestUseCase {
  constructor(testResultRepository, auditLogRepository, testWorkerManager) {
    this._testResultRepo    = testResultRepository;
    this._auditLogRepo      = auditLogRepository;
    this._testWorkerManager = testWorkerManager;
  }

  async execute(testId, adminUsername, auditContext) {
    const id = parseInt(testId);
    this._testWorkerManager.terminateWorker(id);

    const endTime = new Date().toISOString();
    await this._testResultRepo.updateById(id, {
      $set:  { status: 'STOPPED', endTime },
      $push: { logs: `[${endTime}] Arrêté par admin: ${adminUsername}` }
    });
    await this._auditLogRepo.create({ ...auditContext, action: 'ADMIN_FORCE_STOP_TEST', details: { testId: id } });
    return { message: 'Test arrêté' };
  }
}
module.exports = AdminStopTestUseCase;
