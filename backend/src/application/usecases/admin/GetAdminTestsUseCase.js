class GetAdminTestsUseCase {
  constructor(testResultRepository) { this._repo = testResultRepository; }

  async execute({ status, limit = 50, offset = 0, startDate, endDate }) {
    const filter = {};
    if (status && status !== 'all') filter.status = status.toUpperCase();
    if (startDate) filter.startTime = { $gte: new Date(startDate).toISOString() };
    if (endDate)   filter.startTime = { ...(filter.startTime || {}), $lte: new Date(endDate).toISOString() };

    const [tests, total] = await Promise.all([
      this._repo.findWithPagination(filter, { startTime: -1 }, parseInt(offset), parseInt(limit)),
      this._repo.count(filter)
    ]);
    return { tests, total };
  }
}
module.exports = GetAdminTestsUseCase;
