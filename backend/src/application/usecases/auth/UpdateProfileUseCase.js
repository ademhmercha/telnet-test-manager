const bcrypt = require('bcryptjs');

class UpdateProfileUseCase {
  constructor(userRepository, auditLogRepository) {
    this._userRepo     = userRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute(userId, { username, currentPassword, newPassword }, auditContext) {
    if (!currentPassword) {
      const err = new Error('Le mot de passe actuel est requis');
      err.statusCode = 400;
      throw err;
    }

    const user = await this._userRepo.findByIdWithPassword(userId);
    if (!user) {
      const err = new Error('Utilisateur non trouvé');
      err.statusCode = 404;
      throw err;
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      const err = new Error('Mot de passe actuel incorrect');
      err.statusCode = 401;
      throw err;
    }

    const update = {};
    const changes = [];

    if (username && username.trim() && username.trim() !== user.username) {
      const existing = await this._userRepo.findByUsername(username.trim());
      if (existing) {
        const err = new Error("Ce nom d'utilisateur est déjà pris");
        err.statusCode = 409;
        throw err;
      }
      update.username = username.trim();
      changes.push('username');
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        const err = new Error('Le nouveau mot de passe doit contenir au moins 6 caractères');
        err.statusCode = 400;
        throw err;
      }
      update.password = await bcrypt.hash(newPassword, 10);
      changes.push('password');
    }

    if (changes.length === 0) {
      return { message: 'Aucune modification effectuée', changes: [] };
    }

    await this._userRepo.updateById(userId, update);

    await this._auditLogRepo.create({
      ...auditContext,
      action:  'UPDATE_PROFILE',
      details: { changes }
    });

    return { message: 'Profil mis à jour avec succès', changes };
  }
}

module.exports = UpdateProfileUseCase;
