require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const { Worker } = require('worker_threads');
const { WebSocketServer } = require('ws');
const promClient = require('prom-client');

// ─── Prometheus Metrics ───────────────────────────────────────────────────────
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

const {
  connectDB,
  User, Poste, Produit, Reference, Slot,
  TestResult, AuditLog, TelnetCommand, Report
} = require('./db');

const app  = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET non défini. Créez un fichier .env avec JWT_SECRET=<secret>');
  process.exit(1);
}

// ─── Sécurité ─────────────────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "ws://localhost:3003", "ws://localhost:3002"]
    }
  }
}));

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
app.use(cors({
  origin: allowedOrigin,
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

// Limite: 10 tentatives de connexion par 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
});

// ─── Workers & Clients WebSocket actifs ──────────────────────────────────────

const activeWorkers    = new Map();  // testId → Worker
const monitoringClients = new Map(); // testId → Set<WebSocket>

// ─── Middleware d'authentification ────────────────────────────────────────────

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requis' });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    try {
      const fullUser = await User.findOne({ id: decoded.id }, { password: 0 }).lean();
      if (!fullUser) return res.status(403).json({ error: 'Utilisateur non trouvé' });
      req.user = { ...decoded, ...fullUser };
      next();
    } catch (e) {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  });
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user?.permissions?.includes(permission)) {
      return res.status(403).json({ error: 'Permission refusée' });
    }
    next();
  };
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).json({ error: 'Rôle requis' });
    next();
  };
}

async function addAuditLog(action, req, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    userId:    req.user?.id,
    username:  req.user?.username,
    role:      req.user?.role,
    action,
    method:    req.method,
    url:       req.originalUrl,
    ip:        req.ip || req.connection?.remoteAddress,
    userAgent: req.get('User-Agent'),
    ...(Object.keys(details).length > 0 ? { details } : {})
  };
  console.log(`[AUDIT] ${JSON.stringify(entry)}`);
  try {
    await AuditLog.create(entry);
  } catch (e) {
    console.error('Erreur audit log:', e.message);
  }
}

function auditLog(action) {
  return (req, res, next) => {
    addAuditLog(action, req).catch(() => {});
    next();
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

app.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Identifiants manquants' });
    }

    const user = await User.findOne({ username }).lean();
    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });

    const valid = await bcrypt.compare(String(password), user.password);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const now = new Date().toISOString();
    await User.updateOne({ id: user.id }, { $set: { lastLogin: now, loginTimestamp: now } });

    const fakeReq = {
      user,
      method: 'POST',
      originalUrl: '/login',
      ip: req.ip || req.connection?.remoteAddress,
      get: (h) => req.get(h)
    };
    await addAuditLog('LOGIN', fakeReq);

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        permissions: user.permissions
      }
    });
  } catch (e) {
    console.error('Erreur login:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/logout', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (userId) {
      const userDoc = await User.findOne({ id: userId }, { loginTimestamp: 1, totalTimeMinutes: 1 }).lean();
      if (userDoc?.loginTimestamp) {
        const sessionMs  = Date.now() - new Date(userDoc.loginTimestamp).getTime();
        const sessionMin = Math.max(0, sessionMs / 60000);
        await User.updateOne(
          { id: userId },
          { $inc: { totalTimeMinutes: sessionMin }, $unset: { loginTimestamp: '' } }
        );
      }
    }
  } catch (e) {
    console.error('Erreur calcul temps session:', e);
  }
  await addAuditLog('LOGOUT', req);
  res.json({ message: 'Déconnexion enregistrée' });
});

// ─── Données ─────────────────────────────────────────────────────────────────

