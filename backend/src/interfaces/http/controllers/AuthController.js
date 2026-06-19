const { buildAuditContext } = require('../middlewares/auditLog');

class AuthController {
  constructor(loginUseCase, logoutUseCase, updateProfileUseCase) {
    this._loginUseCase          = loginUseCase;
    this._logoutUseCase         = logoutUseCase;
    this._updateProfileUseCase  = updateProfileUseCase;
  }

  async login(req, res) {
    try {
      const auditContext = {
        method:    req.method,
        url:       req.originalUrl,
        ip:        req.ip || req.connection?.remoteAddress,
        userAgent: req.get('User-Agent')
      };
      const result = await this._loginUseCase.execute(req.body, auditContext);
      res.json(result);
    } catch (e) {
      res.status(e.statusCode || 500).json({ error: e.message });
    }
  }

  async logout(req, res) {
    try {
      const result = await this._logoutUseCase.execute(req.user?.id, buildAuditContext(req));
      res.json(result);
    } catch (e) {
      res.status(e.statusCode || 500).json({ error: e.message });
    }
  }

  getProfile(req, res) {
    const { password, _id, __v, ...safe } = req.user;
    res.json(safe);
  }

  async updateProfile(req, res) {
    try {
      const result = await this._updateProfileUseCase.execute(
        req.user.id,
        req.body,
        buildAuditContext(req)
      );
      res.json(result);
    } catch (e) {
      res.status(e.statusCode || 500).json({ error: e.message });
    }
  }
}

module.exports = AuthController;
