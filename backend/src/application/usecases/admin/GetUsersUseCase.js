class GetUsersUseCase {
  constructor(userRepository) { this._userRepo = userRepository; }
  async execute() {
    const users = await this._userRepo.findAll();
    return { users, total: users.length };
  }
}
module.exports = GetUsersUseCase;
