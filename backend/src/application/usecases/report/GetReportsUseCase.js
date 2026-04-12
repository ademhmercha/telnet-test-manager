class GetReportsUseCase {
  constructor(reportRepository) { this._repo = reportRepository; }
  async execute() {
    const reports = await this._repo.findAll();
    return { reports, total: reports.length };
  }
}
module.exports = GetReportsUseCase;
