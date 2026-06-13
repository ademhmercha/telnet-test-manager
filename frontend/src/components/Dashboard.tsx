import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { posteService, produitService, slotService, testService, referenceService, TestRunResponse } from '../services/api';
import { Poste, Produit, Slot, TestStep, TestResult, Reference, User } from '../services/api';
import { usePermissions } from '../hooks/usePermissions';
import './Dashboard.css';

// Interface pour les événements WebSocket
interface MonitoringEvent {
  type: 'key_event';
  data: string;
  timestamp: string;
}

interface WebSocketMessage {
  type: 'monitoring_event' | 'monitoringEvent' | 'subscribed';
  testId: number;
  timestamp: string;
  event?: MonitoringEvent;
  message?: string;
}

// Interface pour les étapes de séquence
interface SequenceStep {
  commandId: string;
  description?: string;
  type?: 'standard' | 'monitoring';
  duration?: number;
  timeout?: number;
  expectedResponse?: string;
}

// Interface pour les commandes Telnet
interface TelnetCommand {
  id: string;
  name: string;
  type: 'single' | 'sequence' | 'monitoring';
  command?: string;
  description: string;
  steps?: SequenceStep[];
}

// Définition de type pour un test actif
type ActiveTest = {
  testId: number;
  steps: TestStep[];
  status: 'PENDING' | 'SUCCESS' | 'FAIL' | 'STOPPED';
  logs: string[];
  startTime?: string;
  endTime?: string;
  isMonitoring?: boolean;
  hasMonitoringCommands?: boolean;
  monitoringEvents?: MonitoringEvent[];
};

// Fonction utilitaire pour obtenir le libellé de statut
function getStatusLabel(status: string, t: (key: string) => string) {
  if (status === 'SUCCESS') return t('status.success');
  if (status === 'FAIL') return t('status.fail');
  if (status === 'STOPPED') return t('status.stopped');
  return t('status.inProgress');
}

function getLogLevel(logLine: string): 'info' | 'warn' | 'error' | 'default' {
  const l = logLine.toLowerCase();
  if (l.includes('fatal') || l.includes('error') || l.includes('échec') || l.includes('fail') || l.includes('erreur')) return 'error';
  if (l.includes('warn') || l.includes('warning') || l.includes('avertissement')) return 'warn';
  if (l.includes('info')) return 'info';
  return 'default';
}

// Fonction pour obtenir le pourcentage de progression
function getProgressPercent(steps: TestStep[], status: ActiveTest['status']): number {
  if (status === 'SUCCESS' || status === 'FAIL') return 100;
  if (!steps || steps.length === 0) return 0;

  const finishedSteps = steps.filter(s => s.status !== 'PENDING').length;
  return Math.max(0, Math.min(99, Math.round((finishedSteps / steps.length) * 100)));
}

