require('dotenv').config();

const { connectDB }          = require('../infrastructure/config/database');
const { buildContainer }     = require('./container');
const { createApp }          = require('./app');
const { createWebSocketServer } = require('../interfaces/websocket/WebSocketServer');

const PORT    = process.env.PORT || 3002;
const WS_PORT = 3003;

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET non défini. Créez un fichier .env avec JWT_SECRET=<secret>');
  process.exit(1);
}

async function start() {
  await connectDB();

  const container = buildContainer();
  const app       = createApp(container);

  app.listen(PORT, () => {
    console.log(` Serveur HTTP  → http://localhost:${PORT}`);
  });

  createWebSocketServer(WS_PORT, container.testWorkerManager, container.metrics.activeWebSockets);
}

start().catch(err => {
  console.error('Échec démarrage serveur:', err);
  process.exit(1);
});
