const { Router } = require('express');

function createHealthRouter(metricsRegister) {
  const router = Router();
  router.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));
  router.get('/metrics', async (req, res) => {
    res.set('Content-Type', metricsRegister.contentType);
    res.end(await metricsRegister.metrics());
  });
  return router;
}

module.exports = { createHealthRouter };
