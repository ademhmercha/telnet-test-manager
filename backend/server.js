const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'votre-secret-jeton-securise';

app.use(cors());
app.use(express.json());

// ─── Database ─────────────────────────────────────────────────────────────────

let database = JSON.parse(fs.readFileSync(path.join(__dirname, 'database.json'), 'utf8'));

function saveDatabase() {
  fs.writeFileSync(path.join(__dirname, 'database.json'), JSON.stringify(database, null, 2));
}

let saveQueue = Promise.resolve();
function saveDatabaseQueued() {
  saveQueue = saveQueue.then(() => saveDatabase()).catch(() => saveDatabase());
  return saveQueue;
}

// ─── Active workers & WebSocket clients ──────────────────────────────────────

const activeWorkers = new Map();       // testId -> Worker
const monitoringClients = new Map();   // testId -> Set<WebSocket>

// ─── Middleware ───────────────────────────────────────────────────────────────

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requis' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    const fullUser = database.users.find(u => u.id === decoded.id);
    if (!fullUser) return res.status(403).json({ error: 'Utilisateur non trouvé' });
    req.user = { ...decoded, ...fullUser };
    next();
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

function addAuditLog(action, req, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    userId: req.user?.id,
    username: req.user?.username,
    role: req.user?.role,
    action,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    ...( Object.keys(details).length > 0 ? { details } : {} )
  };
  console.log(`[AUDIT] ${JSON.stringify(entry)}`);
  if (!database.auditLogs) database.auditLogs = [];
  database.auditLogs.push(entry);
}

function auditLog(action) {
  return (req, res, next) => {
    addAuditLog(action, req);
    next();
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = database.users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  // Fake req.user for audit helper
  const fakeReq = { user, method: 'POST', originalUrl: '/login', ip: req.ip || req.connection.remoteAddress, get: (h) => req.get(h) };
  addAuditLog('LOGIN', fakeReq);
  saveDatabaseQueued();

  res.json({
    message: 'Connexion réussie',
    token,
    user: { id: user.id, username: user.username, role: user.role, email: user.email, permissions: user.permissions }
  });
});

app.post('/logout', authenticateToken, (req, res) => {
  addAuditLog('LOGOUT', req);
  saveDatabaseQueued();
  res.json({ message: 'Déconnexion enregistrée' });
});

// ─── Data endpoints ───────────────────────────────────────────────────────────

app.get('/postes', authenticateToken, requirePermission('read'), auditLog('VIEW_POSTES'), (req, res) => {
  res.json(database.postes);
});

app.get('/produits', authenticateToken, requirePermission('read'), auditLog('VIEW_PRODUITS'), (req, res) => {
  const { posteId } = req.query;
  const result = posteId
    ? database.produits.filter(p => p.posteId == posteId)
    : database.produits;
  res.json(result);
});

app.get('/slots', authenticateToken, requirePermission('read'), auditLog('VIEW_SLOTS'), (req, res) => {
  const { produitId } = req.query;
  const result = produitId
    ? database.slots.filter(s => s.produitId == produitId)
    : database.slots;
  res.json(result);
});

app.get('/references', authenticateToken, requirePermission('read'), auditLog('VIEW_REFERENCES'), (req, res) => {
  if (!Array.isArray(database.references)) return res.json([]);
  const { produitId } = req.query;
  const result = produitId
    ? database.references.filter(r => r.produitId == produitId && r.statut === 'actif')
    : database.references.filter(r => r.statut === 'actif');
  res.json(result);
});

