const bcrypt = require('bcryptjs');

const ROLE_PERMISSIONS = {
  admin:    ['read','write','delete','admin','audit','manage_users','view_logs','run_tests'],
  engineer: ['read','write','run_tests']
};

class CreateUserUseCase {
  constructor(userRepository, auditLogRepository) {
    this._userRepo     = userRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute({ username, password, role, email }, auditContext) {
    if (!username || !password || !role) {
      const err = new Error('username, password et role sont requis');
      err.statusCode = 400;
      throw err;
    }
    if (!['admin','engineer'].includes(role)) {
      const err = new Error('Rôle invalide (admin ou engineer)');
      err.statusCode = 400;
      throw err;
    }
    const existing = await this._userRepo.findByUsername(username);
    if (existing) {
      const err = new Error(`L'utilisateur "${username}" existe déjà`);
      err.statusCode = 409;
      throw err;
    }

    const lastId = await this._userRepo.findLastId();
    const newId  = lastId + 1;
    const hashed = await bcrypt.hash(String(password), 10);

    const user = await this._userRepo.create({
      id: newId, username, password: hashed, role,
      email: email || '',
      permissions: ROLE_PERMISSIONS[role],
      statut: 'actif',
      createdAt: new Date().toISOString()
    });

    await this._auditLogRepo.create({
      ...auditContext,
      action:  'CREATE_USER',
      details: { newUserId: newId, username, role }
    });

    return { message: 'Utilisateur créé', user };
  }
}
module.exports = CreateUserUseCase;
