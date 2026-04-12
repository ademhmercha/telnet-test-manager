class StopTestUseCase {
  constructor(testResultRepository, auditLogRepository, testWorkerManager) {
    this._testResultRepo    = testResultRepository;
    this._auditLogRepo      = auditLogRepository;
    this._testWorkerManager = testWorkerManager;
  }

  async execute(testId, username, auditContext) {
    if (!testId) {
      const err = new Error('testId requis');
      err.statusCode = 400;
      throw err;
    }

    const id = parseInt(testId);
    this._testWorkerManager.terminateWorker(id);

    const test = await this._testResultRepo.findById(id);
    if (!test) {
      const err = new Error('Test non trouvé');
      err.statusCode = 404;
      throw err;
    }

    const endTime = new Date().toISOString();
    await this._testResultRepo.updateById(id, {
      $set:  { status: 'STOPPED', endTime },
      $push: { logs: `[${endTime}] Test arrêté par ${username}` }
    });
    await this._testResultRepo.updateWithFilter(
      { id },
      { $set: { 'steps.$[elem].status': 'STOPPED' } },
      { arrayFilters: [{ 'elem.status': { $in: ['PENDING', 'RUNNING'] } }] }
    );

    await this._auditLogRepo.create({ ...auditContext, action: 'STOP_TEST', details: { testId: id } });
    return { message: 'Test arrêté', testId: id, status: 'STOPPED' };
  }
}

module.exports = StopTestUseCase;
