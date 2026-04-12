class RunTestUseCase {
  constructor(testResultRepository, slotRepository, telnetCommandRepository, auditLogRepository, testWorkerManager, metrics) {
    this._testResultRepo       = testResultRepository;
    this._slotRepo             = slotRepository;
    this._telnetCommandRepo    = telnetCommandRepository;
    this._auditLogRepo         = auditLogRepository;
    this._testWorkerManager    = testWorkerManager;
    this._metrics              = metrics;
  }

  async execute({ slotId, posteId, produitId, commandId, commands, monitorDurationMs }, auditContext) {
    this._metrics.testsLaunched.inc();

    if (!slotId || !posteId || !produitId) {
      const err = new Error('Paramètres manquants: slotId, posteId, produitId requis');
      err.statusCode = 400;
      throw err;
    }

    const isDashboardSequence = Array.isArray(commands) && commands.length > 0;
    const isSingleCommand     = !isDashboardSequence && !!commandId;

    if (!isDashboardSequence && !isSingleCommand) {
      const err = new Error('commandId ou commands[] requis');
      err.statusCode = 400;
      throw err;
    }

    const slot = await this._slotRepo.findById(parseInt(slotId));
    if (!slot) {
      const err = new Error(`Slot ${slotId} non trouvé`);
      err.statusCode = 404;
      throw err;
    }

    const allCommands  = await this._telnetCommandRepo.findAll();
    const telnetConfig = { commands: allCommands };

    let runMode;
    let commandConfig = null;

    if (isSingleCommand) {
      commandConfig = telnetConfig.commands.find(c => c.id === commandId);
      if (!commandConfig) {
        const err = new Error(`Commande '${commandId}' non trouvée`);
        err.statusCode = 404;
        throw err;
      }
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

    await this._auditLogRepo.create({
      ...auditContext,
      action:  runMode === 'single' ? 'RUN_TEST' : 'RUN_SEQUENCE',
      details: {
        slotId, posteId, produitId,
        commandId: commandId || null,
        steps: isDashboardSequence ? commands.length : (commandConfig?.steps?.length || 1)
      }
    });

    const testId    = Date.now();
    const startTime = new Date().toISOString();
    let   testSteps = [];

    if (runMode === 'builtin_sequence') {
      testSteps = commandConfig.steps.map((s, i) => ({
        step: i + 1, description: s.description || s.command, status: 'PENDING', timestamp: startTime
      }));
    } else if (runMode === 'sequence') {
      testSteps = commands.map((s, i) => {
        const cfg = telnetConfig.commands.find(c => c.id === s.commandId);
        return { step: i + 1, description: s.description || cfg?.name || s.commandId, status: 'PENDING', timestamp: startTime };
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

    await this._testResultRepo.create({
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

    const workerData = {
      testId,
      startTime,
      slotId:            parseInt(slotId),
      slot:              { adresse: slot.adresse, port: slot.port },
      runMode,
      commandConfig:     (runMode === 'single' || runMode === 'monitoring') ? commandConfig : null,
      builtinSteps:      runMode === 'builtin_sequence' ? commandConfig.steps : null,
      dashboardCommands: runMode === 'sequence' ? commands : null,
      telnetCommandsList: telnetConfig.commands
    };

    const testResultRepo    = this._testResultRepo;
    const testWorkerManager = this._testWorkerManager;

    testWorkerManager.spawnWorker(testId, workerData, {
      onLog: async (msg) => {
        if (msg.message) await testResultRepo.pushLog(testId, msg.message);
      },
      onStep: async (msg) => {
        if (typeof msg.stepIndex === 'number') {
          await testResultRepo.updateStep(testId, msg.stepIndex, msg.status, msg.timestamp, msg.log);
        }
      },
      onMonitoringEvent: async (msg) => {
        if (msg.log) await testResultRepo.pushLog(testId, msg.log);
      },
      onCompleted: async (msg) => {
        const endTime     = msg.endTime ? new Date(msg.endTime).toISOString() : new Date().toISOString();
        const finalStatus = msg.success ? 'SUCCESS' : 'FAIL';
        await testResultRepo.complete(testId, finalStatus, endTime, msg.error);
        await testResultRepo.finalizePendingSteps(testId, finalStatus);
      },
      onError: async (msg) => {
        const endTime = new Date().toISOString();
        await testResultRepo.updateById(testId,
          {
            $set:  { status: 'FAIL', endTime },
            $push: { logs: `[${endTime}] Erreur worker: ${msg.message}` }
          }
        );
      },
      onUnexpectedExit: async ({ code }) => {
        const endTime = new Date().toISOString();
        await testResultRepo.updateWithFilter(
          { id: testId, status: { $in: ['PENDING', 'RUNNING'] } },
          {
            $set:  { status: 'FAIL', endTime },
            $push: { logs: `[${endTime}] Worker exit inattendu, code: ${code}` }
          }
        );
      }
    });

    return {
      message:   runMode === 'single' ? 'Test démarré' : 'Séquence démarrée',
      testId,
      steps:     testSteps,
      estimatedDuration: runMode === 'monitoring' ? 'Continu' : `~${testSteps.length * 5}s`,
      isMonitoring: runMode === 'monitoring',
      hasMonitoringCommands: runMode === 'sequence' && commands.some(s => {
        const cfg = telnetConfig.commands.find(c => c.id === s.commandId);
        return s.type === 'monitoring' || cfg?.type === 'monitoring';
      })
    };
  }
}

module.exports = RunTestUseCase;
