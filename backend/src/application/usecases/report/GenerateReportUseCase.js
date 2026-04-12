class GenerateReportUseCase {
  constructor(reportRepository, testResultRepository, slotRepository) {
    this._reportRepo     = reportRepository;
    this._testResultRepo = testResultRepository;
    this._slotRepo       = slotRepository;
  }

  async execute({ slotId, posteId, produitId, startDate, endDate, statusFilter }, generatedBy) {
    if (!slotId || !posteId || !produitId) {
      const err = new Error('Paramètres manquants');
      err.statusCode = 400;
      throw err;
    }

    const filter = {
      slotId:    parseInt(slotId),
      posteId:   parseInt(posteId),
      produitId: parseInt(produitId)
    };
    if (startDate)                    filter.startTime = { $gte: new Date(startDate).toISOString() };
    if (endDate)                      filter.endTime   = { ...(filter.endTime || {}), $lte: new Date(endDate).toISOString() };
    if (statusFilter === 'success')   filter.status    = 'SUCCESS';
    if (statusFilter === 'fail')      filter.status    = 'FAIL';

    const results  = await this._testResultRepo.findAll(filter, 10000);
    const reportId = `RPT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now()}`;
    const slot     = await this._slotRepo.findById(parseInt(slotId));
    const success  = results.filter(r => r.status === 'SUCCESS').length;

    const report = {
      id: reportId,
      createdAt: new Date().toISOString(),
      deviceInfo: {
        slotId, posteId, produitId,
        adresse: slot?.adresse || '?',
        port:    slot?.port    || '?'
      },
      summary: {
        total:       results.length,
        success,
        failure:     results.filter(r => r.status === 'FAIL').length,
        successRate: results.length > 0 ? Math.round(success / results.length * 100) : 0
      },
      tests:       results,
      generatedBy
    };

    await this._reportRepo.create(report);
    return { message: 'Rapport généré', report };
  }
}
module.exports = GenerateReportUseCase;
