const { Router } = require('express');

function createAuthRouter(authController, loginLimiter, authenticate) {
  const router = Router();
  router.post('/login',   loginLimiter, (req, res) => authController.login(req, res));
  router.post('/logout',  authenticate, (req, res) => authController.logout(req, res));
  router.get('/profile',  authenticate, (req, res) => authController.getProfile(req, res));
  router.put('/profile',  authenticate, (req, res) => authController.updateProfile(req, res));
  return router;
}

module.exports = { createAuthRouter };