app.get('/telnet-commands', authenticateToken, (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'telnetCommands.json'), 'utf8'));
    res.json({ message: 'Commandes Telnet disponibles', commands: data.commands });
  } catch (e) {
    console.error('Erreur lecture telnetCommands.json:', e);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── WebSocket broadcast ──────────────────────────────────────────────────────

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
// Dashboard calls this with:
//   Mode simple  : { slotId, posteId, produitId, commandId }
//   Mode séquence: { slotId, posteId, produitId, commands: SequenceStep[] }
//
// telnetCommands.json supports:
//   type "single"    – command field, execute once
//   type "monitoring"– command field, stream data
//   type "sequence"  – steps[] array (each step has command, expectedResponse, timeout, description)

app.post('/run-test', authenticateToken, requirePermission('run_tests'), async (req, res) => {
  const { slotId, posteId, produitId, commandId, commands, monitorDurationMs } = req.body;

  if (!slotId || !posteId || !produitId) {
    return res.status(400).json({ error: 'Paramètres manquants: slotId, posteId, produitId requis' });
  }

  // Dashboard sequence mode sends `commands` array of SequenceStep
  // Dashboard single mode sends `commandId`
  const isDashboardSequence = Array.isArray(commands) && commands.length > 0;
  const isSingleCommand     = !isDashboardSequence && !!commandId;

  if (!isDashboardSequence && !isSingleCommand) {
    return res.status(400).json({ error: 'commandId ou commands[] requis' });
  }

  // Find slot (slots is always an array)
  const slot = database.slots.find(s => s.id == slotId);
  if (!slot) return res.status(404).json({ error: `Slot ${slotId} non trouvé` });

  // Load telnet commands config
  let telnetConfig = { commands: [] };
  try {
    telnetConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'telnetCommands.json'), 'utf8'));
  } catch (e) {
    console.error('Erreur lecture telnetCommands.json:', e);
  }

  // ── Resolve what to run ────────────────────────────────────────────────────

  let runMode;    // 'single' | 'monitoring' | 'sequence' | 'builtin_sequence'
  let commandConfig = null;  // TelnetCommand object from JSON

  if (isSingleCommand) {
    commandConfig = telnetConfig.commands.find(c => c.id === commandId);
    if (!commandConfig) return res.status(404).json({ error: `Commande '${commandId}' non trouvée` });

    if (commandConfig.type === 'sequence') {
      runMode = 'builtin_sequence'; // sequence defined in telnetCommands.json
    } else if (commandConfig.type === 'monitoring') {
      runMode = 'monitoring';
    } else {
      runMode = 'single';
    }

    // Pour les commandes de monitoring en mode simple, permettre au frontend de
    // surcharger la durée via monitorDurationMs (en millisecondes).
    if (runMode === 'monitoring' && typeof monitorDurationMs === 'number' && monitorDurationMs > 0) {
      commandConfig = {
        ...commandConfig,
        duration: monitorDurationMs
      };
    }
  } else {
    // Dashboard built its own sequence from individual commandIds
    runMode = 'sequence';
  }

  // ── Audit ──────────────────────────────────────────────────────────────────

  addAuditLog(runMode === 'single' ? 'RUN_TEST' : 'RUN_SEQUENCE', req, {
    slotId, posteId, produitId,
    commandId: commandId || null,
    steps: isDashboardSequence ? commands.length : (commandConfig?.steps?.length || 1)
  });
  saveDatabaseQueued();

  // ── Build initial steps for UI ─────────────────────────────────────────────

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
    // single / monitoring – show the standard 5 connection steps
    testSteps = [
      { step: 1, description: 'Initialisation de la connexion',   status: 'PENDING', timestamp: startTime },
      { step: 2, description: 'Connexion au serveur',              status: 'PENDING', timestamp: startTime },
      { step: 3, description: 'Authentification Telnet',           status: 'PENDING', timestamp: startTime },
      { step: 4, description: `Exécution: ${commandConfig.command}`, status: 'PENDING', timestamp: startTime },
      { step: 5, description: 'Analyse des résultats',             status: 'PENDING', timestamp: startTime }
    ];
  }

  // ── Persist initial record ─────────────────────────────────────────────────

  const initialRecord = {
    id: testId,
    slotId: parseInt(slotId),
    posteId: parseInt(posteId),
    produitId: parseInt(produitId),
    commandId: commandId || null,
    runMode,
    status: 'PENDING',
    startTime,
    endTime: null,
    steps: testSteps,
    logs: [`[${startTime}] Démarrage ${runMode} sur ${slot.adresse}:${slot.port}`]
  };

  database.testResults.push(initialRecord);
  await saveDatabaseQueued();

  // ── Helper: find record & update ───────────────────────────────────────────

  const updateRecord = async (fn) => {
    const idx = database.testResults.findIndex(r => r.id === testId);
    if (idx === -1) return;
    fn(database.testResults[idx]);
    await saveDatabaseQueued();
  };

  // ── Launch worker ──────────────────────────────────────────────────────────

  // Pass everything the worker needs
  const workerData = {
    testId,
    startTime,
    slotId: parseInt(slotId),
    runMode,
    // For single/monitoring:
    commandConfig: (runMode === 'single' || runMode === 'monitoring') ? commandConfig : null,
    // For builtin_sequence (from telnetCommands.json):
    builtinSteps: runMode === 'builtin_sequence' ? commandConfig.steps : null,
    // For dashboard-built sequence:
    dashboardCommands: runMode === 'sequence' ? commands : null,
    // Always include full telnet command list so worker can resolve commandIds
    telnetCommandsList: telnetConfig.commands
  };

  const worker = new Worker(path.join(__dirname, 'testWorker.js'), { workerData });
  activeWorkers.set(testId, worker);

  worker.on('message', (msg) => {
    if (!msg?.type) return;

    switch (msg.type) {
      case 'log':
        updateRecord(r => { if (msg.message) r.logs.push(msg.message); });
        break;

      case 'step':
        // stepIndex is 0-based
        updateRecord(r => {
          if (typeof msg.stepIndex === 'number' && r.steps[msg.stepIndex]) {
            r.steps[msg.stepIndex].status    = msg.status;
            r.steps[msg.stepIndex].timestamp = msg.timestamp || new Date().toISOString();
          }
          if (msg.log) r.logs.push(msg.log);
        });
        break;

      case 'monitoringEvent':
        broadcastMonitoringEvent(testId, msg.event);
        updateRecord(r => { if (msg.log) r.logs.push(msg.log); });
        break;

      case 'completed':
        updateRecord(r => {
          r.status  = msg.success ? 'SUCCESS' : 'FAIL';
          r.endTime = msg.endTime ? new Date(msg.endTime).toISOString() : new Date().toISOString();
          r.logs.push(`[${r.endTime}] Terminé: ${r.status}${msg.error ? ' – ' + msg.error : ''}`);
          // Finalise any steps still PENDING or RUNNING
          r.steps.forEach(s => {
            if (s.status === 'PENDING' || s.status === 'RUNNING') {
              s.status = msg.success ? 'SUCCESS' : 'FAIL';
            }
          });
        });
        activeWorkers.delete(testId);
        break;

      case 'error':
        updateRecord(r => {
          r.status  = 'FAIL';
          r.endTime = new Date().toISOString();
          r.logs.push(`[${r.endTime}] Erreur worker: ${msg.message}`);
        });
        activeWorkers.delete(testId);
        break;

      default:
        break;
    }
  });

  worker.on('error', err => {
    const endTime = new Date().toISOString();
    updateRecord(r => {
      r.status  = 'FAIL';
      r.endTime = endTime;
      r.logs.push(`[${endTime}] Erreur worker: ${err.message}`);
    });
    activeWorkers.delete(testId);
  });

  worker.on('exit', code => {
    if (code !== 0) {
      const endTime = new Date().toISOString();
      updateRecord(r => {
        if (r.status === 'PENDING' || r.status === 'RUNNING') {
          r.status  = 'FAIL';
          r.endTime = endTime;
          r.logs.push(`[${endTime}] Worker exit inattendu, code: ${code}`);
        }
      });
    }
    activeWorkers.delete(testId);
  });

  // ── Response to Dashboard ──────────────────────────────────────────────────

  res.json({
    message: runMode === 'single' ? 'Test démarré' : 'Séquence démarrée',
    testId,
    steps: testSteps,
    estimatedDuration: runMode === 'monitoring' ? 'Continu' : `~${testSteps.length * 5}s`,
    isMonitoring: runMode === 'monitoring',
    hasMonitoringCommands: runMode === 'sequence' && commands.some(s => {
      const cfg = telnetConfig.commands.find(c => c.id === s.commandId);
      return s.type === 'monitoring' || cfg?.type === 'monitoring';
    })
  });
});