// Composant principal du Tableau de Bord
const Dashboard: React.FC = () => {
  // @ts-ignore
  const { t: _t } = useTranslation();
  const t = (key: string, opts?: Record<string, any>): string => String(_t(key, opts as any));
  // État utilisateur et permissions
  const [user, setUser] = useState<User | null>(null);
  const permissions = usePermissions(user);

  // Conservation des noms de variables originaux
  const [postes, setPostes] = useState<Poste[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [references, setReferences] = useState<Reference[]>([]);
  const [selectedPoste, setSelectedPoste] = useState<number | ''>('');
  const [selectedProduit, setSelectedProduit] = useState<number | ''>('');
  const [selectedReference, setSelectedReference] = useState<number | ''>('');
  const [selectedSlot, setSelectedSlot] = useState<number | ''>('');
  const [telnetCommands, setTelnetCommands] = useState<TelnetCommand[]>([]);
  const [selectedCommand, setSelectedCommand] = useState<string>('ls');
  const [selectedSequence, setSelectedSequence] = useState<SequenceStep[]>([]);
  const [isSequenceMode, setIsSequenceMode] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [singleMonitorDurationMs, setSingleMonitorDurationMs] = useState<number>(20000);

  // États pour l'administration
  const [systemStats, setSystemStats] = useState<any>(null);
  const [activeTests, setActiveTests] = useState<ActiveTest[]>([]);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [error, setError] = useState('');
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);
  
  // État pour stocker les événements de monitoring de manière persistante
  const [monitoringEventsStorage, setMonitoringEventsStorage] = useState<{[testId: number]: MonitoringEvent[]}>({});
  const [searchId, setSearchId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const itemsPerPage = 20;

  const activeTestsRef = useRef<ActiveTest[]>([]);
  const webSocketRef = useRef<WebSocket | null>(null);
  const monitoringTestsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    activeTestsRef.current = activeTests;
  }, [activeTests]);

  useEffect(() => {
    // Charger les données utilisateur depuis sessionStorage (par onglet)
    const storedUser = sessionStorage.getItem('user');
    const storedToken = sessionStorage.getItem('token');
    
    if (storedUser && storedToken) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
      } catch (e) {
        console.error('Erreur parsing user data:', e);
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('token');
      }
    }
    loadData();
    loadTelnetCommands();
    initWebSocket();
  }, []);

  useEffect(() => {
    if (selectedPoste) {
      loadProduits(selectedPoste);
    } else {
      setProduits([]);
      setSelectedProduit('');
      setSlots([]);
      setSelectedSlot('');
      setReferences([]);
      setSelectedReference('');
    }
  }, [selectedPoste]);

  useEffect(() => {
    if (selectedProduit) {
      loadSlots(selectedProduit);
      loadReferences(selectedProduit);
    } else {
      setSlots([]);
      setReferences([]);
      setSelectedSlot('');
      setSelectedReference('');
    }
  }, [selectedProduit]);

  const loadReferences = async (produitId: number) => {
    try {
      const referencesData = await referenceService.getReferences(produitId);
      setReferences(referencesData);
    } catch (err: any) {
      setError('Erreur lors du chargement des références');
    }
  };

  // Initialisation et gestion des WebSocket
  const initWebSocket = () => {
    const token = sessionStorage.getItem('token');
    if (!token) return;

    try {
      const wsBase = process.env.REACT_APP_WS_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
      const ws = new WebSocket(`${wsBase}?token=${token}`);
      webSocketRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connecté pour le monitoring en temps réel');
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          if ((message.type === 'monitoring_event' || message.type === 'monitoringEvent') && message.event) {
            // Mettre à jour le test correspondant avec l'événement de monitoring
            setActiveTests(prev => 
              prev.map(test => {
                if (test.testId === message.testId) {
                  const event = message.event!; // Non-null assertion car on vérifie au-dessus
                  const updatedEvents = [...(test.monitoringEvents || []), event];
                  
                  // Stocker les événements de manière persistante
                  setMonitoringEventsStorage(prev => ({
                    ...prev,
                    [message.testId]: updatedEvents
                  }));
                  
                  return {
                    ...test,
                    monitoringEvents: updatedEvents,
                    logs: [...test.logs, `[${event.timestamp}] Événement: ${event.data}`]
                  };
                }
                return test;
              })
            );
          }
        } catch (error) {
          console.error('Erreur traitement message WebSocket:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket déconnecté');
        // Tentative de reconnexion après 5 secondes
        setTimeout(() => {
          if (sessionStorage.getItem('token')) {
            initWebSocket();
          }
        }, 5000);
      };

      ws.onerror = (error) => {
        console.error('Erreur WebSocket:', error);
      };

    } catch (error) {
      console.error('Erreur initialisation WebSocket:', error);
    }
  };

  const subscribeToMonitoring = (testId: number) => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      webSocketRef.current.send(JSON.stringify({
        type: 'subscribe_monitoring',
        testId
      }));
      monitoringTestsRef.current.add(testId);
    }
  };

  const unsubscribeFromMonitoring = (testId: number) => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      webSocketRef.current.send(JSON.stringify({
        type: 'unsubscribe_monitoring',
        testId
      }));
      monitoringTestsRef.current.delete(testId);
    }
  };

  const stopTest = async (testId: number) => {
    try {
      console.log('Tentative d\'arrêt du test:', testId);
      
      // Se désabonner du monitoring WebSocket
      unsubscribeFromMonitoring(testId);
      
      // Afficher un indicateur de chargement
      const loadingMsg = document.createElement('div');
      loadingMsg.textContent = 'Arrêt du test en cours...';
      loadingMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #dc3545; color: white; padding: 15px 25px; border-radius: 8px; z-index: 9999; font-weight: bold;';
      document.body.appendChild(loadingMsg);
      
      const response = await testService.stopTest(testId);
      console.log('Réponse du backend:', response);
      
      // Retirer le message de chargement
      document.body.removeChild(loadingMsg);
      
      // Afficher un message de succès
      const successMsg = document.createElement('div');
      successMsg.textContent = ' Test arrêté avec succès!';
      successMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #28a745; color: white; padding: 15px 25px; border-radius: 8px; z-index: 9999; font-weight: bold;';
      document.body.appendChild(successMsg);
      
      setTimeout(() => {
        if (document.body.contains(successMsg)) {
          document.body.removeChild(successMsg);
        }
      }, 2000);
      
      // Mettre à jour le statut du test localement
      setActiveTests(prev => 
        prev.map(t => 
          t.testId === testId 
            ? { ...t, status: 'STOPPED', endTime: new Date().toISOString() }
            : t
        )
      );
      
      // Recharger les résultats après un court délai
      setTimeout(async () => {
        const resultsData = await testService.getTestResults({ limit: 50 });
        setTestResults(resultsData);
        // Retirer le test de la liste active après rechargement
        setActiveTests(prev => prev.filter(t => t.testId !== testId));
      }, 1000);
      
    } catch (err: any) {
      console.error('Erreur lors de l\'arrêt du test:', err);
      
      // Retirer le message de chargement s'il existe
      const loadingMsg = document.querySelector('div[style*="Arrêt du test en cours"]');
      if (loadingMsg) {
        document.body.removeChild(loadingMsg);
      }
      
      alert('Erreur lors de l\'arrêt du test: ' + (err.response?.data?.error || err.message));
    }
  };

  const loadData = async () => {
    try {
      const [postesData, resultsData] = await Promise.all([
        posteService.getPostes(),
        testService.getTestResults({ limit: 50 })
      ]);
      setPostes(postesData);
      setTestResults(resultsData);
    } catch (err: any) {
      setError('Erreur lors du chargement des données');
    }
  };

  
  useEffect(() => {
    const interval = setInterval(async () => {
      const current = activeTestsRef.current;
      const pending = current.filter(t => t.status === 'PENDING');
      if (pending.length === 0) return;

      try {
        const updates = await Promise.all(
          pending.map(t => testService.getTestResultById(t.testId))
        );

        const anyFinished = updates.some(u => u.status !== 'PENDING');
        setActiveTests(prev =>
          prev.map(t => {
            const updated = updates.find(u => u.id === t.testId);
            if (!updated) return t;

            return {
              testId: t.testId,
              steps: updated.steps,
              status: updated.status,
              logs: updated.logs,
              startTime: updated.startTime,
              endTime: updated.endTime,
            };
          })
        );

        if (anyFinished) {
          // Recharger les résultats récents si un test est terminé
          const resultsData = await testService.getTestResults({ limit: 50 });
          setTestResults(resultsData);
        }
      } catch (e) {
        // ignore polling errors for POC
      }
    }, 1000); // Polling à 1 seconde pour une meilleure réactivité

    return () => clearInterval(interval);
  }, []);

  const loadProduits = async (posteId: number) => {
    try {
      const produitsData = await produitService.getProduits(posteId);
      setProduits(produitsData);
    } catch (err: any) {
      setError('Erreur lors du chargement des produits');
    }
  };

  const loadSlots = async (produitId: number) => {
    try {
      const slotsData = await slotService.getSlots(produitId);
      setSlots(slotsData);
    } catch (err: any) {
      setError('Erreur lors du chargement des slots');
    }
  };

  // Fonctions pour la gestion des séquences
  const addCommandToSequence = (commandId: string, isMonitoring: boolean = false, duration: number = 20000) => {
    const command = telnetCommands.find(c => c.id === commandId);
    if (!command) return;
    
    if (command.type === 'sequence' && command.steps) {
      // Ajouter toutes les étapes de la séquence prédéfinie
      setSelectedSequence(prev => [...prev, ...command.steps!]);
    } else {
      // Ajouter une commande single
      const newStep: SequenceStep = {
        commandId,
        description: command.name,
        type: isMonitoring || command.type === 'monitoring' ? 'monitoring' : 'standard',
        duration: isMonitoring || command.type === 'monitoring' ? duration : undefined
      };
      setSelectedSequence(prev => [...prev, newStep]);
    }
  };

  const updateSequenceStepType = (index: number, type: 'standard' | 'monitoring') => {
    setSelectedSequence(prev => {
      const newSequence = [...prev];
      newSequence[index] = {
        ...newSequence[index],
        type,
        duration: type === 'monitoring' ? (newSequence[index].duration || 20000) : undefined
      };
      return newSequence;
    });
  };

  const updateSequenceStepDuration = (index: number, duration: number) => {
    setSelectedSequence(prev => {
      const newSequence = [...prev];
      newSequence[index] = {
        ...newSequence[index],
        duration
      };
      return newSequence;
    });
  };

  const removeCommandFromSequence = (index: number) => {
    setSelectedSequence(prev => prev.filter((_, i) => i !== index));
  };

  const clearSequence = () => {
    setSelectedSequence([]);
  };

  const moveSequenceStep = (index: number, direction: 'up' | 'down') => {
    setSelectedSequence(prev => {
      const newSequence = [...prev];
      if (direction === 'up' && index > 0) {
        [newSequence[index - 1], newSequence[index]] = [newSequence[index], newSequence[index - 1]];
      } else if (direction === 'down' && index < newSequence.length - 1) {
        [newSequence[index], newSequence[index + 1]] = [newSequence[index + 1], newSequence[index]];
      }
      return newSequence;
    });
  };

  const loadTelnetCommands = async () => {
    try {
      const response = await fetch('/telnet-commands', {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setTelnetCommands(data.commands || []);
    } catch (err) {
      console.error('Erreur chargement commandes Telnet:', err);
    }
  };

  const runTest = async () => {
    if (!selectedSlot || !selectedPoste || !selectedProduit) {
      setError('Veuillez sélectionner un poste, un produit et un slot');
      return;
    }
    
    if (isSequenceMode && selectedSequence.length === 0) {
      setError('Veuillez ajouter au moins une commande à la séquence');
      return;
    }
    
    setError('');
    setLoading(true);

    try {
      let response: TestRunResponse;

      const selectedCmdDef = telnetCommands.find(c => c.id === selectedCommand);
      const isSingleMonitoring =
        !isSequenceMode &&
        (selectedCommand === 'keys' || selectedCmdDef?.type === 'monitoring');
      if (isSequenceMode) {
        // Mode séquence: envoyer la séquence complète
        response = await testService.runTestSequence(
          parseInt(selectedSlot.toString()),
          parseInt(selectedPoste.toString()),
          parseInt(selectedProduit.toString()),
          selectedSequence
        );
      } else {
        // Mode commande unique
        response = await testService.runTest(
          parseInt(selectedSlot.toString()),
          parseInt(selectedPoste.toString()),
          parseInt(selectedProduit.toString()),
          selectedCommand,
          isSingleMonitoring ? singleMonitorDurationMs : undefined
        );
      }

      const isMonitoringCommand = isSingleMonitoring;

      // Vérifier si la séquence contient des commandes de monitoring
      const hasMonitoringCommands = isSequenceMode && selectedSequence.some(step => 
        step.type === 'monitoring' || 
        telnetCommands.find(c => c.id === step.commandId)?.type === 'monitoring'
      );

      const newTest: ActiveTest = {
        testId: response.testId,
        steps: response.steps,
        status: 'PENDING',
        logs: [],
        isMonitoring: isMonitoringCommand,
        hasMonitoringCommands,
        monitoringEvents: []
      };

      setActiveTests(prev => [newTest, ...prev]);

      // S'abonner au monitoring WebSocket si c'est une commande de monitoring
      if (newTest.isMonitoring) {
        setTimeout(() => {
          subscribeToMonitoring(response.testId);
        }, 1000);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du lancement du test');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    window.location.href = '/login';
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  const getPosteName = (posteId: number): string => {
    const poste = postes.find(p => p.id === posteId);
    return poste ? poste.nom : `Poste ${posteId}`;
  };

  const getProduitName = (produitId: number): string => {
    const produit = produits.find(p => p.id === produitId);
    return produit ? produit.nom : `Produit ${produitId}`;
  };

  const getSlotName = (slotId: number): string => {
    const slot = slots.find(s => s.id === slotId);
    return slot ? `${slot.nom} (${slot.adresse}:${slot.port})` : `Slot ${slotId}`;
  };

  const calculateDuration = (startTime?: string, endTime?: string): string => {
    if (!startTime) return '-';
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : Date.now();
    const duration = end - start;
    
    if (duration < 1000) return `${duration}ms`;
    const seconds = Math.floor(duration / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getProgressPercent = (steps: TestStep[], status: string): number => {
    if (status === 'SUCCESS') return 100;
    if (status === 'FAIL') return 100;
    const completedSteps = steps.filter(step => step.status !== 'PENDING').length;
    return Math.round((completedSteps / steps.length) * 100);
  };

  const getStatusClass = (status: string): string => {
    switch (status) {
      case 'SUCCESS': return 'status-success';
      case 'FAIL': return 'status-fail';
      case 'PENDING': return 'status-pending';
      default: return '';
    }
  };

  
  return (
    <div className={`dashboard-container ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
      <header className="dashboard-header">
        <div className="header-left">
          {user && (
            <div className="user-info-container">
              <span className="user-info">
                {user.username} ({user.role})
              </span>
              <span className="session-indicator">
                Session onglet #{Math.random().toString(36).substr(2, 9)}
              </span>
            </div>
          )}
        </div>
        <div className="header-right">
          <button onClick={handleLogout} className="logout-button">
            Déconnexion
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        {error && <div className="error-message">{error}</div>}

        <div className="test-section">
          <h2>Console de lancement</h2>
          
          <div className="form-row">
            <div className="form-group">
              <label>Poste</label>
              <select 
                value={selectedPoste} 
                onChange={(e) => setSelectedPoste(Number(e.target.value))}
                disabled={false}
              >
                <option value="">Sélectionner un poste</option>
                {postes.map(poste => (
                  <option key={poste.id} value={poste.id}>
                    {poste.nom}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Produit</label>
              <select 
                value={selectedProduit} 
                onChange={(e) => setSelectedProduit(Number(e.target.value))}
                disabled={!selectedPoste}
              >
                <option value="">Sélectionner un produit</option>
                {produits.map(produit => (
                  <option key={produit.id} value={produit.id}>
                    {produit.nom}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Référence</label>
              <select 
                value={selectedReference} 
                onChange={(e) => setSelectedReference(Number(e.target.value))}
                disabled={!selectedProduit}
              >
                <option value="">Sélectionner une référence</option>
                {references.map(reference => (
                  <option key={reference.id} value={reference.id}>
                    {reference.nom} - {reference.version}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Slot</label>
              <select 
                value={selectedSlot} 
                onChange={(e) => setSelectedSlot(Number(e.target.value))}
                disabled={!selectedProduit}
              >
                <option value="">Sélectionner un slot</option>
                {slots.map(slot => (
                  <option key={slot.id} value={slot.id}>
                    {slot.nom} ({slot.adresse}:{slot.port})
                  </option>
                ))}
              </select>
            </div>

            {permissions.canRunTests() && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <div className="mode-selector">
                  <label>
                    <input
                      type="radio"
                      checked={!isSequenceMode}
                      onChange={() => setIsSequenceMode(false)}
                    />
                    <span> Commande unique</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={isSequenceMode}
                      onChange={() => setIsSequenceMode(true)}
                    />
                    <span> Séquence de commandes</span>
                  </label>
                </div>
              </div>
            )}

            {!isSequenceMode && permissions.canRunTests() && (
              <div className="form-group">
                <label> Commande Telnet</label>
                <select 
                  value={selectedCommand} 
                  onChange={(e) => setSelectedCommand(e.target.value)}
                  className="command-select"
                >
                  {telnetCommands.map(command => (
                    <option key={command.id} value={command.id}>
                      {command.name} - {command.command}
                    </option>
                  ))}
                </select>
                <small className="command-description">
                   {telnetCommands.find(c => c.id === selectedCommand)?.description}
                </small>
                {telnetCommands.find(c => c.id === selectedCommand)?.type === 'monitoring' && (
                  <div style={{ marginTop: '8px' }}>
                    <label style={{ display: 'block', marginBottom: '4px' }}>
                      Durée monitoring (secondes)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={600}
                      value={Math.round(singleMonitorDurationMs / 1000)}
                      onChange={(e) => {
                        const seconds = Number(e.target.value) || 0;
                        const clamped = Math.max(1, Math.min(600, seconds));
                        setSingleMonitorDurationMs(clamped * 1000);
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {isSequenceMode && permissions.canRunTests() && (
              <div className="form-group sequence-builder" style={{ gridColumn: '1 / -1' }}>
                <label>Constructeur de séquence</label>

                {/* Sélection des commandes disponibles */}
                <div className="available-commands">
                  <h4>Commandes disponibles</h4>
                  <div className="commands-grid">
                    {telnetCommands.map(command => {
                      const isMonitoringCmd = command.type === 'monitoring';
                      return (
                        <div key={command.id} className="command-card">
                          <div className="command-info">
                            <strong>{command.command}</strong>
                          </div>
                          <div className="command-actions">
                            <button 
                              onClick={() => {
                                addCommandToSequence(command.id, isMonitoringCmd, 20000);
                              }}
                              className="add-command-btn"
                              title="Ajouter à la séquence"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Séquence en cours */}
                <div className="current-sequence">
                  <div className="sequence-header">
                    <h4>Séquence ({selectedSequence.length} étape{selectedSequence.length > 1 ? 's' : ''})</h4>
                    {selectedSequence.length > 0 && (
                      <button onClick={clearSequence} className="clear-sequence-btn">
                        Vider
                      </button>
                    )}
                  </div>

                  {selectedSequence.length === 0 ? (
                    <p className="empty-sequence">
                      Aucune commande dans la séquence. Ajoutez des commandes depuis la liste ci-dessus.
                    </p>
                  ) : (
                    <div className="sequence-list">
                      {selectedSequence.map((step, index) => {
                        const command = telnetCommands.find(c => c.id === step.commandId);
                        const isMonitoringStep = step.type === 'monitoring' || command?.type === 'monitoring';
                        
                        return (
                          <div key={index} className={`sequence-step ${isMonitoringStep ? 'monitoring-step' : ''}`}>
                            <div className="step-number">{index + 1}</div>
                            <div className="step-content">
                              <div className="step-main">
                                <strong>
                                  {command?.command || step.commandId}
                                </strong>
                              </div>
                              {isMonitoringStep && (
                                <div className="step-duration">
                                  <label>
                                    Durée (secondes)&nbsp;
                                    <input
                                      type="number"
                                      min={1}
                                      max={600}
                                      value={Math.round((step.duration || 20000) / 1000)}
                                      onChange={(e) => {
                                        const seconds = Number(e.target.value) || 0;
                                        const clamped = Math.max(1, Math.min(600, seconds));
                                        updateSequenceStepDuration(index, clamped * 1000);
                                      }}
                                    />
                                  </label>
                                </div>
                              )}
                            </div>
                            <div className="step-controls">
                              <button 
                                onClick={() => moveSequenceStep(index, 'up')}
                                disabled={index === 0}
                                className="move-btn"
                                title="Monter"
                              >
                                ^
                              </button>
                              <button 
                                onClick={() => moveSequenceStep(index, 'down')}
                                disabled={index === selectedSequence.length - 1}
                                className="move-btn"
                                title="Descendre"
                              >
                                v
                              </button>
                              <button 
                                onClick={() => removeCommandFromSequence(index)}
                                className="remove-btn"
                                title="Supprimer"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button 
            onClick={runTest} 
            disabled={!selectedSlot || !permissions.canRunTests() || (isSequenceMode && selectedSequence.length === 0) || loading}
            className="test-button"
          >
            {loading ? (
              <span>
                EXÉCUTION EN COURS...
                <span className="loading-spinner"></span>
              </span>
            ) : (
              <span>
                {isSequenceMode ? ` EXÉCUTER LA SÉQUENCE (${selectedSequence.length} étapes)` : 'INITIER LE TEST'}
              </span>
            )}
          </button>
        </div>

        {/* Supervision des Tests en Temps Réel */}
        {activeTests.length > 0 && (
          <div className="test-progress">
            <h2>Supervision temps réel ({activeTests.length} actif(s))</h2>
            <div className="active-tests-grid">
              {activeTests.map((test) => (
                <div key={test.testId} className="active-test-card">
                  <div className="test-header">
                    <span className="test-id">
                      SÉQUENCE #{test.testId}
                    </span>
                    <div className="test-controls">
                      {test.status === 'PENDING' && (
                        <button 
                          className="stop-button"
                          onClick={() => {
                            console.log('Clic sur arrêt pour test:', test.testId, 'statut:', test.status);
                            stopTest(test.testId);
                          }}
                          title="Arrêter le test"
                        >
                          ARRÊT D'URGENCE
                        </button>
                      )}
                      <span className={getStatusClass(test.status)}>
                        <span>{getStatusLabel(test.status, t)}</span>
                      </span>
                    </div>
                  </div>

                  <div className="progress-row">
                    <div className="progress-track">
                      <div
                        className={`progress-bar ${test.status === 'SUCCESS' ? 'progress-success' : test.status === 'FAIL' ? 'progress-fail' : 'progress-pending'}`}
                        style={{ width: `${getProgressPercent(test.steps, test.status)}%` }}
                      />
                    </div>
                    <div className="progress-meta">
                      <span>{getProgressPercent(test.steps, test.status)}%</span>
                      <span className="muted">{calculateDuration(test.startTime, test.endTime)}</span>
                    </div>
                  </div>

                  <div className="test-steps">
                    {test.steps.map((step, index) => (
                      <div key={index} className="step-item">
                        <div className="step-header">
                          <span className="step-number">Étape {step.step}</span>
                          <span className={getStatusClass(step.status)}>
                            <span>{step.status}</span>
                          </span>
                        </div>
                        <div className="step-description">{step.description}</div>
                        <div className="step-timestamp">
                          {new Date(step.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>

                  {test.logs.length > 0 && (
                    <div className="test-logs">
                      <h4>JOURNAUX D'EXÉCUTION</h4>
                      <div className="test-logs-body">
                      {test.logs.map((l, idx) => {
                        const level = getLogLevel(l);
                        const levelClass = level === 'default' ? '' : `log-level-${level}`;
                        // Mettre en évidence les résultats de commandes
                        if (l.includes('Commande') && l.includes('exécutée')) {
                          return (
                            <div key={idx} className={`log-entry log-command ${levelClass}`.trim()}>
                              <span className="log-label">COMMANDE:</span>
                              <span className="log-content">{l}</span>
                            </div>
                          );
                        }
                        // Mettre en évidence les événements de monitoring
                        if (l.includes('Événement:')) {
                          return (
                            <div key={idx} className={`log-entry log-monitoring ${levelClass}`.trim()}>
                              <span className="log-label">ÉVÉNEMENT:</span>
                              <span className="log-content">{l}</span>
                            </div>
                          );
                        }
                        // Mettre en évidence les réponses Telnet
                        if (l.includes('root@f5686b') || l.includes('f5686b login')) {
                          return (
                            <div key={idx} className={`log-entry log-response ${levelClass}`.trim()}>
                              <span className="log-label">RÉPONSE TELNET:</span>
                              <span className="log-content">{l}</span>
                            </div>
                          );
                        }
                        // Mettre en évidence les connexions
                        if (l.includes('Connexion')) {
                          return (
                            <div key={idx} className={`log-entry log-connection ${levelClass}`.trim()}>
                              <span className="log-label">CONNEXION:</span>
                              <span className="log-content">{l}</span>
                            </div>
                          );
                        }
                        // Log normal
                        return (
                          <div key={idx} className={`log-entry ${levelClass}`.trim()}>
                            <span className="log-content">{l}</span>
                          </div>
                        );
                      })}
                      </div>
                    </div>
                  )}

                  {/* Affichage des événements de monitoring en temps réel */}
                  {test.isMonitoring && (monitoringEventsStorage[test.testId] || test.monitoringEvents) && ((monitoringEventsStorage[test.testId]?.length || test.monitoringEvents?.length || 0) > 0) && (
                    <div className="monitoring-events">
                      <h4>ÉVÉNEMENTS TEMPS RÉEL ({(monitoringEventsStorage[test.testId]?.length || test.monitoringEvents?.length || 0)})</h4>
                      <div className="events-list">
                        {(monitoringEventsStorage[test.testId] || test.monitoringEvents || []).map((event: MonitoringEvent, idx: number) => (
                          <div key={idx} className="event-item">
                            <span className="event-timestamp">
                              {new Date(event.timestamp).toLocaleTimeString()}
                            </span>
                            <span className="event-data">
                              {event.data}
                            </span>
                          </div>
                        ))}
                      </div>
                      {test.status === 'PENDING' && (
                        <div className="monitoring-indicator">
                          <span className="pulse"></span> Monitoring en cours...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Historique des Tests - Tous les utilisateurs */}
        {(() => {
          const filteredResults = testResults.filter(r => {
            const matchId = searchId === '' || String(r.id).includes(searchId);
            const matchStatus = statusFilter === '' || r.status === statusFilter;
            return matchId && matchStatus;
          });
          const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
          const paginatedResults = filteredResults.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
          return (
            <div className="results-section">
              <div className="results-header">
                <h2>Historique des Tests ({filteredResults.length} au total)</h2>
                <div className="results-controls">
                  <input
                    type="text"
                    placeholder="Rechercher par ID..."
                    className="search-input"
                    value={searchId}
                    onChange={(e) => { setSearchId(e.target.value); setCurrentPage(1); }}
                  />
                  <select
                    className="filter-select"
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                  >
                    <option value="">Tous les statuts</option>
                    <option value="SUCCESS">Succès</option>
                    <option value="FAIL">Échec</option>
                    <option value="PENDING">En cours</option>
                  </select>
                </div>
              </div>
              <div className="results-table">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Poste</th>
                      <th>Produit</th>
                      <th>Slot</th>
                      <th>Statut</th>
                      <th>Date de début</th>
                      <th>Date de fin</th>
                      <th>Durée</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedResults.map(result => (
                      <tr key={result.id} className={result.status === 'SUCCESS' ? 'row-success' : result.status === 'FAIL' ? 'row-fail' : 'row-pending'}>
                        <td><span className="result-id">#{result.id}</span></td>
                        <td>{getPosteName(result.posteId)}</td>
                        <td>{getProduitName(result.produitId)}</td>
                        <td>{getSlotName(result.slotId)}</td>
                        <td>
                          <span className={`status-pill ${getStatusClass(result.status)}`}>
                            <span>{getStatusLabel(result.status, t)}</span>
                          </span>
                        </td>
                        <td>{new Date(result.startTime).toLocaleString()}</td>
                        <td>{new Date(result.endTime).toLocaleString()}</td>
                        <td className="duration-cell">{calculateDuration(result.startTime, result.endTime)}</td>
                        <td>
                          <button
                            className="action-button"
                            onClick={() => setSelectedResult(result)}
                          >
                            Détails
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="pagination-controls">
                  <button
                    className="pagination-btn"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Précédent
                  </button>
                  <span className="pagination-info">
                    Page {currentPage} / {totalPages} ({filteredResults.length} tests)
                  </span>
                  <button
                    className="pagination-btn"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Suivant
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* Modal de détails du test */}
        {selectedResult && (
          <div className="result-modal" onClick={() => setSelectedResult(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Détails du Test #{selectedResult.id}</h3>
                <button className="close-button" onClick={() => setSelectedResult(null)}>×</button>
              </div>
              <div className="modal-body">
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Poste:</span>
                    <span className="detail-value">{getPosteName(selectedResult.posteId)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Produit:</span>
                    <span className="detail-value">{getProduitName(selectedResult.produitId)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Slot:</span>
                    <span className="detail-value">{getSlotName(selectedResult.slotId)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Statut:</span>
                    <span className={`status-pill ${getStatusClass(selectedResult.status)}`}>
                      <span>{getStatusLabel(selectedResult.status, t)}</span>
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Durée totale:</span>
                    <span className="detail-value">{calculateDuration(selectedResult.startTime, selectedResult.endTime)}</span>
                  </div>
                </div>
                
                <div className="steps-section">
                  <h4>Étapes d'exécution</h4>
                  <div className="steps-list">
                    {selectedResult.steps.map((step, index) => (
                      <div key={index} className="step-detail">
                        <div className="step-header">
                          <span className="step-number">Étape {step.step}</span>
                          <span className={getStatusClass(step.status)}>
                            <span>{step.status}</span>
                          </span>
                        </div>
                        <div className="step-description">{step.description}</div>
                        <div className="step-timestamp">{new Date(step.timestamp).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {selectedResult.logs.length > 0 && (
                  <div className="logs-section">
                    <h4>Journaux d'exécution</h4>
                    <div className="logs-content">
                      {selectedResult.logs.map((log, index) => {
                        const isPcToGw = log.includes('(pc→gw)') || log.includes('(pc->gw)');
                        const isGwToPc = log.includes('(gw→pc)') || log.includes('(gw->pc)');
                        const isMonitoring = log.startsWith('Monitoring:') || log.startsWith('Monitoring ');
                        const isAuth = log.includes('Authentification');
                        let lineClass = 'log-line';
                        if (isPcToGw) lineClass += ' log-pc-to-gw';
                        else if (isGwToPc) lineClass += ' log-gw-to-pc';
                        else if (isMonitoring) lineClass += ' log-monitoring';
                        else if (isAuth) lineClass += ' log-auth';
                        return (
                          <div key={index} className={lineClass}>{log}</div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Section Administration - Visible directement pour les admins */}
        {permissions.isAdmin() && (
          <>
            {/* Statistiques Système */}
            {systemStats && (
              <div className="results-section">
                <div className="results-header">
                  <h2>Statistiques Système</h2>
                </div>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-label">Total Tests</span>
                    <span className="stat-value">{systemStats.totalTests}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Tests Réussis</span>
                    <span className="stat-value">{systemStats.successfulTests}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Tests Échoués</span>
                    <span className="stat-value">{systemStats.failedTests}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Tests en Cours</span>
                    <span className="stat-value">{systemStats.pendingTests}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Utilisateurs Actifs</span>
                    <span className="stat-value">{systemStats.activeUsers}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Uptime Système</span>
                    <span className="stat-value">{formatDuration(systemStats.systemUptime)}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
