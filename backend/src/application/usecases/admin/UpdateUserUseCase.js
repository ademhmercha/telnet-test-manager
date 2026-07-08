const ROLE_PERMISSIONS = {
  admin:      ['read','write','delete','admin','audit','manage_users','view_logs','run_tests'],
  engineer:   ['read','write','delete','run_tests'],
  technician: ['read','run_tests']
};

class UpdateUserUseCase {
  constructor(userRepository, auditLogRepository) {
    this._userRepo     = userRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute(id, { role, email, statut }, currentUserId, auditContext) {
    if (id === currentUserId && statut === 'inactif') {
      const err = new Error('Impossible de désactiver votre propre compte');
      err.statusCode = 400;
      throw err;
    }

    const update = {};
    if (email  !== undefined) update.email  = email;
    if (statut !== undefined) update.statut = statut;
    if (role   !== undefined) {
      if (!['admin','engineer','technician'].includes(role)) {
        const err = new Error('Rôle invalide');
        err.statusCode = 400;
        throw err;
      }
      update.role        = role;
      update.permissions = ROLE_PERMISSIONS[role];
    }

    const updated = await this._userRepo.updateById(id, update);
    if (!updated) {
      const err = new Error('Utilisateur non trouvé');
      err.statusCode = 404;
      throw err;
    }
    await this._auditLogRepo.create({
      ...auditContext,
      action:  'UPDATE_USER',
      details: { targetUserId: id, changes: Object.keys(update) }
    });
    const { password, _id, __v, ...safe } = updated;
    return { message: 'Utilisateur mis à jour', user: safe };
  }
}
module.exports = UpdateUserUseCase;
