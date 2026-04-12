class DeleteReportUseCase {
  constructor(reportRepository) { this._repo = reportRepository; }
  async execute(id) {
    const deleted = await this._repo.deleteById(id);
    if (!deleted) {
      const err = new Error('Rapport non trouvé');
      err.statusCode = 404;
      throw err;
    }
    return { message: 'Rapport supprimé' };
  }
}
module.exports = DeleteReportUseCase;
