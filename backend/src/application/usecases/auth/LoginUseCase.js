const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

class LoginUseCase {
  constructor(userRepository, auditLogRepository) {
    this._userRepo     = userRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute({ username, password }, auditContext) {
    if (!username || !password) {
      const err = new Error('Identifiants manquants');
      err.statusCode = 400;
      throw err;
    }

    const user = await this._userRepo.findByUsername(username);
    if (!user) {
      const err = new Error('Identifiants incorrects');
      err.statusCode = 401;
      throw err;
    }

    const valid = await bcrypt.compare(String(password), user.password);
    if (!valid) {
      const err = new Error('Identifiants incorrects');
      err.statusCode = 401;
      throw err;
    }

    const JWT_SECRET = process.env.JWT_SECRET;
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const now = new Date().toISOString();
    await this._userRepo.updateById(user.id, { lastLogin: now, loginTimestamp: now });

    await this._auditLogRepo.create({
      timestamp: now,
      userId:    user.id,
      username:  user.username,
      role:      user.role,
      action:    'LOGIN',
      method:    auditContext.method,
      url:       auditContext.url,
      ip:        auditContext.ip,
      userAgent: auditContext.userAgent
    });

    return {
      message: 'Connexion réussie',
      token,
      user: {
        id:          user.id,
        username:    user.username,
        role:        user.role,
        email:       user.email,
        permissions: user.permissions
      }
    };
  }
}

module.exports = LoginUseCase;
