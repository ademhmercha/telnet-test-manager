class GetTestResultsUseCase {
  constructor(testResultRepository) { this._repo = testResultRepository; }

  async execute({ slotId, posteId, produitId, limit = 10 }) {
    const filter = {};
    if (slotId)    filter.slotId    = parseInt(slotId);
    if (posteId)   filter.posteId   = parseInt(posteId);
    if (produitId) filter.produitId = parseInt(produitId);
    return this._repo.findAll(filter, limit);
  }
}
module.exports = GetTestResultsUseCase;
