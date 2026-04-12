class GetProduitsUseCase {
  constructor(produitRepository) { this._produitRepo = produitRepository; }
  async execute(posteId) {
    const filter = posteId ? { posteId: parseInt(posteId) } : {};
    return this._produitRepo.findAll(filter);
  }
}
module.exports = GetProduitsUseCase;
