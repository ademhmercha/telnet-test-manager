class GetReferencesUseCase {
  constructor(referenceRepository) { this._referenceRepo = referenceRepository; }
  async execute(produitId) {
    const filter = { statut: 'actif' };
    if (produitId) filter.produitId = parseInt(produitId);
    return this._referenceRepo.findAll(filter);
  }
}
module.exports = GetReferencesUseCase;
