class GetStatsUseCase {
  constructor(testResultRepository, userRepository, telnetCommandRepository, reportRepository, testWorkerManager) {
    this._testResultRepo    = testResultRepository;
    this._userRepo          = userRepository;
    this._telnetCommandRepo = telnetCommandRepository;
    this._reportRepo        = reportRepository;
    this._testWorkerManager = testWorkerManager;
  }

  async execute() {
    const now    = new Date();
    const since7d = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

    const [total, successful, failed, stopped, pending, totalUsers, activeUsers,
           totalCommands, totalReports, recentTests] = await Promise.all([
      this._testResultRepo.count(),
      this._testResultRepo.count({ status: 'SUCCESS' }),
      this._testResultRepo.count({ status: 'FAIL' }),
      this._testResultRepo.count({ status: 'STOPPED' }),
      this._testResultRepo.count({ status: 'PENDING' }),
      this._userRepo.findAll().then(u => u.length),
      this._userRepo.findForAnalytics({ statut: 1, _id: 0 }).then(u => u.filter(x => x.statut === 'actif').length),
      this._telnetCommandRepo.findAll().then(c => c.length),
      this._reportRepo.findAll().then(r => r.length),
      this._testResultRepo.findRecent(since7d)
    ]);

    const lastTest = await this._testResultRepo.findLast({ startTime: 1 });

    const dayMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 3600 * 1000);
      dayMap[d.toISOString().slice(0, 10)] = { date: d.toISOString().slice(0, 10), total: 0, success: 0, fail: 0 };
    }
    recentTests.forEach(t => {
      const day = t.startTime?.slice(0, 10);
      if (dayMap[day]) {
        dayMap[day].total++;
        if (t.status === 'SUCCESS') dayMap[day].success++;
        if (t.status === 'FAIL')    dayMap[day].fail++;
      }
    });

    return {
      stats: {
        totalTests: total, successfulTests: successful, failedTests: failed,
        stoppedTests: stopped, pendingTests: pending,
        successRate: total > 0 ? Math.round(successful / total * 100) : 0,
        totalUsers, activeUsers, totalCommands, totalReports,
        activeWorkers: this._testWorkerManager.activeCount,
        systemUptime: process.uptime(),
        lastTest: lastTest?.startTime || null,
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
      },
      activity: Object.values(dayMap)
    };
  }
}
module.exports = GetStatsUseCase;
