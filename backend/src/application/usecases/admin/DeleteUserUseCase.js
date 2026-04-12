class DeleteUserUseCase {
  constructor(userRepository, auditLogRepository) {
    this._userRepo     = userRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute(id, currentUserId, auditContext) {
    if (id === currentUserId) {
      const err = new Error('Impossible de supprimer votre propre compte');
      err.statusCode = 400;
      throw err;
    }
    const deleted = await this._userRepo.deleteById(id);
    if (!deleted) {
      const err = new Error('Utilisateur non trouvé');
      err.statusCode = 404;
      throw err;
    }
    await this._auditLogRepo.create({
      ...auditContext,
      action:  'DELETE_USER',
      details: { deletedUserId: id, username: deleted.username }
    });
    return { message: 'Utilisateur supprimé' };
  }
}
module.exports = DeleteUserUseCase;