// ─── Test results ─────────────────────────────────────────────────────────────

app.get('/test-results', authenticateToken, (req, res) => {
  const { slotId, posteId, produitId, limit = 10 } = req.query;
  let results = [...database.testResults];
  if (slotId)    results = results.filter(r => r.slotId    == slotId);
  if (posteId)   results = results.filter(r => r.posteId   == posteId);
  if (produitId) results = results.filter(r => r.produitId == produitId);
  results = results
    .sort((a, b) => new Date(b.endTime || b.startTime) - new Date(a.endTime || a.startTime))
    .slice(0, parseInt(limit));
  res.json(results);
});

app.get('/test-results/:id', authenticateToken, (req, res) => {
  const test = database.testResults.find(r => r.id == req.params.id);
  if (!test) return res.status(404).json({ error: 'Test non trouvé' });
  res.json(test);
});

// ─── Stop endpoints ───────────────────────────────────────────────────────────

app.post('/stop-test', authenticateToken, requirePermission('run_tests'), (req, res) => {
  const { testId } = req.body;
  if (!testId) return res.status(400).json({ error: 'testId requis' });

  const worker = activeWorkers.get(parseInt(testId));
  if (worker) { worker.terminate(); activeWorkers.delete(parseInt(testId)); }

  const idx = database.testResults.findIndex(r => r.id == testId);
  if (idx === -1) return res.status(404).json({ error: 'Test non trouvé' });

  const endTime = new Date().toISOString();
  const record  = database.testResults[idx];
  record.status  = 'STOPPED';
  record.endTime = endTime;
  record.steps.forEach(s => {
    if (s.status === 'PENDING' || s.status === 'RUNNING') s.status = 'STOPPED';
  });
  record.logs.push(`[${endTime}] Test arrêté par ${req.user.username}`);

  addAuditLog('STOP_TEST', req, { testId: parseInt(testId) });
  saveDatabaseQueued();

  res.json({ message: 'Test arrêté', testId: parseInt(testId), status: 'STOPPED' });
});

