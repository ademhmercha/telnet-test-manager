class LogoutUseCase {
  constructor(userRepository, auditLogRepository) {
    this._userRepo     = userRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute(userId, auditContext) {
    if (userId) {
      try {
        const userDoc = await this._userRepo.findById(userId);
        if (userDoc?.loginTimestamp) {
          const sessionMs  = Date.now() - new Date(userDoc.loginTimestamp).getTime();
          const sessionMin = Math.max(0, sessionMs / 60000);
          await this._userRepo.incrementSessionTime(userId, sessionMin);
        }
      } catch (e) {
        console.error('Erreur calcul temps session:', e);
      }
    }

    await this._auditLogRepo.create({
      timestamp: new Date().toISOString(),
      userId:    auditContext.userId,
      username:  auditContext.username,
      role:      auditContext.role,
      action:    'LOGOUT',
      method:    auditContext.method,
      url:       auditContext.url,
      ip:        auditContext.ip,
      userAgent: auditContext.userAgent
    });

    return { message: 'Déconnexion enregistrée' };
  }
}

module.exports = LogoutUseCase;
