const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');

function createWebSocketServer(port, testWorkerManager, activeWebSocketsGauge) {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws, req) => {
    const url   = new URL(req.url || '/', `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || req.headers.authorization?.replace('Bearer ', '');

    if (!token) { ws.close(1008, 'Token requis'); return; }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) { ws.close(1008, 'Token invalide'); return; }

      ws.user   = user;
      ws.testId = null;
      activeWebSocketsGauge.inc();
      console.log(`WS connecté: ${user.username}`);

      ws.on('message', raw => {
        try {
          const data = JSON.parse(raw);

          if (data.type === 'subscribe_monitoring' && data.testId) {
            testWorkerManager.subscribeMonitoring(data.testId, ws);
            ws.testId = data.testId;
            ws.send(JSON.stringify({ type: 'subscribed', testId: data.testId, message: 'Abonné au monitoring' }));
          }

          if (data.type === 'unsubscribe_monitoring' && data.testId) {
            testWorkerManager.unsubscribeMonitoring(data.testId, ws);
            ws.testId = null;
          }
        } catch (e) { console.error('WS message error:', e); }
      });

      ws.on('close', () => {
        if (ws.testId) testWorkerManager.unsubscribeMonitoring(ws.testId, ws);
        activeWebSocketsGauge.dec();
        console.log(`WS fermé: ${user.username}`);
      });
    });
  });

  console.log(` Serveur WebSocket → ws://localhost:${port}`);
  return wss;
}

module.exports = { createWebSocketServer };
