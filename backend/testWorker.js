const { isMainThread, parentPort, workerData } = require('worker_threads');
const { Telnet } = require('telnet-client');
const fs = require('fs');
const path = require('path');

if (isMainThread) {
  throw new Error('Ce script doit être exécuté en tant que worker thread');
}

// ─── Builtin sequence (steps contain raw command strings) ─────────────────────

async function executeBuiltinSequence(connection, steps, testId) {

  let hadError = false;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const cmd = step?.command;
    if (!cmd) {
      postStep(testId, i, 'FAIL', `Étape invalide: commande manquante`);
      throw new Error('Étape invalide: commande manquante');
    }

    const desc = step.description || cmd;
    postStep(testId, i, 'RUNNING', desc);
    postLog(testId, `Étape ${i + 1}/${steps.length}: ${desc}`);

    try {
      const commandObj = {
        id: `builtin-${i}`,
        type: step.type || 'single',
        command: cmd,
        expectedResponse: step.expectedResponse,
        expectedEvents: step.expectedEvents
      };
      let stepSuccess = true;
      if (isMonitoringCommand(commandObj)) {
        stepSuccess = await executeMonitoringCommand(connection, commandObj, testId, step.duration || 60000);
      } else {
        await executeStandardCommand(connection, commandObj, testId);
      }
      if (stepSuccess) {
        postStep(testId, i, 'SUCCESS', desc);
      } else {
        postStep(testId, i, 'FAIL', desc);
        hadError = true;
      }
    } catch (error) {
      postStep(testId, i, 'FAIL', `${desc}: ${error.message}`);
      hadError = true;
      // Ne pas interrompre toute la séquence : on continue avec l'étape suivante.
    }
  }

  if (hadError) {
    postLog(testId, 'Séquence intégrée terminée avec erreurs');
    return false;
  } else {
    postLog(testId, 'Séquence intégrée terminée avec succès');
    return true;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function postLog(testId, message) {
  parentPort.postMessage({ type: 'log', testId, message: `[${new Date().toISOString()}] ${message}` });
}

function postStep(testId, stepIndex, status, description) {
  const ts = new Date().toISOString();
  const msg = { type: 'step', testId, stepIndex, status, timestamp: ts };
  // Ne journaliser que les résultats finaux, pas les états RUNNING intermédiaires
  if (status !== 'RUNNING') {
    msg.log = `[${ts}] ${description} → ${status}`;
  }
  parentPort.postMessage(msg);
}

function postCompleted(testId, success, errorMsg) {
  parentPort.postMessage({
    type: 'completed',
    testId,
    endTime: Date.now(),
    success,
    error: errorMsg || undefined
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const {
    testId,
    startTime,
    commandId: legacyCommandId,
    commands: legacyCommands,
    slotId,
    runMode,
    commandConfig,
    builtinSteps,
    dashboardCommands,
    telnetCommandsList
  } = workerData;

  let database;
  try {
    database = JSON.parse(fs.readFileSync(path.join(__dirname, 'database.json'), 'utf8'));
  } catch (e) {
    postCompleted(testId, false, `Impossible de lire database.json: ${e.message}`);
    return;
  }

  // *** FIX: database.slots is an ARRAY, not an object ***
  const slot = Array.isArray(database.slots)
    ? database.slots.find(s => s.id == slotId)
    : Object.values(database.slots).find(s => s.id == slotId);

  if (!slot) {
    postCompleted(testId, false, `Slot non trouvé (slotId=${slotId})`);
    return;
  }

  // telnetCommands list can come from server.js (preferred), otherwise fall back to file
  let telnetCommands = { commands: [] };
  if (Array.isArray(telnetCommandsList)) {
    telnetCommands = { commands: telnetCommandsList };
  } else {
    try {
      telnetCommands = JSON.parse(fs.readFileSync(path.join(__dirname, 'telnetCommands.json'), 'utf8'));
    } catch (e) {
      postLog(testId, `Avertissement: impossible de lire telnetCommands.json: ${e.message}`);
    }
  }

  // Support both legacy workerData format and the new server.js format
  const effectiveCommandId = legacyCommandId || commandConfig?.id || null;
  const effectiveCommands = Array.isArray(legacyCommands) && legacyCommands.length > 0
    ? legacyCommands
    : (Array.isArray(dashboardCommands) && dashboardCommands.length > 0 ? dashboardCommands : null);

  const connection = new Telnet();
  let globalSuccess = true;

  try {
    // Step 1 – Init
    postStep(testId, 0, 'RUNNING', 'Initialisation de la connexion');

    const connectionParams = {
      host: slot.adresse,
      port: slot.port,
      timeout: 15000,
      shellPrompt: /#\s*$/,          // prompt type "root@host:~# "
      loginPrompt: /login:\s*$/,     // "f5686b login:"
      passwordPrompt: /Password:\s*$/, // "Password:"
      username: 'root',
      password: 'root',
      // IMPORTANT: on attend que la négociation + login soient terminés
      // et que le prompt soit visible avant de lancer les commandes.
      negotiationMandatory: true,
      initialLFCR: true,
      execTimeout: 60000,
      irs: '\r\n',
      ors: '\r\n',
      // Nettoyage de base pour limiter les caractères de contrôle dans les logs
      newlineReplace: '\n',
      stripControls: true,
      // Ne pas supprimer automatiquement la première ligne de sortie.
      echoLines: 0
    };

    postStep(testId, 0, 'SUCCESS', 'Initialisation de la connexion');

    // Step 2 – Connect
    postStep(testId, 1, 'RUNNING', 'Tentative de connexion au serveur');
    await connection.connect(connectionParams);
    postStep(testId, 1, 'SUCCESS', 'Tentative de connexion au serveur');
    postLog(testId, `Connexion établie avec ${slot.adresse}:${slot.port}`);

    // Step 4 – Execute
    postStep(testId, 3, 'RUNNING', 'Exécution de la commande / séquence');

    if (Array.isArray(builtinSteps) && builtinSteps.length > 0) {
      // ── Builtin sequence mode (defined in telnetCommands.json) ──
      globalSuccess = await executeBuiltinSequence(connection, builtinSteps, testId);
    } else if (Array.isArray(effectiveCommands) && effectiveCommands.length > 0) {
      // ── Dashboard-built sequence mode ──
      globalSuccess = await executeSequence(connection, effectiveCommands, telnetCommands, testId, slot);
    } else if (effectiveCommandId) {
      // ── Single command mode ──
      globalSuccess = await executeSingleCommand(connection, effectiveCommandId, telnetCommands, testId, commandConfig);
    } else {
      throw new Error('Aucune commande ou séquence spécifiée');
    }

    postStep(testId, 3, globalSuccess ? 'SUCCESS' : 'FAIL', 'Exécution de la commande / séquence');

    postCompleted(testId, globalSuccess);

  } catch (error) {
    postLog(testId, `Erreur: ${error.message}`);
    postCompleted(testId, false, error.message);
  } finally {
    try { await connection.end(); } catch (_) {}
  }
}

// ─── Single command ───────────────────────────────────────────────────────────

async function executeSingleCommand(connection, commandId, telnetCommands, testId, directCommandConfig = null) {
  const command = directCommandConfig && directCommandConfig.id === commandId
    ? directCommandConfig
    : telnetCommands.commands.find(c => c.id === commandId);
  if (!command) throw new Error(`Commande non trouvée: ${commandId}`);

  postLog(testId, `Exécution: ${command.command}`);

  const isMonitoring = isMonitoringCommand(command);

  if (isMonitoring) {
    // Durée prioritaire:
    // 1) duration (ms) définie sur la commande
    // 2) timeout éventuel
    // 3) défaut: 60s
    const monitorDuration =
      (typeof command.duration === 'number' && command.duration > 0 && command.duration) ||
      (typeof command.timeout === 'number' && command.timeout > 0 && command.timeout) ||
      60000;

    return await executeMonitoringCommand(connection, command, testId, monitorDuration);
  } else {
    await executeStandardCommand(connection, command, testId);
    return true;
  }
}

// ─── Sequence ─────────────────────────────────────────────────────────────────

async function executeSequence(connection, commands, telnetCommands, testId, slot) {

  let hadError = false;

  for (let i = 0; i < commands.length; i++) {
    const step = commands[i];
    const command = telnetCommands.commands.find(c => c.id === step.commandId);

    if (!command) {
      postStep(testId, i, 'FAIL', `Commande non trouvée: ${step.commandId}`);
      hadError = true;
      continue;
    }

    postStep(testId, i, 'RUNNING', command.description || command.command);
    postLog(testId, `Étape ${i + 1}/${commands.length}: ${command.description || command.command}`);

    try {
      let stepSuccess = true;
      if (isMonitoringCommand(command)) {
        stepSuccess = await executeMonitoringCommand(connection, command, testId, step.duration || 60000);
      } else {
        await executeStandardCommand(connection, command, testId);
      }
      if (stepSuccess) {
        postStep(testId, i, 'SUCCESS', command.description || command.command);
      } else {
        postStep(testId, i, 'FAIL', command.description || command.command);
        hadError = true;
      }
    } catch (error) {
      postStep(testId, i, 'FAIL', `${command.description || command.command}: ${error.message}`);
      hadError = true;
      // On continue la séquence pour exécuter les autres commandes.
    }
  }

  if (hadError) {
    postLog(testId, 'Séquence terminée avec erreurs');
    return false;
  } else {
    postLog(testId, 'Séquence terminée avec succès');
    return true;
  }
}

// ─── Standard command execution ───────────────────────────────────────────────

async function executeStandardCommand(connection, command, testId) {
  const cmd = command?.command;
  const isReboot = command?.id === 'reboot' || (typeof cmd === 'string' && cmd.trim().toLowerCase() === 'reboot');

  try {
    const timeout = command?.timeout || 15000;

    // Utilise `send` + `waitFor` plutôt que `exec`, pour capturer
    // tout ce qui est affiché jusqu'au prochain prompt (#).
    const response = await connection.send(cmd, {
      ors: '\r\n',
      waitFor: /#\s*$/,
      sendTimeout: timeout,
      newlineReplace: '\n'
    });

    // Nettoyage de la sortie brute (suppression des \r, gestion de l'éventuel écho de commande)
    const raw = (response || '').toString().replace(/\r/g, '');
    let lines = raw.split('\n');

    const trimmedCmd = (cmd || '').trim();
    if (lines.length > 0 && trimmedCmd && lines[0].trim().startsWith(trimmedCmd)) {
      // Première ligne = écho de la commande → on la retire
      lines.shift();
    }

    const cleaned = lines.join('\n').trim();
    const preview = cleaned
      ? cleaned.substring(0, 300) + (cleaned.length > 300 ? '...' : '')
      : '(pas de réponse)';

    postLog(testId, `Réponse: ${preview}`);

    // Détection simple des erreurs renvoyées par l'équipement
    const lower = cleaned.toLowerCase();
    if (
      /fatal[:\s]/i.test(cleaned) ||
      lower.includes('does not match any interface') ||
      lower.includes('command not found') ||
      lower.includes('no such file') ||
      lower.includes('not found in') ||
      /wl:.*adapter not found/i.test(cleaned) ||   // cas WiFi: "wl: wl driver adapter not found"
      lower.includes('adapter not found')
    ) {
      throw new Error(`Erreur détectée dans la réponse: ${preview}`);
    }

    // Si une réponse attendue est définie (séquences intégrées), on la vérifie
    if (command?.expectedResponse) {
      if (!cleaned.includes(command.expectedResponse)) {
        throw new Error(`Réponse inattendue (attendu: "${command.expectedResponse}")`);
      }
    }

    return cleaned;
  } catch (err) {
    // reboot often closes the connection immediately; treat this as success
    if (isReboot) {
      postLog(testId, `Commande reboot envoyée. La connexion peut se fermer pendant le redémarrage (considéré comme succès). Détail: ${err.message}`);
      return '';
    }
    throw err;
  }
}

// ─── Monitoring command execution ─────────────────────────────────────────────

function isMonitoringCommand(command) {
  return command.type === 'monitoring' ||
    (command.command && (
      command.command.includes('monitor') ||
      command.command.includes('keys') ||
      command.command.includes('events')
    ));
}

async function executeMonitoringCommand(connection, command, testId, duration = 60000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let active = true;
    const receivedEvents = [];

    postLog(testId, `Monitoring démarré (durée: ${duration}ms) – commande: ${command.command}`);

    const handleData = (data) => {
      try {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;

          receivedEvents.push(trimmed);

          parentPort.postMessage({
            type: 'monitoringEvent',
            testId,
            event: { timestamp: new Date().toISOString(), data: trimmed, command: command.command },
            log: `[${new Date().toISOString()}] Monitoring: ${trimmed}`
          });
        });
      } catch (e) {
        console.error('Erreur traitement données monitoring:', e);
      }
    };

    connection.on('data', handleData);

    // Envoie la commande de monitoring en "fire-and-forget" sans changer l'état interne en "response"
    // afin que les événements 'data' continuent d'être émis pendant tout le streaming.
    connection.send(command.command, {
      ors: '\r\n',
      sendTimeout: 1000
    }).catch(() => {
      // On ignore les erreurs d'envoi ponctuelles : si la socket tombe,
      // l'événement 'error' ou 'close' ci‑dessous se chargera de terminer proprement.
    });

    const timer = setTimeout(() => {
      if (!active) return;
      active = false;
      connection.removeListener('data', handleData);
      postLog(testId, 'Monitoring terminé (durée écoulée)');

      // Vérification des événements attendus
      if (command.expectedEvents && command.expectedEvents.length > 0) {
        const missing = command.expectedEvents.filter(expected =>
          !receivedEvents.some(received => received.includes(expected))
        );
        if (missing.length > 0) {
          postLog(testId, `Événements manquants: ${missing.join(', ')}`);
          resolve(false);
        } else {
          postLog(testId, `Tous les événements attendus reçus: ${command.expectedEvents.join(', ')}`);
          resolve(true);
        }
      } else {
        resolve(true);
      }
    }, duration);

    connection.once('error', (err) => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      connection.removeListener('data', handleData);
      reject(err);
    });

    connection.once('close', () => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      connection.removeListener('data', handleData);
      resolve(true);
    });
  });
}

// ─── Entry point ──────────────────────────────────────────────────────────────

run().catch(error => {
  parentPort.postMessage({
    type: 'completed',
    testId: workerData?.testId || 0,
    endTime: Date.now(),
    success: false,
    error: error.message
  });
});
