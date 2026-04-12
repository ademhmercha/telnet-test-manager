class GetSlotsUseCase {
  constructor(slotRepository) { this._slotRepo = slotRepository; }
  async execute(produitId) {
    const filter = produitId ? { produitId: parseInt(produitId) } : {};
    return this._slotRepo.findAll(filter);
  }
}
module.exports = GetSlotsUseCase;
