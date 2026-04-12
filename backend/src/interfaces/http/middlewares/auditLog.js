/**
 * Factory : crée le middleware d'audit log (fire-and-forget).
 * Injecté avec auditLogRepository depuis le container.
 */
function createAuditLogMiddleware(auditLogRepository) {
  return function auditLog(action) {
    return (req, res, next) => {
      auditLogRepository.create({
        timestamp: new Date().toISOString(),
        userId:    req.user?.id,
        username:  req.user?.username,
        role:      req.user?.role,
        action,
        method:    req.method,
        url:       req.originalUrl,
        ip:        req.ip || req.connection?.remoteAddress,
        userAgent: req.get('User-Agent')
      }).catch(() => {});
      next();
    };
  };
}

/**
 * Construit un objet auditContext depuis la requête Express (pour le passer aux use cases).
 */
function buildAuditContext(req) {
  return {
    timestamp: new Date().toISOString(),
    userId:    req.user?.id,
    username:  req.user?.username,
    role:      req.user?.role,
    method:    req.method,
    url:       req.originalUrl,
    ip:        req.ip || req.connection?.remoteAddress,
    userAgent: req.get('User-Agent')
  };
}

module.exports = { createAuditLogMiddleware, buildAuditContext };
