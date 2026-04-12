class GetPostesUseCase {
  constructor(posteRepository) { this._posteRepo = posteRepository; }
  async execute() { return this._posteRepo.findAll(); }
}
module.exports = GetPostesUseCase;
