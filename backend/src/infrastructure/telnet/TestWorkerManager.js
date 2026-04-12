const { Worker } = require('worker_threads');

/**
 * Gère le cycle de vie des Worker threads Telnet et les clients WebSocket de monitoring.
 * Injecté dans les use cases via le container.
 */
class TestWorkerManager {
  constructor(workerScriptPath) {
    this._workerScriptPath = workerScriptPath;
    this._activeWorkers    = new Map(); // testId → Worker
    this._monitoringClients = new Map(); // testId → Set<WebSocket>
  }

  get activeCount() {
    return this._activeWorkers.size;
  }

  hasWorker(testId) {
    return this._activeWorkers.has(testId);
  }

  /**
   * Spawne un worker Telnet et câble tous les event handlers.
   * Les callbacks reçoivent les données brutes du worker et sont fournis par le use case.
   */
  spawnWorker(testId, workerData, callbacks = {}) {
    const {
      onLog             = async () => {},
      onStep            = async () => {},
      onMonitoringEvent = async () => {},
      onCompleted       = async () => {},
      onError           = async () => {},
      onUnexpectedExit  = async () => {}
    } = callbacks;

    const worker = new Worker(this._workerScriptPath, { workerData });
    this._activeWorkers.set(testId, worker);

    worker.on('message', async (msg) => {
      if (!msg?.type) return;
      try {
        switch (msg.type) {
          case 'log':
            await onLog(msg);
            break;

          case 'step':
            await onStep(msg);
            break;

          case 'monitoringEvent':
            this.broadcast(testId, msg.event);
            await onMonitoringEvent(msg);
            break;

          case 'completed':
            await onCompleted(msg);
            this._activeWorkers.delete(testId);
            break;

          case 'error':
            await onError(msg);
            this._activeWorkers.delete(testId);
            break;
        }
      } catch (e) {
        console.error('Erreur handler worker:', e);
      }
    });

    worker.on('error', async (err) => {
      try { await onError({ message: err.message }); } catch (e) { console.error(e); }
      this._activeWorkers.delete(testId);
    });

    worker.on('exit', async (code) => {
      if (code !== 0) {
        try { await onUnexpectedExit({ code }); } catch (e) { console.error(e); }
      }
      this._activeWorkers.delete(testId);
    });

    return worker;
  }

  terminateWorker(testId) {
    const worker = this._activeWorkers.get(testId);
    if (worker) {
      worker.terminate();
      this._activeWorkers.delete(testId);
      return true;
    }
    return false;
  }

  // ── WebSocket monitoring ──────────────────────────────────────────────────────

  subscribeMonitoring(testId, ws) {
    if (!this._monitoringClients.has(testId)) {
      this._monitoringClients.set(testId, new Set());
    }
    this._monitoringClients.get(testId).add(ws);
  }

  unsubscribeMonitoring(testId, ws) {
    const set = this._monitoringClients.get(testId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) this._monitoringClients.delete(testId);
    }
  }

  broadcast(testId, event) {
    const clients = this._monitoringClients.get(testId);
    if (!clients || clients.size === 0) return;
    const msg = JSON.stringify({
      type:      'monitoring_event',
      testId,
      timestamp: new Date().toISOString(),
      event
    });
    clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
  }
}

module.exports = TestWorkerManager;
