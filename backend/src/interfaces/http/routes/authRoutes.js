const { Router } = require('express');

function createAuthRouter(authController, loginLimiter, authenticate) {
  const router = Router();
  router.post('/login',  loginLimiter, (req, res) => authController.login(req, res));
  router.post('/logout', authenticate, (req, res) => authController.logout(req, res));
  return router;
}

module.exports = { createAuthRouter };