app.get('/postes', authenticateToken, requirePermission('read'), auditLog('VIEW_POSTES'), async (req, res) => {
  try {
    const postes = await Poste.find({}, { _id: 0, __v: 0 }).lean();
    res.json(postes);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/produits', authenticateToken, requirePermission('read'), auditLog('VIEW_PRODUITS'), async (req, res) => {
  try {
    const { posteId } = req.query;
    const filter = posteId ? { posteId: parseInt(posteId) } : {};
    const produits = await Produit.find(filter, { _id: 0, __v: 0 }).lean();
    res.json(produits);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/slots', authenticateToken, requirePermission('read'), auditLog('VIEW_SLOTS'), async (req, res) => {
  try {
    const { produitId } = req.query;
    const filter = produitId ? { produitId: parseInt(produitId) } : {};
    const slots = await Slot.find(filter, { _id: 0, __v: 0 }).lean();
    res.json(slots);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/references', authenticateToken, requirePermission('read'), auditLog('VIEW_REFERENCES'), async (req, res) => {
  try {
    const { produitId } = req.query;
    const filter = { statut: 'actif' };
    if (produitId) filter.produitId = parseInt(produitId);
    const references = await Reference.find(filter, { _id: 0, __v: 0 }).lean();
    res.json(references);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Postes (CRUD) ───────────────────────────────────────────────────────────

app.post('/postes', authenticateToken, requirePermission('write'), async (req, res) => {
  try {
    const { nom, description, statut } = req.body;
    if (!nom) return res.status(400).json({ error: 'Le nom est requis' });
    const last = await Poste.findOne({}, { id: 1 }).sort({ id: -1 }).lean();
    const newId = (last?.id || 0) + 1;
    const poste = await Poste.create({ id: newId, nom, description: description || '', statut: statut || 'actif' });
    await addAuditLog('CREATE_POSTE', req, { posteId: newId });
    const { _id, __v, ...p } = poste.toObject();
    res.status(201).json({ message: 'Poste créé', poste: p });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.put('/postes/:id', authenticateToken, requirePermission('write'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nom, description, statut } = req.body;
    const update = {};
    if (nom !== undefined) update.nom = nom;
    if (description !== undefined) update.description = description;
    if (statut !== undefined) update.statut = statut;
    const updated = await Poste.findOneAndUpdate({ id }, { $set: update }, { new: true, lean: true });
    if (!updated) return res.status(404).json({ error: 'Poste non trouvé' });
    await addAuditLog('UPDATE_POSTE', req, { posteId: id });
    const { _id, __v, ...p } = updated;
    res.json({ message: 'Poste mis à jour', poste: p });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.delete('/postes/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await Poste.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ error: 'Poste non trouvé' });
    await addAuditLog('DELETE_POSTE', req, { posteId: id });
    res.json({ message: 'Poste supprimé' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Produits (CRUD) ──────────────────────────────────────────────────────────

app.post('/produits', authenticateToken, requirePermission('write'), async (req, res) => {
  try {
    const { nom, posteId, description } = req.body;
    if (!nom || !posteId) return res.status(400).json({ error: 'nom et posteId sont requis' });
    const last = await Produit.findOne({}, { id: 1 }).sort({ id: -1 }).lean();
    const newId = (last?.id || 0) + 1;
    const produit = await Produit.create({ id: newId, nom, posteId: parseInt(posteId), description: description || '' });
    await addAuditLog('CREATE_PRODUIT', req, { produitId: newId });
    const { _id, __v, ...p } = produit.toObject();
    res.status(201).json({ message: 'Produit créé', produit: p });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.put('/produits/:id', authenticateToken, requirePermission('write'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nom, posteId, description } = req.body;
    const update = {};
    if (nom !== undefined) update.nom = nom;
    if (posteId !== undefined) update.posteId = parseInt(posteId);
    if (description !== undefined) update.description = description;
    const updated = await Produit.findOneAndUpdate({ id }, { $set: update }, { new: true, lean: true });
    if (!updated) return res.status(404).json({ error: 'Produit non trouvé' });
    await addAuditLog('UPDATE_PRODUIT', req, { produitId: id });
    const { _id, __v, ...p } = updated;
    res.json({ message: 'Produit mis à jour', produit: p });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.delete('/produits/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await Produit.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ error: 'Produit non trouvé' });
    await addAuditLog('DELETE_PRODUIT', req, { produitId: id });
    res.json({ message: 'Produit supprimé' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Slots (CRUD) ─────────────────────────────────────────────────────────────

app.post('/slots', authenticateToken, requirePermission('write'), async (req, res) => {
  try {
    const { nom, produitId, adresse, port, description } = req.body;
    if (!nom || !produitId || !adresse || !port) {
      return res.status(400).json({ error: 'nom, produitId, adresse et port sont requis' });
    }
    const last = await Slot.findOne({}, { id: 1 }).sort({ id: -1 }).lean();
    const newId = (last?.id || 0) + 1;
    const slot = await Slot.create({
      id: newId, nom,
      produitId: parseInt(produitId),
      adresse, port: parseInt(port),
      description: description || ''
    });
    await addAuditLog('CREATE_SLOT', req, { slotId: newId });
    const { _id, __v, ...s } = slot.toObject();
    res.status(201).json({ message: 'Slot créé', slot: s });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.put('/slots/:id', authenticateToken, requirePermission('write'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nom, produitId, adresse, port, description } = req.body;
    const update = {};
    if (nom !== undefined) update.nom = nom;
    if (produitId !== undefined) update.produitId = parseInt(produitId);
    if (adresse !== undefined) update.adresse = adresse;
    if (port !== undefined) update.port = parseInt(port);
    if (description !== undefined) update.description = description;
    const updated = await Slot.findOneAndUpdate({ id }, { $set: update }, { new: true, lean: true });
    if (!updated) return res.status(404).json({ error: 'Slot non trouvé' });
    await addAuditLog('UPDATE_SLOT', req, { slotId: id });
    const { _id, __v, ...s } = updated;
    res.json({ message: 'Slot mis à jour', slot: s });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.delete('/slots/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await Slot.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ error: 'Slot non trouvé' });
    await addAuditLog('DELETE_SLOT', req, { slotId: id });
    res.json({ message: 'Slot supprimé' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Références (CRUD) ────────────────────────────────────────────────────────

app.post('/references', authenticateToken, requirePermission('write'), async (req, res) => {
  try {
    const { nom, produitId, description, version, statut } = req.body;
    if (!nom || !produitId) return res.status(400).json({ error: 'nom et produitId sont requis' });
    const last = await Reference.findOne({}, { id: 1 }).sort({ id: -1 }).lean();
    const newId = (last?.id || 0) + 1;
    const ref = await Reference.create({
      id: newId, nom, produitId: parseInt(produitId),
      description: description || '', version: version || '',
      statut: statut || 'actif'
    });
    await addAuditLog('CREATE_REFERENCE', req, { referenceId: newId });
    const { _id, __v, ...r } = ref.toObject();
    res.status(201).json({ message: 'Référence créée', reference: r });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.put('/references/:id', authenticateToken, requirePermission('write'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nom, produitId, description, version, statut } = req.body;
    const update = {};
    if (nom !== undefined) update.nom = nom;
    if (produitId !== undefined) update.produitId = parseInt(produitId);
    if (description !== undefined) update.description = description;
    if (version !== undefined) update.version = version;
    if (statut !== undefined) update.statut = statut;
    const updated = await Reference.findOneAndUpdate({ id }, { $set: update }, { new: true, lean: true });
    if (!updated) return res.status(404).json({ error: 'Référence non trouvée' });
    await addAuditLog('UPDATE_REFERENCE', req, { referenceId: id });
    const { _id, __v, ...r } = updated;
    res.json({ message: 'Référence mise à jour', reference: r });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.delete('/references/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await Reference.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ error: 'Référence non trouvée' });
    await addAuditLog('DELETE_REFERENCE', req, { referenceId: id });
    res.json({ message: 'Référence supprimée' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Commandes Telnet (CRUD) ──────────────────────────────────────────────────

app.get('/telnet-commands', authenticateToken, async (req, res) => {
  try {
    const commands = await TelnetCommand.find({}, { _id: 0, __v: 0 }).lean();
    res.json({ message: 'Commandes Telnet disponibles', commands });
  } catch (e) {
    console.error('Erreur lecture commandes:', e);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

app.post('/telnet-commands', authenticateToken, requirePermission('write'), async (req, res) => {
  try {
    const { id, name, type, command, description, expectedResponse, expectedEvents } = req.body;

    if (!id || !name || !type || !command) {
      return res.status(400).json({ error: 'Champs requis: id, name, type, command' });
    }

    const existing = await TelnetCommand.findOne({ id });
    if (existing) {
      return res.status(409).json({ error: `Une commande avec l'id "${id}" existe déjà` });
    }

    const newCommand = { id, name, type, command, description: description || '' };
    if (expectedResponse) newCommand.expectedResponse = expectedResponse;
    if (Array.isArray(expectedEvents) && expectedEvents.length > 0) newCommand.expectedEvents = expectedEvents;

    await TelnetCommand.create(newCommand);
    await addAuditLog('CREATE_TELNET_COMMAND', req, { commandId: id });
    res.status(201).json({ message: 'Commande ajoutée', command: newCommand });
  } catch (e) {
    console.error('Erreur ajout commande:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/telnet-commands/:id', authenticateToken, requirePermission('write'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, command, description, expectedResponse, expectedEvents } = req.body;

    const existing = await TelnetCommand.findOne({ id });
    if (!existing) return res.status(404).json({ error: `Commande "${id}" introuvable` });

    const update = {};
    if (name        !== undefined) update.name        = name;
    if (type        !== undefined) update.type        = type;
    if (command     !== undefined) update.command     = command;
    if (description !== undefined) update.description = description;
    if (expectedResponse !== undefined) update.expectedResponse = expectedResponse || undefined;
    if (expectedEvents   !== undefined) update.expectedEvents = expectedEvents?.length ? expectedEvents : undefined;

    const updated = await TelnetCommand.findOneAndUpdate(
      { id }, { $set: update }, { new: true, lean: true }
    );
    await addAuditLog('UPDATE_TELNET_COMMAND', req, { commandId: id });
    const { _id, __v, ...cmd } = updated;
    res.json({ message: 'Commande mise à jour', command: cmd });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/telnet-commands/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await TelnetCommand.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ error: `Commande "${id}" introuvable` });
    await addAuditLog('DELETE_TELNET_COMMAND', req, { commandId: id });
    res.json({ message: 'Commande supprimée' });
  } catch (e) {
    console.error('Erreur suppression commande:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Broadcast WebSocket ──────────────────────────────────────────────────────

function broadcastMonitoringEvent(testId, event) {
  const clients = monitoringClients.get(testId);
  if (!clients || clients.size === 0) return;
  const msg = JSON.stringify({
    type: 'monitoring_event',
    testId,
    timestamp: new Date().toISOString(),
    event
  });
  clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}

// ─── /run-test ────────────────────────────────────────────────────────────────

app.post('/run-test', authenticateToken, requirePermission('run_tests'), async (req, res) => {
  testsLaunched.inc();
  const { slotId, posteId, produitId, commandId, commands, monitorDurationMs } = req.body;

  if (!slotId || !posteId || !produitId) {
    return res.status(400).json({ error: 'Paramètres manquants: slotId, posteId, produitId requis' });
  }

  const isDashboardSequence = Array.isArray(commands) && commands.length > 0;
  const isSingleCommand     = !isDashboardSequence && !!commandId;

  if (!isDashboardSequence && !isSingleCommand) {
    return res.status(400).json({ error: 'commandId ou commands[] requis' });
  }

  const slot = await Slot.findOne({ id: parseInt(slotId) }).lean();
  if (!slot) return res.status(404).json({ error: `Slot ${slotId} non trouvé` });

  // Récupère toutes les commandes Telnet depuis MongoDB
  const allCommands  = await TelnetCommand.find({}, { _id: 0, __v: 0 }).lean();
  const telnetConfig = { commands: allCommands };

  let runMode;
  let commandConfig = null;

  if (isSingleCommand) {
    commandConfig = telnetConfig.commands.find(c => c.id === commandId);
    if (!commandConfig) return res.status(404).json({ error: `Commande '${commandId}' non trouvée` });

    if (commandConfig.type === 'sequence') {
      runMode = 'builtin_sequence';
    } else if (commandConfig.type === 'monitoring') {
      runMode = 'monitoring';
    } else {
      runMode = 'single';
    }

    if (runMode === 'monitoring' && typeof monitorDurationMs === 'number' && monitorDurationMs > 0) {
      commandConfig = { ...commandConfig, duration: monitorDurationMs };
    }
  } else {
    runMode = 'sequence';
  }

  await addAuditLog(runMode === 'single' ? 'RUN_TEST' : 'RUN_SEQUENCE', req, {
    slotId, posteId, produitId,
    commandId: commandId || null,
    steps: isDashboardSequence ? commands.length : (commandConfig?.steps?.length || 1)
  });

  const testId    = Date.now();
  const startTime = new Date().toISOString();
  let testSteps   = [];

  if (runMode === 'builtin_sequence') {
    testSteps = commandConfig.steps.map((s, i) => ({
      step: i + 1,
      description: s.description || s.command,
      status: 'PENDING',
      timestamp: startTime
    }));
  } else if (runMode === 'sequence') {
    testSteps = commands.map((s, i) => {
      const cfg = telnetConfig.commands.find(c => c.id === s.commandId);
      return {
        step: i + 1,
        description: s.description || cfg?.name || s.commandId,
        status: 'PENDING',
        timestamp: startTime
      };
    });
  } else {
    testSteps = [
      { step: 1, description: 'Initialisation de la connexion',     status: 'PENDING', timestamp: startTime },
      { step: 2, description: 'Connexion au serveur',                status: 'PENDING', timestamp: startTime },
      { step: 3, description: 'Authentification Telnet',             status: 'PENDING', timestamp: startTime },
      { step: 4, description: `Exécution: ${commandConfig.command}`, status: 'PENDING', timestamp: startTime },
      { step: 5, description: 'Analyse des résultats',               status: 'PENDING', timestamp: startTime }
    ];
  }

  await TestResult.create({
    id: testId,
    slotId:    parseInt(slotId),
    posteId:   parseInt(posteId),
    produitId: parseInt(produitId),
    commandId: commandId || null,
    runMode,
    status:    'PENDING',
    startTime,
    endTime:   null,
    steps:     testSteps,
    logs:      [`[${startTime}] Démarrage ${runMode} sur ${slot.adresse}:${slot.port}`]
  });

  // ── Lance le worker ───────────────────────────────────────────────────────

  const workerData = {
    testId,
    startTime,
    slotId:     parseInt(slotId),
    slot:       { adresse: slot.adresse, port: slot.port }, // transmis directement au worker
    runMode,
    commandConfig:      (runMode === 'single' || runMode === 'monitoring') ? commandConfig : null,
    builtinSteps:       runMode === 'builtin_sequence' ? commandConfig.steps : null,
    dashboardCommands:  runMode === 'sequence' ? commands : null,
    telnetCommandsList: telnetConfig.commands
  };

  const worker = new Worker(path.join(__dirname, 'testWorker.js'), { workerData });
  activeWorkers.set(testId, worker);

  worker.on('message', async (msg) => {
    if (!msg?.type) return;
    try {
      switch (msg.type) {
        case 'log':
          if (msg.message) {
            await TestResult.updateOne({ id: testId }, { $push: { logs: msg.message } });
          }
          break;

        case 'step':
          if (typeof msg.stepIndex === 'number') {
            const setFields = {
              [`steps.${msg.stepIndex}.status`]:    msg.status,
              [`steps.${msg.stepIndex}.timestamp`]: msg.timestamp || new Date().toISOString()
            };
            const ops = { $set: setFields };
            if (msg.log) ops.$push = { logs: msg.log };
            await TestResult.updateOne({ id: testId }, ops);
          }
          break;

        case 'monitoringEvent':
          broadcastMonitoringEvent(testId, msg.event);
          if (msg.log) {
            await TestResult.updateOne({ id: testId }, { $push: { logs: msg.log } });
          }
          break;

        case 'completed': {
          const endTime     = msg.endTime ? new Date(msg.endTime).toISOString() : new Date().toISOString();
          const finalStatus = msg.success ? 'SUCCESS' : 'FAIL';
          await TestResult.updateOne(
            { id: testId },
            {
              $set:  { status: finalStatus, endTime },
              $push: { logs: `[${endTime}] Terminé: ${finalStatus}${msg.error ? ' – ' + msg.error : ''}` }
            }
          );
          await TestResult.updateOne(
            { id: testId },
            { $set: { 'steps.$[elem].status': finalStatus } },
            { arrayFilters: [{ 'elem.status': { $in: ['PENDING', 'RUNNING'] } }] }
          );
          activeWorkers.delete(testId);
          break;
        }

        case 'error': {
          const endTime = new Date().toISOString();
          await TestResult.updateOne(
            { id: testId },
            {
              $set:  { status: 'FAIL', endTime },
              $push: { logs: `[${endTime}] Erreur worker: ${msg.message}` }
            }
          );
          activeWorkers.delete(testId);
          break;
        }
      }
    } catch (e) {
      console.error('Erreur handler worker:', e);
    }
  });

  worker.on('error', async (err) => {
    const endTime = new Date().toISOString();
    try {
      await TestResult.updateOne(
        { id: testId },
        {
          $set:  { status: 'FAIL', endTime },
          $push: { logs: `[${endTime}] Erreur worker: ${err.message}` }
        }
      );
    } catch (e) { console.error(e); }
    activeWorkers.delete(testId);
  });

  worker.on('exit', async (code) => {
    if (code !== 0) {
      const endTime = new Date().toISOString();
      try {
        await TestResult.updateOne(
          { id: testId, status: { $in: ['PENDING', 'RUNNING'] } },
          {
            $set:  { status: 'FAIL', endTime },
            $push: { logs: `[${endTime}] Worker exit inattendu, code: ${code}` }
          }
        );
      } catch (e) { console.error(e); }
    }
    activeWorkers.delete(testId);
  });

  res.json({
    message:   runMode === 'single' ? 'Test démarré' : 'Séquence démarrée',
    testId,
    steps:     testSteps,
    estimatedDuration: runMode === 'monitoring' ? 'Continu' : `~${testSteps.length * 5}s`,
    isMonitoring: runMode === 'monitoring',
    hasMonitoringCommands: runMode === 'sequence' && commands.some(s => {
      const cfg = telnetConfig.commands.find(c => c.id === s.commandId);
      return s.type === 'monitoring' || cfg?.type === 'monitoring';
    })
  });
});

// ─── Résultats de tests ───────────────────────────────────────────────────────

app.get('/test-results', authenticateToken, async (req, res) => {
  try {
    const { slotId, posteId, produitId, limit = 10 } = req.query;
    const filter = {};
    if (slotId)    filter.slotId    = parseInt(slotId);
    if (posteId)   filter.posteId   = parseInt(posteId);
    if (produitId) filter.produitId = parseInt(produitId);

    const results = await TestResult.find(filter, { _id: 0, __v: 0 })
      .sort({ startTime: -1 })
      .limit(parseInt(limit))
      .lean();
    res.json(results);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/test-results/:id', authenticateToken, async (req, res) => {
  try {
    const test = await TestResult.findOne(
      { id: parseInt(req.params.id) },
      { _id: 0, __v: 0 }
    ).lean();
    if (!test) return res.status(404).json({ error: 'Test non trouvé' });
    res.json(test);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Arrêt des tests ──────────────────────────────────────────────────────────

app.post('/stop-test', authenticateToken, requirePermission('run_tests'), async (req, res) => {
  const { testId } = req.body;
  if (!testId) return res.status(400).json({ error: 'testId requis' });

  const worker = activeWorkers.get(parseInt(testId));
  if (worker) { worker.terminate(); activeWorkers.delete(parseInt(testId)); }

  const test = await TestResult.findOne({ id: parseInt(testId) });
  if (!test) return res.status(404).json({ error: 'Test non trouvé' });

  const endTime = new Date().toISOString();
  await TestResult.updateOne(
    { id: parseInt(testId) },
    {
      $set:  { status: 'STOPPED', endTime },
      $push: { logs: `[${endTime}] Test arrêté par ${req.user.username}` }
    }
  );
  await TestResult.updateOne(
    { id: parseInt(testId) },
    { $set: { 'steps.$[elem].status': 'STOPPED' } },
    { arrayFilters: [{ 'elem.status': { $in: ['PENDING', 'RUNNING'] } }] }
  );

  await addAuditLog('STOP_TEST', req, { testId: parseInt(testId) });
  res.json({ message: 'Test arrêté', testId: parseInt(testId), status: 'STOPPED' });
});

app.post('/stop-monitoring', authenticateToken, requirePermission('run_tests'), async (req, res) => {
  const { testId } = req.body;
  if (!testId) return res.status(400).json({ error: 'testId requis' });

  const worker = activeWorkers.get(parseInt(testId));
  if (!worker) return res.status(404).json({ error: 'Monitoring non trouvé ou déjà arrêté' });

  worker.terminate();
  activeWorkers.delete(parseInt(testId));

  const endTime = new Date().toISOString();
  await TestResult.updateOne(
    { id: parseInt(testId) },
    {
      $set:  { status: 'STOPPED', endTime },
      $push: { logs: `[${endTime}] Monitoring arrêté par ${req.user.username}` }
    }
  );

  res.json({ message: 'Monitoring arrêté', testId: parseInt(testId), status: 'STOPPED' });
});

// ─── Admin ────────────────────────────────────────────────────────────────────

const ROLE_PERMISSIONS = {
  admin:    ['read','write','delete','admin','audit','manage_users','view_logs','run_tests'],
  engineer: ['read','write','run_tests']
};

// Audit logs avec pagination + filtres
app.get('/admin/audit-logs', authenticateToken, requireRole('admin'), requirePermission('audit'), async (req, res) => {
  try {
    const { search, action, username, limit = 100, offset = 0 } = req.query;
    const filter = {};
    if (action)   filter.action   = new RegExp(action,   'i');
    if (username) filter.username = new RegExp(username, 'i');
    if (search)   filter.$or = [
      { action:   new RegExp(search, 'i') },
      { username: new RegExp(search, 'i') },
      { url:      new RegExp(search, 'i') }
    ];
    const [logs, total] = await Promise.all([
      AuditLog.find(filter, { _id: 0, __v: 0 })
        .sort({ timestamp: -1 })
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .lean(),
      AuditLog.countDocuments(filter)
    ]);
    res.json({ logs, total });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Liste users
app.get('/admin/users', authenticateToken, requireRole('admin'), requirePermission('manage_users'), async (req, res) => {
  try {
    const users = await User.find({}, { _id: 0, __v: 0, password: 0 }).lean();
    res.json({ users, total: users.length });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Créer un user
app.post('/admin/users', authenticateToken, requireRole('admin'), requirePermission('manage_users'), async (req, res) => {
  try {
    const { username, password, role, email } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'username, password et role sont requis' });
    }
    if (!['admin','engineer'].includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide (admin ou engineer)' });
    }
    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ error: `L'utilisateur "${username}" existe déjà` });

    const last  = await User.findOne({}, { id: 1 }).sort({ id: -1 }).lean();
    const newId = (last?.id || 0) + 1;
    const hashed = await bcrypt.hash(String(password), 10);

    const user = await User.create({
      id: newId, username, password: hashed, role,
      email: email || '',
      permissions: ROLE_PERMISSIONS[role],
      statut: 'actif',
      createdAt: new Date().toISOString()
    });

    await addAuditLog('CREATE_USER', req, { newUserId: newId, username, role });
    const { password: _, _id, __v, ...safe } = user.toObject();
    res.status(201).json({ message: 'Utilisateur créé', user: safe });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Modifier un user (role, email, statut)
app.put('/admin/users/:id', authenticateToken, requireRole('admin'), requirePermission('manage_users'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { role, email, statut } = req.body;

    // Empêche un admin de se désactiver lui-même
    if (id === req.user.id && statut === 'inactif') {
      return res.status(400).json({ error: 'Impossible de désactiver votre propre compte' });
    }

    const update = {};
    if (email  !== undefined) update.email  = email;
    if (statut !== undefined) update.statut = statut;
    if (role   !== undefined) {
      if (!['admin','engineer'].includes(role)) {
        return res.status(400).json({ error: 'Rôle invalide' });
      }
      update.role        = role;
      update.permissions = ROLE_PERMISSIONS[role];
    }

    const updated = await User.findOneAndUpdate({ id }, { $set: update }, { new: true, lean: true });
    if (!updated) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    await addAuditLog('UPDATE_USER', req, { targetUserId: id, changes: Object.keys(update) });
    const { password, _id, __v, ...safe } = updated;
    res.json({ message: 'Utilisateur mis à jour', user: safe });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Reset mot de passe
app.post('/admin/users/:id/reset-password', authenticateToken, requireRole('admin'), requirePermission('manage_users'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
    }
    const hashed = await bcrypt.hash(String(newPassword), 10);
    const updated = await User.findOneAndUpdate({ id }, { $set: { password: hashed } });
    if (!updated) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    await addAuditLog('RESET_PASSWORD', req, { targetUserId: id });
    res.json({ message: 'Mot de passe réinitialisé' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Supprimer un user
app.delete('/admin/users/:id', authenticateToken, requireRole('admin'), requirePermission('manage_users'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' });
    }
    const deleted = await User.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    await addAuditLog('DELETE_USER', req, { deletedUserId: id, username: deleted.username });
    res.json({ message: 'Utilisateur supprimé' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Statistiques enrichies
app.get('/admin/stats', authenticateToken, requireRole('admin'), requirePermission('audit'), async (req, res) => {
  try {
    const now = new Date();
    const since7d = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

    const [total, successful, failed, stopped, pending, totalUsers, activeUsers,
           totalCommands, totalReports, recentTests] = await Promise.all([
      TestResult.countDocuments(),
      TestResult.countDocuments({ status: 'SUCCESS' }),
      TestResult.countDocuments({ status: 'FAIL' }),
      TestResult.countDocuments({ status: 'STOPPED' }),
      TestResult.countDocuments({ status: 'PENDING' }),
      User.countDocuments(),
      User.countDocuments({ statut: 'actif' }),
      TelnetCommand.countDocuments(),
      Report.countDocuments(),
      TestResult.find({ startTime: { $gte: since7d } }, { startTime: 1, status: 1, _id: 0 }).lean()
    ]);

    const lastTest = await TestResult.findOne({}, { startTime: 1 }).sort({ startTime: -1 }).lean();

    // Activité par jour sur 7 jours
    const dayMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 3600 * 1000);
      dayMap[d.toISOString().slice(0, 10)] = { date: d.toISOString().slice(0, 10), total: 0, success: 0, fail: 0 };
    }
    recentTests.forEach(t => {
      const day = t.startTime?.slice(0, 10);
      if (dayMap[day]) {
        dayMap[day].total++;
        if (t.status === 'SUCCESS') dayMap[day].success++;
        if (t.status === 'FAIL')    dayMap[day].fail++;
      }
    });

    res.json({
      stats: {
        totalTests: total, successfulTests: successful, failedTests: failed,
        stoppedTests: stopped, pendingTests: pending,
        successRate: total > 0 ? Math.round(successful / total * 100) : 0,
        totalUsers, activeUsers, totalCommands, totalReports,
        activeWorkers: activeWorkers.size,
        systemUptime: process.uptime(),
        lastTest: lastTest?.startTime || null,
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
      },
      activity: Object.values(dayMap)
    });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Tests admin (tous, avec filtres + pagination)
app.get('/admin/tests', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { status, limit = 50, offset = 0, startDate, endDate } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status.toUpperCase();
    if (startDate) filter.startTime = { $gte: new Date(startDate).toISOString() };
    if (endDate)   filter.startTime = { ...(filter.startTime || {}), $lte: new Date(endDate).toISOString() };

    const [tests, total] = await Promise.all([
      TestResult.find(filter, { _id: 0, __v: 0, logs: 0 })
        .sort({ startTime: -1 })
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .lean(),
      TestResult.countDocuments(filter)
    ]);
    res.json({ tests, total });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Forcer arrêt d'un test (admin)
app.post('/admin/tests/:id/stop', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const testId = parseInt(req.params.id);
    const worker = activeWorkers.get(testId);
    if (worker) { worker.terminate(); activeWorkers.delete(testId); }
    const endTime = new Date().toISOString();
    await TestResult.updateOne(
      { id: testId },
      { $set: { status: 'STOPPED', endTime }, $push: { logs: `[${endTime}] Arrêté par admin: ${req.user.username}` } }
    );
    await addAuditLog('ADMIN_FORCE_STOP_TEST', req, { testId });
    res.json({ message: 'Test arrêté' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Supprimer un test (admin)
app.delete('/admin/tests/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await TestResult.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ error: 'Test non trouvé' });
    await addAuditLog('DELETE_TEST', req, { testId: id });
    res.json({ message: 'Test supprimé' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Suppression en masse des tests
app.delete('/admin/tests', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { status, before } = req.body;
    const filter = {};
    if (status && status !== 'all') filter.status = status.toUpperCase();
    if (before)  filter.startTime = { $lte: new Date(before).toISOString() };
    if (!Object.keys(filter).length) {
      return res.status(400).json({ error: 'Filtre requis (status ou before)' });
    }
    const result = await TestResult.deleteMany(filter);
    await addAuditLog('BULK_DELETE_TESTS', req, { filter, deleted: result.deletedCount });
    res.json({ message: `${result.deletedCount} test(s) supprimé(s)` });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Analytics ────────────────────────────────────────────────────────────────

app.get('/admin/analytics', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { period = '30' } = req.query; // jours
    const days   = parseInt(period) || 30;
    const since  = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

    // ── Produits les plus testés ──────────────────────────────────────────────
    const testsByProduct = await TestResult.aggregate([
      { $match: { startTime: { $gte: since } } },
      { $group: {
          _id: '$produitId',
          total:   { $sum: 1 },
          success: { $sum: { $cond: [{ $eq: ['$status','SUCCESS'] }, 1, 0] } },
          fail:    { $sum: { $cond: [{ $eq: ['$status','FAIL'] }, 1, 0] } }
      }},
      { $sort: { total: -1 } },
      { $limit: 8 }
    ]);

    // Récupère les noms des produits
    const produitIds = testsByProduct.map(p => p._id).filter(Boolean);
    const produits   = await Produit.find({ id: { $in: produitIds } }, { id:1, nom:1, _id:0 }).lean();
    const prodMap    = Object.fromEntries(produits.map(p => [p.id, p.nom]));

    const productStats = testsByProduct.map(p => ({
      produitId:   p._id,
      nom:         prodMap[p._id] || `Produit #${p._id}`,
      total:       p.total,
      success:     p.success,
      fail:        p.fail,
      successRate: p.total > 0 ? Math.round(p.success / p.total * 100) : 0
    }));

    // ── Tests par utilisateur (via audit logs RUN_TEST / RUN_SEQUENCE) ────────
    const testsByUser = await AuditLog.aggregate([
      { $match: {
          timestamp: { $gte: since },
          action:    { $in: ['RUN_TEST','RUN_SEQUENCE'] }
      }},
      { $group: { _id: '$username', tests: { $sum: 1 } } },
      { $sort: { tests: -1 } }
    ]);

    // ── Nombre de sessions par user dans la période (via audit logs LOGIN) ────
    const loginCountAgg = await AuditLog.aggregate([
      { $match: { timestamp: { $gte: since }, action: 'LOGIN' } },
      { $group: { _id: '$username', sessions: { $sum: 1 } } }
    ]);
    const sessionCountMap = Object.fromEntries(loginCountAgg.map(u => [u._id, u.sessions]));

    // ── Temps total cumulé stocké directement sur le User ────────────────────
    // On récupère tous les users actifs + session en cours (loginTimestamp présent)
    const allUsers = await User.find(
      {},
      { username:1, role:1, statut:1, totalTimeMinutes:1, loginTimestamp:1, _id:0 }
    ).lean();

    // Pour les users actuellement connectés, on ajoute le temps depuis loginTimestamp
    const allUsernamesSet = new Set([
      ...testsByUser.map(u => u._id),
      ...allUsers.map(u => u.username)
    ]);

    const userMeta = Object.fromEntries(allUsers.map(u => {
      let minutes = u.totalTimeMinutes || 0;
      if (u.loginTimestamp) {
        const activeMs = Date.now() - new Date(u.loginTimestamp).getTime();
        if (activeMs > 0 && activeMs < 24 * 3600 * 1000) {
          minutes += activeMs / 60000;
        }
      }
      return [u.username, { ...u, currentTotalMinutes: minutes }];
    }));

    const userStats = [...allUsernamesSet]
      .filter(Boolean)
      .map(username => {
        const t = testsByUser.find(u => u._id === username);
        const m = userMeta[username];
        return {
          username,
          role:         m?.role   || '?',
          statut:       m?.statut || 'actif',
          totalTests:   t?.tests  || 0,
          sessions:     sessionCountMap[username] || 0,
          totalMinutes: Math.round(m?.currentTotalMinutes || 0)
        };
      })
      .filter(u => u.totalTests > 0 || u.totalMinutes > 0)
      .sort((a, b) => b.totalTests - a.totalTests);

    // ── Activité quotidienne par statut (14 jours) ────────────────────────────
    const since14 = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const daily   = await TestResult.find(
      { startTime: { $gte: since14 } },
      { startTime:1, status:1, _id:0 }
    ).lean();

    const dayMap = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0,10);
      dayMap[d] = { date: d, total: 0, success: 0, fail: 0 };
    }
    daily.forEach(t => {
      const day = t.startTime?.slice(0,10);
      if (dayMap[day]) {
        dayMap[day].total++;
        if (t.status === 'SUCCESS') dayMap[day].success++;
        if (t.status === 'FAIL')    dayMap[day].fail++;
      }
    });

    res.json({
      period:       days,
      productStats,
      userStats,
      dailyActivity: Object.values(dayMap)
    });
  } catch (e) {
    console.error('Analytics error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/admin/system-logs', authenticateToken, requireRole('admin'), requirePermission('view_logs'), async (req, res) => {
  res.json({
    message: 'Logs système',
    logs: [
      { timestamp: new Date().toISOString(),                 level: 'INFO',    message: 'Système opérationnel',             component: 'system' },
      { timestamp: new Date(Date.now()-60000).toISOString(), level: 'INFO',    message: 'Connexion utilisateur établie',    component: 'auth' },
      { timestamp: new Date(Date.now()-120000).toISOString(),level: 'WARNING', message: 'Test terminé avec avertissements', component: 'test-engine' }
    ],
    total: 3
  });
});

// ─── Rapports ─────────────────────────────────────────────────────────────────

app.get('/reports', authenticateToken, requirePermission('read'), async (req, res) => {
  try {
    const reports = await Report.find({}, { _id: 0, __v: 0 }).sort({ createdAt: -1 }).lean();
    res.json({ reports, total: reports.length });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

app.post('/reports/generate', authenticateToken, requirePermission('run_tests'), async (req, res) => {
  try {
    const { slotId, posteId, produitId, startDate, endDate, statusFilter } = req.body;
    if (!slotId || !posteId || !produitId) {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }

    const filter = {
      slotId:    parseInt(slotId),
      posteId:   parseInt(posteId),
      produitId: parseInt(produitId)
    };
    if (startDate) filter.startTime = { $gte: new Date(startDate).toISOString() };
    if (endDate)   filter.endTime   = { ...(filter.endTime || {}), $lte: new Date(endDate).toISOString() };
    if (statusFilter === 'success') filter.status = 'SUCCESS';
    if (statusFilter === 'fail')    filter.status = 'FAIL';

    const results  = await TestResult.find(filter, { _id: 0, __v: 0 }).lean();
    const reportId = `RPT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now()}`;
    const slot     = await Slot.findOne({ id: parseInt(slotId) }).lean();
    const success  = results.filter(r => r.status === 'SUCCESS').length;

    const report = {
      id: reportId,
      createdAt: new Date().toISOString(),
      deviceInfo: {
        slotId, posteId, produitId,
        adresse: slot?.adresse || '?',
        port:    slot?.port    || '?'
      },
      summary: {
        total:       results.length,
        success,
        failure:     results.filter(r => r.status === 'FAIL').length,
        successRate: results.length > 0 ? Math.round(success / results.length * 100) : 0
      },
      tests:       results,
      generatedBy: req.user.username
    };

    await Report.create(report);
    res.json({ message: 'Rapport généré', report });
  } catch (e) {
    console.error('Erreur génération rapport:', e);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

app.get('/reports/:id', authenticateToken, requirePermission('read'), async (req, res) => {
  try {
    const report = await Report.findOne({ id: req.params.id }, { _id: 0, __v: 0 }).lean();
    if (!report) return res.status(404).json({ error: 'Rapport non trouvé' });
    res.json({ report });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

app.delete('/reports/:id', authenticateToken, requirePermission('run_tests'), async (req, res) => {
  try {
    const deleted = await Report.findOneAndDelete({ id: req.params.id });
    if (!deleted) return res.status(404).json({ error: 'Rapport non trouvé' });
    res.json({ message: 'Rapport supprimé' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// ─── Metrics middleware ───────────────────────────────────────────────────────

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    httpRequestsTotal.inc({ method: req.method, route, status: res.statusCode });
    end({ method: req.method, route, status: res.statusCode });
  });
  next();
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erreur serveur interne' });
});

// ─── Démarrage ────────────────────────────────────────────────────────────────

async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(` Serveur HTTP  → http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ port: 3003 });

  wss.on('connection', (ws, req) => {
    const url   = new URL(req.url || '/', `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || req.headers.authorization?.replace('Bearer ', '');

    if (!token) { ws.close(1008, 'Token requis'); return; }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) { ws.close(1008, 'Token invalide'); return; }
      ws.user   = user;
      ws.testId = null;
      console.log(`WS connecté: ${user.username}`);

      ws.on('message', raw => {
        try {
          const data = JSON.parse(raw);

          if (data.type === 'subscribe_monitoring' && data.testId) {
            if (!monitoringClients.has(data.testId)) monitoringClients.set(data.testId, new Set());
            monitoringClients.get(data.testId).add(ws);
            ws.testId = data.testId;
            ws.send(JSON.stringify({ type: 'subscribed', testId: data.testId, message: 'Abonné au monitoring' }));
          }

          if (data.type === 'unsubscribe_monitoring' && data.testId) {
            const set = monitoringClients.get(data.testId);
            if (set) { set.delete(ws); if (set.size === 0) monitoringClients.delete(data.testId); }
            ws.testId = null;
          }
        } catch (e) { console.error('WS message error:', e); }
      });

      ws.on('close', () => {
        if (ws.testId) {
          const set = monitoringClients.get(ws.testId);
          if (set) { set.delete(ws); if (set.size === 0) monitoringClients.delete(ws.testId); }
        }
        console.log(`WS fermé: ${user.username}`);
      });
    });
  });

  console.log(` Serveur WebSocket → ws://localhost:3003`);
}

start().catch(err => {
  console.error('Échec démarrage serveur:', err);
  process.exit(1);
});
