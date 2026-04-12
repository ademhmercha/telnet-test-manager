class GetTestResultUseCase {
  constructor(testResultRepository) { this._repo = testResultRepository; }

  async execute(id) {
    const test = await this._repo.findById(parseInt(id));
    if (!test) {
      const err = new Error('Test non trouvé');
      err.statusCode = 404;
      throw err;
    }
    return test;
  }
}
module.exports = GetTestResultUseCase;
