import React, { useState, useEffect, useCallback } from 'react';
import { reportService, posteService, produitService, slotService } from '../services/api';
import { usePermissions } from '../hooks/usePermissions';
import './Reports.css';

interface Report {
  id: string;
  createdAt: string;
  deviceInfo: {
    slotId: number;
    posteId: number;
    produitId: number;
    adresse: string;
    port: number;
  };
  summary: {
    total: number;
    success: number;
    failure: number;
    successRate: number;
  };
  tests: any[];
  generatedBy: string;
}

const Reports: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  const [generateForm, setGenerateForm] = useState({
    slotId: '',
    posteId: '',
    produitId: '',
    startDate: '',
    endDate: '',
    statusFilter: 'all'
  });

  const [postes, setPostes] = useState<any[]>([]);
  const [produits, setProduits] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const permissions = usePermissions(user);

  // Utilisation de useCallback pour éviter les recréations de fonctions à chaque rendu
  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const response = await reportService.getReports();
      // Vérification de la structure de la réponse
      setReports(response?.reports || []);
    } catch (err) {
      console.error('Erreur chargement rapports:', err);
      setError('Erreur lors du chargement des rapports');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [postesData, produitsData, slotsData] = await Promise.all([
        posteService.getPostes(),
        produitService.getProduits(),
        slotService.getSlots()
      ]);
      
      setPostes(postesData || []);
      setProduits(produitsData || []);
      setSlots(slotsData || []);
    } catch (err: any) {
      console.error('Erreur chargement données:', err);
      setError('Erreur lors du chargement des données de configuration');
    }
  }, []);

  useEffect(() => {
    const userData = sessionStorage.getItem('user');
    if (userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
      } catch (error) {
        console.error('Erreur parsing user data:', error);
      }
    }
    
    loadReports();
    loadData();
  }, [loadReports, loadData]);

  const handleGenerateReport = async () => {
    try {
      setError('');
      const response = await reportService.generateReport(
        parseInt(generateForm.slotId),
        parseInt(generateForm.posteId),
        parseInt(generateForm.produitId),
        generateForm.startDate || undefined,
        generateForm.endDate || undefined,
        generateForm.statusFilter !== 'all' ? generateForm.statusFilter : undefined
      );
      
      await loadReports();
      setShowGenerateModal(false);
      setGenerateForm({
        slotId: '',
        posteId: '',
        produitId: '',
        startDate: '',
        endDate: '',
        statusFilter: 'all'
      });
      
      if (response?.report) {
        setSelectedReport(response.report);
        setShowReportModal(true);
      }
    } catch (err) {
      console.error('Erreur génération rapport:', err);
      setError('Erreur lors de la génération du rapport. Vérifiez les paramètres.');
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce rapport ?')) {
      return;
    }
    
    try {
      await reportService.deleteReport(reportId);
      setReports(prev => prev.filter(r => r.id !== reportId));
      if (selectedReport?.id === reportId) {
        setSelectedReport(null);
        setShowReportModal(false);
      }
    } catch (err) {
      console.error('Erreur suppression rapport:', err);
      setError('Erreur lors de la suppression du rapport');
    }
  };

  const handleViewReport = async (reportId: string) => {
    try {
      const response = await reportService.getReportById(reportId);
      if (response?.report) {
        setSelectedReport(response.report);
        setShowReportModal(true);
      }
    } catch (err) {
      console.error('Erreur affichage rapport:', err);
      setError('Erreur lors de l\'affichage du rapport');
    }
  };

  const generateReportHTML = (report: Report): string => {
    // Calcul des statistiques pour les graphiques
    const successCount = report.summary.success;
    const failureCount = report.summary.failure;

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Rapport de Test - ${report.id}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: sans-serif; padding: 20px; color: #333; }
        .header { text-align: center; border-bottom: 2px solid #eee; padding-bottom: 20px; }
        .summary { display: flex; justify-content: space-around; margin: 20px 0; }
        .card { padding: 15px; border-radius: 8px; border: 1px solid #ddd; text-align: center; min-width: 120px; }
        .success { color: green; }
        .failure { color: red; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background-color: #f5f5f5; }
        .chart-container { width: 400px; margin: 20px auto; }
        .logs-in-table {
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            background: #f8fafc;
            font-family: 'Consolas', monospace;
        }
        .log-entry {
            display: flex;
            gap: 8px;
            align-items: flex-start;
            padding: 5px 8px;
            font-size: 11px;
            border-bottom: 1px solid #f1f5f9;
        }
        .log-entry:last-child { border-bottom: none; }
        .log-dir {
            font-weight: 700;
            white-space: nowrap;
            flex-shrink: 0;
            font-size: 10px;
        }
        .log-entry.cmd .log-dir  { color: #1d4ed8; }
        .log-entry.resp .log-dir { color: #15803d; }
        .log-entry.err .log-dir  { color: #dc2626; }
        .log-entry.other         { color: #64748b; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Rapport de Test Automatisé</h1>
        <p>ID: ${report.id} | Date: ${new Date(report.createdAt).toLocaleString('fr-FR')}</p>
        <p>Appareil: ${report.deviceInfo.adresse}:${report.deviceInfo.port}</p>
    </div>
    
    <div class="summary">
        <div class="card"><h3>Total</h3><p>${report.summary.total}</p></div>
        <div class="card success"><h3>Succès</h3><p>${report.summary.success}</p></div>
        <div class="card failure"><h3>Échecs</h3><p>${report.summary.failure}</p></div>
        <div class="card"><h3>Taux</h3><p>${report.summary.successRate}%</p></div>
    </div>

    <div class="chart-container">
        <canvas id="resultChart"></canvas>
    </div>

    <div class="section">
        <h2> Détail Complet des Tests</h2>
        <table class="tests-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th> Commande</th>
                    <th> Statut</th>
                    <th> Durée</th>
                    <th> Logs d'Exécution</th>
                </tr>
            </thead>
            <tbody>
                ${report.tests.map((test: any, index: number) => {
                    const startTime = test.startTime ? new Date(test.startTime).toLocaleString('fr-FR') : 'N/A';
                    const endTime = test.endTime ? new Date(test.endTime).toLocaleString('fr-FR') : 'En cours...';
                    const duration = test.startTime && test.endTime 
                        ? Math.round((new Date(test.endTime).getTime() - new Date(test.startTime).getTime()) / 1000) + 's' 
                        : 'N/A';
                    const statusClass = test.status.toLowerCase();
                    
                    const logsHTML = test.logs && Array.isArray(test.logs) && test.logs.length > 0
                        ? test.logs.map((log: any) => {
                            const logStr = String(log);
                            const content = logStr.replace(/^\[[^\]]+\]\s*/, '');
                            if (content.startsWith('→ ')) {
                              return `<div class="log-entry cmd"><span class="log-dir">(pc→gw)</span> <span class="log-message">${content.slice(2)}</span></div>`;
                            } else if (content.startsWith('Réponse: ')) {
                              return `<div class="log-entry resp"><span class="log-dir">(gw→pc)</span> <span class="log-message">${content.slice(9)}</span></div>`;
                            } else if (content.toLowerCase().includes('erreur') || content.toLowerCase().includes('error')) {
                              return `<div class="log-entry err"><span class="log-dir">(!)</span> <span class="log-message">${content}</span></div>`;
                            }
                            return `<div class="log-entry other"><span class="log-message">${content}</span></div>`;
                          }).join('')
                        : '<div class="log-entry other"><span class="log-message">Aucun log</span></div>';
                    
                    return `
                        <tr>
                            <td>${startTime}</td>
                            <td><code>${test.commandId || 'N/A'}</code></td>
                            <td><span class="status-${statusClass}">${test.status}</span></td>
                            <td>${duration}</td>
                            <td>
                                <div class="logs-in-table">
                                    ${logsHTML}
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    </div>

    <script>
        const ctx = document.getElementById('resultChart').getContext('2d');
        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Succès', 'Échecs'],
                datasets: [{
                    data: [${successCount}, ${failureCount}],
                    backgroundColor: ['#27ae60', '#e74c3c']
                }]
            }
        });
    </script>
</body>
</html>`;
  };

  const exportToPDF = (report: Report) => {
    const htmlContent = generateReportHTML(report);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Veuillez autoriser les popups pour exporter le PDF');
      return;
    }
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    printWindow.onload = () => {
      printWindow.print();
      // On ne ferme pas immédiatement pour laisser le temps à l'impression
    };
  };

  return (
    <div className="reports-container">
      <div className="reports-header">
        <h1>Rapports de Tests</h1>
        <div className="header-actions">
          {permissions.canRunTests() && (
            <button 
              className="btn btn-primary" 
              onClick={() => setShowGenerateModal(true)}
            >
              Générer un rapport
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="error-message">
          <span>{error}</span>
          <button onClick={() => setError('')}>Fermer</button>
        </div>
      )}

      {loading ? (
        <div className="loading">Chargement des rapports...</div>
      ) : (
        <div className="reports-list">
          {reports.length === 0 ? (
            <div className="empty-state">
              <h3>Aucun rapport trouvé</h3>
              <p>Générez votre premier rapport pour voir les résultats des tests.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Appareil</th>
                    <th>Produit</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map(report => {
                    const produit = produits.find(p => p.id === report.deviceInfo?.produitId);
                    return (
                      <tr key={report.id}>
                        <td>{new Date(report.createdAt).toLocaleDateString('fr-FR')}</td>
                        <td>{report.deviceInfo?.adresse}:{report.deviceInfo?.port}</td>
                        <td>{produit?.nom || 'N/A'}</td>
                        <td>
                          <div className="action-buttons">
                            <button 
                              className="btn btn-sm btn-info" 
                              onClick={() => handleViewReport(report.id)}
                            >
                              Voir
                            </button>
                            <button 
                              className="btn btn-sm btn-primary" 
                              onClick={() => exportToPDF(report)}
                            >
                              Exporter PDF
                            </button>
                            <button 
                              className="btn btn-sm btn-danger" 
                              onClick={() => handleDeleteReport(report.id)}
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Génération */}
      {showGenerateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Générer un Rapport</h2>
              <button className="btn-close" onClick={() => setShowGenerateModal(false)}>Fermer</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Poste</label>
                <select 
                  value={generateForm.posteId} 
                  onChange={(e) => setGenerateForm({...generateForm, posteId: e.target.value, produitId: '', slotId: ''})}
                >
                  <option value="">Sélectionner un poste</option>
                  {postes.map(poste => <option key={poste.id} value={poste.id}>{poste.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Produit</label>
                <select 
                  value={generateForm.produitId} 
                  onChange={(e) => setGenerateForm({...generateForm, produitId: e.target.value, slotId: ''})}
                  disabled={!generateForm.posteId}
                >
                  <option value="">Sélectionner un produit</option>
                  {produits
                    .filter(p => p.posteId === parseInt(generateForm.posteId))
                    .map(produit => <option key={produit.id} value={produit.id}>{produit.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Slot</label>
                <select 
                  value={generateForm.slotId} 
                  onChange={(e) => setGenerateForm({...generateForm, slotId: e.target.value})}
                  disabled={!generateForm.produitId}
                >
                  <option value="">Sélectionner un slot</option>
                  {slots
                    .filter(s => s.produitId === parseInt(generateForm.produitId))
                    .map(slot => (
                      <option key={slot.id} value={slot.id}>
                        {slot.nom} ({slot.adresse}:{slot.port})
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label>Date début</label>
                <input type="date" value={generateForm.startDate} onChange={(e) => setGenerateForm({...generateForm, startDate: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Date fin</label>
                <input type="date" value={generateForm.endDate} onChange={(e) => setGenerateForm({...generateForm, endDate: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Inclure les tests</label>
                <select value={generateForm.statusFilter} onChange={(e) => setGenerateForm({...generateForm, statusFilter: e.target.value})}>
                  <option value="all">Tous les tests</option>
                  <option value="success">✔ Pass seulement</option>
                  <option value="fail">✖ Fail seulement</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowGenerateModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleGenerateReport} disabled={!generateForm.slotId}>Générer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Visualisation */}
      {showReportModal && selectedReport && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h2>Rapport {selectedReport.id}</h2>
              <button className="btn-close" onClick={() => setShowReportModal(false)}>Fermer</button>
            </div>
            <div className="modal-body">
              <div className="report-summary-grid">
                  <div className="summary-card">
                    <span className="label">Appareil</span>
                    <span className="value">{selectedReport.deviceInfo?.adresse}:{selectedReport.deviceInfo?.port}</span>
                  </div>
                  <div className="summary-card">
                    <span className="label">Succès</span>
                    <span className="value success">{selectedReport.summary?.successRate}%</span>
                  </div>
              </div>
              <div className="logs-section">
                <h3>Logs des tests</h3>
                <div className="logs-viewer">
                  {selectedReport.tests?.map((test, i) => (
                    <div key={i} className={`test-block ${test.status === 'SUCCESS' ? 'test-block-success' : 'test-block-fail'}`}>
                      <h4>
                        {test.commandId}
                        <span className={`test-status-badge ${test.status === 'SUCCESS' ? 'badge-success' : 'badge-fail'}`}>
                          {test.status === 'SUCCESS' ? '✔ Pass' : '✖ Fail'}
                        </span>
                      </h4>
                      <div className="log-lines">
                        {(test.logs || []).length === 0
                          ? <div className="log-empty">Aucun log</div>
                          : (test.logs as string[]).map((line, j) => {
                              const tsMatch = line.match(/^\[([^\]]+)\]\s*/);
                              const content = tsMatch ? line.slice(tsMatch[0].length) : line;
                              if (content.startsWith('→ ')) {
                                return (
                                  <div key={j} className="log-row log-cmd">
                                    <span className="log-dir">(pc→gw)</span>
                                    <span className="log-text">{content.slice(2)}</span>
                                  </div>
                                );
                              } else if (content.startsWith('Réponse: ')) {
                                return (
                                  <div key={j} className="log-row log-resp">
                                    <span className="log-dir">(gw→pc)</span>
                                    <span className="log-text">{content.slice(9)}</span>
                                  </div>
                                );
                              } else if (content.toLowerCase().includes('erreur') || content.toLowerCase().includes('error')) {
                                return (
                                  <div key={j} className="log-row log-err">
                                    <span className="log-dir">(!)</span>
                                    <span className="log-text">{content}</span>
                                  </div>
                                );
                              }
                              return (
                                <div key={j} className="log-row log-other">
                                  <span className="log-text">{content}</span>
                                </div>
                              );
                            })
                        }
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowReportModal(false)}>Fermer</button>
              <button className="btn btn-primary" onClick={() => exportToPDF(selectedReport)}>Exporter PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;