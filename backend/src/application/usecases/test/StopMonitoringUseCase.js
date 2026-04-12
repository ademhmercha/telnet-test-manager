class StopMonitoringUseCase {
  constructor(testResultRepository, testWorkerManager) {
    this._testResultRepo    = testResultRepository;
    this._testWorkerManager = testWorkerManager;
  }

  async execute(testId, username) {
    if (!testId) {
      const err = new Error('testId requis');
      err.statusCode = 400;
      throw err;
    }

    const id = parseInt(testId);
    const terminated = this._testWorkerManager.terminateWorker(id);
    if (!terminated) {
      const err = new Error('Monitoring non trouvé ou déjà arrêté');
      err.statusCode = 404;
      throw err;
    }

    const endTime = new Date().toISOString();
    await this._testResultRepo.updateById(id, {
      $set:  { status: 'STOPPED', endTime },
      $push: { logs: `[${endTime}] Monitoring arrêté par ${username}` }
    });

    return { message: 'Monitoring arrêté', testId: id, status: 'STOPPED' };
  }
}

module.exports = StopMonitoringUseCase;
