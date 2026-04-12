const bcrypt = require('bcryptjs');

class ResetPasswordUseCase {
  constructor(userRepository, auditLogRepository) {
    this._userRepo     = userRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute(id, newPassword, auditContext) {
    if (!newPassword || newPassword.length < 6) {
      const err = new Error('Mot de passe trop court (min 6 caractères)');
      err.statusCode = 400;
      throw err;
    }
    const hashed  = await bcrypt.hash(String(newPassword), 10);
    const updated = await this._userRepo.updateById(id, { password: hashed });
    if (!updated) {
      const err = new Error('Utilisateur non trouvé');
      err.statusCode = 404;
      throw err;
    }
    await this._auditLogRepo.create({ ...auditContext, action: 'RESET_PASSWORD', details: { targetUserId: id } });
    return { message: 'Mot de passe réinitialisé' };
  }
}
module.exports = ResetPasswordUseCase;