// Alias used by Dashboard for monitoring specifically
app.post('/stop-monitoring', authenticateToken, requirePermission('run_tests'), (req, res) => {
  const { testId } = req.body;
  if (!testId) return res.status(400).json({ error: 'testId requis' });

  const worker = activeWorkers.get(parseInt(testId));
  if (!worker) return res.status(404).json({ error: 'Monitoring non trouvé ou déjà arrêté' });

  worker.terminate();
  activeWorkers.delete(parseInt(testId));

  const idx = database.testResults.findIndex(r => r.id == testId);
  if (idx !== -1) {
    const endTime = new Date().toISOString();
    database.testResults[idx].status  = 'STOPPED';
    database.testResults[idx].endTime = endTime;
    database.testResults[idx].logs.push(`[${endTime}] Monitoring arrêté par ${req.user.username}`);
    saveDatabaseQueued();
  }

  res.json({ message: 'Monitoring arrêté', testId: parseInt(testId), status: 'STOPPED' });
});

// ─── Admin endpoints ──────────────────────────────────────────────────────────

app.get('/admin/audit-logs', authenticateToken, requireRole('admin'), requirePermission('audit'), (req, res) => {
  const logs = (database.auditLogs || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ message: "Logs d'audit", logs, total: logs.length });
});

app.get('/admin/users', authenticateToken, requireRole('admin'), requirePermission('manage_users'), auditLog('VIEW_USERS'), (req, res) => {
  const users = database.users.map(({ password, ...u }) => u);
  res.json({ message: 'Utilisateurs', users, total: users.length });
});

app.get('/admin/stats', authenticateToken, requireRole('admin'), requirePermission('audit'), auditLog('VIEW_STATS'), (req, res) => {
  const t = database.testResults;
  res.json({
    message: 'Statistiques',
    stats: {
      totalTests:       t.length,
      successfulTests:  t.filter(x => x.status === 'SUCCESS').length,
      failedTests:      t.filter(x => x.status === 'FAIL').length,
      pendingTests:     t.filter(x => x.status === 'PENDING').length,
      totalUsers:       database.users.length,
      activeUsers:      database.users.filter(u => ['admin','engineer'].includes(u.role)).length,
      systemUptime:     process.uptime(),
      lastTest:         t.length > 0 ? t[t.length - 1].startTime : null
    }
  });
});

