import React, { useState, useEffect, useRef } from 'react';
import { posteService, produitService, slotService, testService } from '../services/api';
import { Poste, Produit, Slot, TestStep, User } from '../services/api';
import { usePermissions } from '../hooks/usePermissions';
import './MultiTest.css';

interface TelnetCommand {
  id: string;
  name: string;
  type: 'single' | 'sequence' | 'monitoring';
  command?: string;
  description: string;
  steps?: SequenceStep[];
}

interface SequenceStep {
  commandId: string;
  description?: string;
  type?: 'standard' | 'monitoring';
  duration?: number;
  expectedResponse?: string;
}

interface TestConfig {
  poste: number | '';
  produit: number | '';
  slot: number | '';
  produits: Produit[];
  slots: Slot[];
  command: string;
  isSeqMode: boolean;
  sequence: SequenceStep[];
}

type ActiveTest = {
  testId: number;
  steps: TestStep[];
  status: 'PENDING' | 'SUCCESS' | 'FAIL' | 'STOPPED';
  logs: string[];
  startTime?: string;
  endTime?: string;
};

const defaultConfig = (): TestConfig => ({
  poste: '',
  produit: '',
  slot: '',
  produits: [],
  slots: [],
  command: '',
  isSeqMode: false,
  sequence: [],
});

function getStatusIcon(status: string) {
  if (status === 'SUCCESS') return '✔';
  if (status === 'FAIL') return '✖';
  return '⏳';
}

function getStatusLabel(status: string) {
  if (status === 'SUCCESS') return 'Succès';
  if (status === 'FAIL') return 'Échec';
  if (status === 'STOPPED') return 'Arrêté';
  return 'En cours';
}

function getStatusClass(status: string): string {
  if (status === 'SUCCESS') return 'status-success';
  if (status === 'FAIL') return 'status-fail';
  if (status === 'PENDING') return 'status-pending';
  return '';
}

function getProgressPercent(steps: TestStep[], status: string): number {
  if (status === 'SUCCESS' || status === 'FAIL') return 100;
  if (!steps || steps.length === 0) return 0;
  const finished = steps.filter(s => s.status !== 'PENDING').length;
  return Math.max(0, Math.min(99, Math.round((finished / steps.length) * 100)));
}

function getLogLevel(logLine: string): 'error' | 'warn' | 'info' | 'default' {
  const l = logLine.toLowerCase();
  if (l.includes('error') || l.includes('échec') || l.includes('fail') || l.includes('erreur')) return 'error';
  if (l.includes('warn') || l.includes('warning')) return 'warn';
  if (l.includes('info')) return 'info';
  return 'default';
}

