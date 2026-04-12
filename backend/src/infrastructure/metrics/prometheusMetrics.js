const promClient = require('prom-client');

function createMetrics() {
  const register = new promClient.Registry();
  promClient.collectDefaultMetrics({ register });

  const httpRequestsTotal = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Nombre total de requêtes HTTP',
    labelNames: ['method', 'route', 'status'],
    registers: [register]
  });

  const httpRequestDuration = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Durée des requêtes HTTP en secondes',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [register]
  });

  const testsLaunched = new promClient.Counter({
    name: 'telnet_tests_launched_total',
    help: 'Nombre total de tests Telnet lancés',
    registers: [register]
  });

  const activeWebSockets = new promClient.Gauge({
    name: 'websocket_active_connections',
    help: 'Nombre de connexions WebSocket actives',
    registers: [register]
  });

  return { register, httpRequestsTotal, httpRequestDuration, testsLaunched, activeWebSockets };
}

module.exports = { createMetrics };