app.get('/admin/system-logs', authenticateToken, requireRole('admin'), requirePermission('view_logs'), auditLog('VIEW_SYSTEM_LOGS'), (req, res) => {
  res.json({
    message: 'Logs système',
    logs: [
      { timestamp: new Date().toISOString(),              level: 'INFO',    message: 'Système opérationnel',               component: 'system' },
      { timestamp: new Date(Date.now()-60000).toISOString(), level: 'INFO', message: 'Connexion utilisateur établie',      component: 'auth' },
      { timestamp: new Date(Date.now()-120000).toISOString(),level: 'WARNING', message: 'Test terminé avec avertissements',component: 'test-engine' }
    ],
    total: 3
  });
});

// ─── Reports ──────────────────────────────────────────────────────────────────

const reportsDir = path.join(__dirname, 'reports');

app.get('/reports', authenticateToken, requirePermission('read'), (req, res) => {
  try {
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    const reports = fs.readdirSync(reportsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(reportsDir, f), 'utf8')); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ reports, total: reports.length });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

app.post('/reports/generate', authenticateToken, requirePermission('run_tests'), (req, res) => {
  try {
    const { slotId, posteId, produitId, startDate, endDate } = req.body;
    if (!slotId || !posteId || !produitId) return res.status(400).json({ error: 'Paramètres manquants' });

    let results = database.testResults.filter(r => r.slotId == slotId && r.posteId == posteId && r.produitId == produitId);
    if (startDate) results = results.filter(r => new Date(r.startTime) >= new Date(startDate));
    if (endDate)   results = results.filter(r => new Date(r.endTime || r.startTime) <= new Date(endDate));

    const reportId  = `RPT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Date.now()}`;
    const slot      = database.slots.find(s => s.id == slotId);
    const success   = results.filter(r => r.status === 'SUCCESS').length;

    const report = {
      id: reportId, createdAt: new Date().toISOString(),
      deviceInfo: { slotId, posteId, produitId, adresse: slot?.adresse || '?', port: slot?.port || '?' },
      summary: { total: results.length, success, failure: results.filter(r => r.status === 'FAIL').length,
                 successRate: results.length > 0 ? Math.round(success / results.length * 100) : 0 },
      tests: results, generatedBy: req.user.username
    };

    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, `${reportId}.json`), JSON.stringify(report, null, 2));
    res.json({ message: 'Rapport généré', report });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

app.get('/reports/:id', authenticateToken, requirePermission('read'), (req, res) => {
  try {
    const p = path.join(reportsDir, `${req.params.id}.json`);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'Rapport non trouvé' });
    res.json({ report: JSON.parse(fs.readFileSync(p, 'utf8')) });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

app.delete('/reports/:id', authenticateToken, requirePermission('run_tests'), (req, res) => {
  try {
    const p = path.join(reportsDir, `${req.params.id}.json`);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'Rapport non trouvé' });
    fs.unlinkSync(p);
    res.json({ message: 'Rapport supprimé' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erreur serveur interne' });
});

// ─── HTTP listen ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(` Serveur HTTP  → http://localhost:${PORT}`);
});

// ─── WebSocket server (port 3003) ─────────────────────────────────────────────

const wss = new WebSocketServer({ port: 3003 });

wss.on('connection', (ws, req) => {
  const url   = new URL(req.url || '/', `http://${req.headers.host}`);
  const token = url.searchParams.get('token') || req.headers.authorization?.replace('Bearer ', '');

  if (!token) { ws.close(1008, 'Token requis'); return; }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) { ws.close(1008, 'Token invalide'); return; }
    ws.user   = user;
    ws.testId = null;
    console.log(`🔌 WS connecté: ${user.username}`);

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
      console.log(`🔌 WS fermé: ${user.username}`);
    });
  });
});

console.log(` Serveur WebSocket → ws://localhost:3003`);