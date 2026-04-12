class GetReportUseCase {
  constructor(reportRepository) { this._repo = reportRepository; }
  async execute(id) {
    const report = await this._repo.findById(id);
    if (!report) {
      const err = new Error('Rapport non trouvé');
      err.statusCode = 404;
      throw err;
    }
    return { report };
  }
}
module.exports = GetReportUseCase;