function calculateDuration(startTime?: string, endTime?: string): string {
  if (!startTime) return '-';
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

const MultiTest: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const permissions = usePermissions(user);

  const [postes, setPostes] = useState<Poste[]>([]);
  const [telnetCommands, setTelnetCommands] = useState<TelnetCommand[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [testConfigs, setTestConfigs] = useState<TestConfig[]>([defaultConfig(), defaultConfig()]);
  const [activeTests, setActiveTests] = useState<(ActiveTest | null)[]>([null, null]);
  const activeTestsRef = useRef<(ActiveTest | null)[]>([null, null]);
  useEffect(() => { activeTestsRef.current = activeTests; }, [activeTests]);

  useEffect(() => {
    const stored = sessionStorage.getItem('user');
    if (stored) { try { setUser(JSON.parse(stored)); } catch {} }
    loadPostes();
    loadTelnetCommands();
  }, []);

  // Single polling interval — covers all N active tests
  useEffect(() => {
    const interval = setInterval(async () => {
      const tests = activeTestsRef.current;
      for (let i = 0; i < tests.length; i++) {
        const t = tests[i];
        if (!t || t.status !== 'PENDING') continue;
        try {
          const updated = await testService.getTestResultById(t.testId);
          setActiveTests(prev => {
            const next = [...prev];
            next[i] = {
              testId: t.testId,
              steps: updated.steps,
              status: updated.status,
              logs: updated.logs,
              startTime: updated.startTime,
              endTime: updated.endTime,
            };
            return next;
          });
        } catch {}
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadPostes = async () => {
    try { setPostes(await posteService.getPostes()); } catch {}
  };

  const loadTelnetCommands = async () => {
    try {
      const resp = await fetch('/telnet-commands', {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` },
      });
      const data = await resp.json();
      const cmds: TelnetCommand[] = data.commands || [];
      setTelnetCommands(cmds);
      if (cmds.length > 0) {
        setTestConfigs(prev => prev.map(c => c.command ? c : { ...c, command: cmds[0].id }));
      }
    } catch {}
  };

  const updateConfig = (idx: number, patch: Partial<TestConfig>) => {
    setTestConfigs(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const handlePosteChange = (idx: number, value: number | '') => {
    updateConfig(idx, { poste: value, produit: '', produits: [], slot: '', slots: [] });
    if (value) {
      produitService.getProduits(Number(value)).then(produits => {
        setTestConfigs(prev => {
          const next = [...prev];
          next[idx] = { ...next[idx], produits };
          return next;
        });
      }).catch(() => {});
    }
  };

  const handleProduitChange = (idx: number, value: number | '') => {
    updateConfig(idx, { produit: value, slot: '', slots: [] });
    if (value) {
      slotService.getSlots(Number(value)).then(slots => {
        setTestConfigs(prev => {
          const next = [...prev];
          next[idx] = { ...next[idx], slots };
          return next;
        });
      }).catch(() => {});
    }
  };

  const addTest = () => {
    const cmd = telnetCommands.length > 0 ? telnetCommands[0].id : '';
    setTestConfigs(prev => [...prev, { ...defaultConfig(), command: cmd }]);
    setActiveTests(prev => [...prev, null]);
  };

  const removeTest = (idx: number) => {
    setTestConfigs(prev => prev.filter((_, i) => i !== idx));
    setActiveTests(prev => prev.filter((_, i) => i !== idx));
  };

  const runAllTests = async () => {
    for (let i = 0; i < testConfigs.length; i++) {
      const c = testConfigs[i];
      if (!c.poste || !c.produit || !c.slot) {
        setError(`Test ${i + 1} : sélectionnez un poste, un produit et un slot`);
        return;
      }
      if (c.isSeqMode && c.sequence.length === 0) {
        setError(`Test ${i + 1} : ajoutez au moins une commande à la séquence`);
        return;
      }
    }
    setError('');
    setLoading(true);
    setActiveTests(testConfigs.map(() => null));
    try {
      const results = await Promise.all(
        testConfigs.map(c =>
          c.isSeqMode
            ? testService.runTestSequence(Number(c.slot), Number(c.poste), Number(c.produit), c.sequence)
            : testService.runTest(Number(c.slot), Number(c.poste), Number(c.produit), c.command)
        )
      );
      setActiveTests(results.map(r => ({
        testId: r.testId,
        steps: r.steps,
        status: 'PENDING' as const,
        logs: [],
      })));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du lancement des tests');
    } finally {
      setLoading(false);
    }
  };

  const canRun =
    testConfigs.length > 0 &&
    testConfigs.every(c => !!c.poste && !!c.produit && !!c.slot && (!c.isSeqMode || c.sequence.length > 0)) &&
    permissions.canRunTests() && !loading;

  // ── Config Panel ──────────────────────────────────────────────────────────
  const ConfigPanel = ({ idx, config }: { idx: number; config: TestConfig }) => {
    const num = idx + 1;
    const badgeNum = (idx % 6) + 1;

    const addCmd = (cmd: TelnetCommand) => {
      if (cmd.type === 'sequence' && cmd.steps) {
        updateConfig(idx, { sequence: [...config.sequence, ...cmd.steps!] });
      } else {
        updateConfig(idx, {
          sequence: [...config.sequence, {
            commandId: cmd.id,
            description: cmd.name,
            type: cmd.type === 'monitoring' ? 'monitoring' : 'standard',
            duration: cmd.type === 'monitoring' ? 20000 : undefined,
          }],
        });
      }
    };

    const removeCmd = (i: number) =>
      updateConfig(idx, { sequence: config.sequence.filter((_, j) => j !== i) });

    const moveCmd = (i: number, dir: 'up' | 'down') => {
      const next = [...config.sequence];
      if (dir === 'up' && i > 0) [next[i - 1], next[i]] = [next[i], next[i - 1]];
      else if (dir === 'down' && i < next.length - 1) [next[i], next[i + 1]] = [next[i + 1], next[i]];
      updateConfig(idx, { sequence: next });
    };

    const updateDuration = (i: number, ms: number) => {
      const next = [...config.sequence];
      next[i] = { ...next[i], duration: ms };
      updateConfig(idx, { sequence: next });
    };

    return (
      <div className="mt-config-panel">
        <div className="mt-panel-title">
          <span className={`mt-badge mt-badge-${badgeNum}`}>TEST {num}</span>
          {testConfigs.length > 1 && (
            <button className="mt-remove-btn" onClick={() => removeTest(idx)} title="Supprimer ce test">✕</button>
          )}
        </div>

        <div className="mt-form-group">
          <label>Poste</label>
          <select value={config.poste} onChange={e => handlePosteChange(idx, Number(e.target.value) || '')}>
            <option value="">Sélectionner un poste</option>
            {postes.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        </div>
        <div className="mt-form-group">
          <label>Produit</label>
          <select value={config.produit} onChange={e => handleProduitChange(idx, Number(e.target.value) || '')} disabled={!config.poste}>
            <option value="">Sélectionner un produit</option>
            {config.produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        </div>
        <div className="mt-form-group">
          <label>Slot (adresse IP)</label>
          <select value={config.slot} onChange={e => updateConfig(idx, { slot: Number(e.target.value) || '' })} disabled={!config.produit}>
            <option value="">Sélectionner un slot</option>
            {config.slots.map(s => <option key={s.id} value={s.id}>{s.nom} — {s.adresse}:{s.port}</option>)}
          </select>
        </div>

        <div className="mt-mode-selector">
          <label className={!config.isSeqMode ? 'mt-mode-active' : ''}>
            <input type="radio" checked={!config.isSeqMode} onChange={() => updateConfig(idx, { isSeqMode: false })} />
            Commande unique
          </label>
          <label className={config.isSeqMode ? 'mt-mode-active' : ''}>
            <input type="radio" checked={config.isSeqMode} onChange={() => updateConfig(idx, { isSeqMode: true })} />
            Séquence
          </label>
        </div>

        {!config.isSeqMode && (
          <div className="mt-form-group">
            <label>Commande Telnet</label>
            <select value={config.command} onChange={e => updateConfig(idx, { command: e.target.value })}>
              {telnetCommands.map(c => (
                <option key={c.id} value={c.id}>{c.name} — {c.command}</option>
              ))}
            </select>
            <small className="mt-cmd-desc">
              {telnetCommands.find(c => c.id === config.command)?.description}
            </small>
          </div>
        )}

        {config.isSeqMode && (
          <div className="mt-seq-builder">
            <div className="mt-seq-available">
              <div className="mt-seq-available-title">Commandes disponibles</div>
              <div className="mt-seq-cmd-grid">
                {telnetCommands.map(c => (
                  <div key={c.id} className="mt-seq-cmd-card">
                    <span className="mt-seq-cmd-name">{c.command || c.name}</span>
                    {c.type === 'monitoring' && <span className="mt-seq-monitoring-tag">📡</span>}
                    <button className="mt-seq-add-btn" onClick={() => addCmd(c)} title="Ajouter">+</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-seq-list-header">
              <span>Séquence ({config.sequence.length} étape{config.sequence.length !== 1 ? 's' : ''})</span>
              {config.sequence.length > 0 && (
                <button className="mt-seq-clear-btn" onClick={() => updateConfig(idx, { sequence: [] })}>Vider</button>
              )}
            </div>

            {config.sequence.length === 0 ? (
              <div className="mt-seq-empty">Aucune commande — ajoutez depuis la liste ci-dessus</div>
            ) : (
              <div className="mt-seq-steps">
                {config.sequence.map((step, i) => {
                  const cmd = telnetCommands.find(c => c.id === step.commandId);
                  const isMonStep = step.type === 'monitoring' || cmd?.type === 'monitoring';
                  return (
                    <div key={i} className={`mt-seq-step ${isMonStep ? 'mt-seq-step-monitoring' : ''}`}>
                      <span className="mt-seq-step-num">{i + 1}</span>
                      <div className="mt-seq-step-body">
                        <span className="mt-seq-step-name">
                          {cmd?.command || step.commandId}
                          {isMonStep && ' 📡'}
                        </span>
                        {isMonStep && (
                          <label className="mt-seq-duration-label">
                            ⏱
                            <input
                              type="number" min={1} max={600}
                              value={Math.round((step.duration || 20000) / 1000)}
                              onChange={e => {
                                const s = Math.max(1, Math.min(600, Number(e.target.value) || 1));
                                updateDuration(i, s * 1000);
                              }}
                            />
                            s
                          </label>
                        )}
                      </div>
                      <div className="mt-seq-step-controls">
                        <button onClick={() => moveCmd(i, 'up')} disabled={i === 0} className="mt-seq-move-btn">▲</button>
                        <button onClick={() => moveCmd(i, 'down')} disabled={i === config.sequence.length - 1} className="mt-seq-move-btn">▼</button>
                        <button onClick={() => removeCmd(i)} className="mt-seq-remove-btn">✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Result Panel ──────────────────────────────────────────────────────────
  const ResultPanel = ({ idx, test }: { idx: number; test: ActiveTest | null }) => {
    const num = idx + 1;
    const badgeNum = (idx % 6) + 1;
    return (
      <div className={`mt-result-panel ${test ? `mt-result-${test.status.toLowerCase()}` : 'mt-result-empty'}`}>
        <div className="mt-result-title">
          <span className={`mt-badge mt-badge-${badgeNum}`}>RÉSULTAT TEST {num}</span>
          {test && (
            <span className={`mt-status-pill ${getStatusClass(test.status)}`}>
              {getStatusIcon(test.status)} {getStatusLabel(test.status)}
            </span>
          )}
          {test && <span className="mt-duration">{calculateDuration(test.startTime, test.endTime)}</span>}
        </div>

        {!test && <div className="mt-empty-state">En attente de lancement...</div>}

        {test && (
          <>
            <div className="mt-progress-row">
              <div className="mt-progress-track">
                <div
                  className={`mt-progress-bar ${test.status === 'SUCCESS' ? 'progress-success' : test.status === 'FAIL' ? 'progress-fail' : 'progress-pending'}`}
                  style={{ width: `${getProgressPercent(test.steps, test.status)}%` }}
                />
              </div>
              <span className="mt-pct">{getProgressPercent(test.steps, test.status)}%</span>
            </div>

            <div className="mt-steps">
              {test.steps.map((step, i) => (
                <div key={i} className={`mt-step-row ${getStatusClass(step.status)}`}>
                  <span className="mt-step-icon">{getStatusIcon(step.status)}</span>
                  <span className="mt-step-desc">{step.description}</span>
                  <span className="mt-step-time">{new Date(step.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>

            {test.logs.length > 0 && (
              <div className="mt-logs">
                <div className="mt-logs-header">Journaux d'exécution</div>
                <div className="mt-logs-body">
                  {test.logs.map((l, i) => {
                    const level = getLogLevel(l);
                    return (
                      <div key={i} className={`mt-log-line ${level !== 'default' ? `log-level-${level}` : ''}`}>{l}</div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const hasAnyResult = activeTests.some(t => t !== null);

  return (
    <div className="mt-container">
      <div className="mt-page-header">
        <div className="mt-page-header-top">
          <div>
            <h2>Multi-Test</h2>
            <p>Configurez plusieurs tests indépendants et lancez-les simultanément sur différents slots.</p>
          </div>
          <button className="mt-add-btn" onClick={addTest}>+ Ajouter un test</button>
        </div>
      </div>

      {error && <div className="mt-error">{error}</div>}

      <div className="mt-configs">
        {testConfigs.map((config, idx) => (
          <ConfigPanel key={idx} idx={idx} config={config} />
        ))}
      </div>

      <div className="mt-launch-row">
        <button className="mt-launch-btn" onClick={runAllTests} disabled={!canRun}>
          {loading
            ? ' LANCEMENT EN COURS...'
            : ` INITIER LES ${testConfigs.length} TEST${testConfigs.length > 1 ? 'S' : ''} `}
        </button>
        {!permissions.canRunTests() && (
          <span className="mt-no-perm">Permissions insuffisantes pour lancer des tests</span>
        )}
      </div>

      {hasAnyResult && (
        <div className="mt-results">
          {activeTests.map((test, idx) => (
            <ResultPanel key={idx} idx={idx} test={test} />
          ))}
        </div>
      )}
    </div>
  );
};

export default MultiTest;
