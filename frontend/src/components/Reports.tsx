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

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

const SYSTEM_LINE_PATTERNS = [
  /^Démarrage /,
  /^Initialisation de la connexion/,
  /^Connexion établie/,
  /^Authentification Telnet/,
  /^Analyse des r/,
  /^Connexion fermée/,
  /^Test Telnet/,
  /^Tentative de connexion/,
  /^Envoi de la commande/,
  /^Attente de la r/,
  /^Timeout/,
  /^Reconnexion/,
  /^Séquence\s+(intégrée\s+)?terminée/,
  /^Séquence de \d+ commandes terminée/,
  /^Exécution de la commande/,
  /^Terminé:/,
  /→\s*(SUCCESS|FAIL|RUNNING|PENDING)$/,
  /^Étape\s+\d+\/\d+:/,
  /^Tous les événements attendus reçus/,
  /^Test arrêté par/,
  /^Connexion terminée/,
];

function isSystemLine(content: string): boolean {
  return SYSTEM_LINE_PATTERNS.some(r => r.test(content));
}

type LogEntry = { dir: 'cmd' | 'resp' | 'mon' | 'auth' | 'err' | 'other'; text: string };

function parseLogs(logs: string[]): LogEntry[] {
  const result: LogEntry[] = [];

  for (const line of logs) {
    const content = line.replace(/^\[[^\]]+\]\s*/, '').trim();
    if (!content) continue;

    // ── New format: explicit (pc→gw) / (gw→pc) markers ────────────────
    if (content.includes('(pc→gw)') || content.includes('(pc->gw)')) {
      result.push({ dir: 'cmd', text: content.replace(/\(pc[→-]>gw\)\s*/, '') });
      continue;
    }
    if (content.includes('(gw→pc)') || content.includes('(gw->pc)')) {
      result.push({ dir: 'resp', text: content.replace(/\(gw[→-]>pc\)\s*/, '') });
      continue;
    }

    // ── Monitoring / auth ───────────────────────────────────────────────
    if (content.startsWith('Monitoring:') || content.startsWith('Monitoring ')) {
      result.push({ dir: 'mon', text: content });
      continue;
    }
    if (content.startsWith('Événement:')) {
      result.push({ dir: 'mon', text: content });
      continue;
    }
    if (content.includes('Authentification')) {
      result.push({ dir: 'auth', text: content });
      continue;
    }

    // ── Old format: Commande "CMD" exécutée: "RESP" ────────────────────
    const cmdMatch = content.match(/^Commande\s+"([^"]+)"\s+exécutée:\s+"([\s\S]+)"$/);
    if (cmdMatch) {
      result.push({ dir: 'cmd',  text: cmdMatch[1] });
      if (cmdMatch[2].trim()) result.push({ dir: 'resp', text: cmdMatch[2] });
      continue;
    }

    // ── Old format: Étape N: Name - "RESP" (with response in quotes) ───
    const etapeRespMatch = content.match(/^Étape\s+\d+:\s+(.+?)\s+-\s+"([\s\S]+)"$/);
    if (etapeRespMatch) {
      result.push({ dir: 'cmd',  text: etapeRespMatch[1] });
      result.push({ dir: 'resp', text: etapeRespMatch[2] });
      continue;
    }

    // ── Old format: Étape N: Name - Événement monitoring - KEY_XXX ─────
    const etapeEvtMatch = content.match(/^Étape\s+\d+:\s+.+?-\s+Événement monitoring\s+-\s+(KEY_\S+)$/);
    if (etapeEvtMatch) {
      result.push({ dir: 'mon', text: `Événement: ${etapeEvtMatch[1]}` });
      continue;
    }

    // ── Any remaining Étape N: line → skip (system/monitoring status) ──
    if (/^Étape\s+\d+:/.test(content)) continue;

    // ── Réponse / Exécution (other backend formats) ─────────────────────
    if (content.startsWith('→ ')) {
      result.push({ dir: 'cmd',  text: content.slice(2) });
      continue;
    }
    if (content.startsWith('Exécution: ')) {
      result.push({ dir: 'cmd',  text: content.slice(11) });
      continue;
    }
    if (content.startsWith('Réponse: ')) {
      result.push({ dir: 'resp', text: content.slice(9) });
      continue;
    }

    // ── Errors ─────────────────────────────────────────────────────────
    if (/erreur|error/i.test(content)) {
      result.push({ dir: 'err', text: content });
      continue;
    }

    // ── System lines → skip ─────────────────────────────────────────────
    if (isSystemLine(content)) continue;

    // ── Anything else ───────────────────────────────────────────────────
    result.push({ dir: 'other', text: content });
  }

  return result;
}

const Reports: React.FC = () => {
  const [reports, setReports]               = useState<Report[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState('');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showReportModal, setShowReportModal]     = useState(false);
  const [user, setUser]                     = useState<any>(null);

  const [generateForm, setGenerateForm] = useState({
    slotId: '', posteId: '', produitId: '',
    startDate: '', endDate: '', statusFilter: 'all'
  });

  const [postes, setPostes]       = useState<any[]>([]);
  const [produits, setProduits]   = useState<any[]>([]);
  const [slots, setSlots]         = useState<any[]>([]);
  const [cmdNames, setCmdNames]   = useState<Record<string, string>>({});
  const permissions = usePermissions(user);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const response = await reportService.getReports();
      setReports(response?.reports || []);
    } catch {
      setError('Erreur lors du chargement des rapports');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [p, pr, s, cmdsRes] = await Promise.all([
        posteService.getPostes(),
        produitService.getProduits(),
        slotService.getSlots(),
        fetch('/telnet-commands', { headers }).then(r => r.json()).catch(() => ({ commands: [] }))
      ]);
      setPostes(p || []);
      setProduits(pr || []);
      setSlots(s || []);
      const map: Record<string, string> = {};
      for (const c of (cmdsRes?.commands || [])) {
        map[c.id] = c.name || c.command || c.id;
      }
      setCmdNames(map);
    } catch {
      setError('Erreur lors du chargement des données de configuration');
    }
  }, []);

  useEffect(() => {
    const userData = sessionStorage.getItem('user');
    if (userData) {
      try { setUser(JSON.parse(userData)); } catch { /* ignore */ }
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
        generateForm.endDate   || undefined,
        generateForm.statusFilter !== 'all' ? generateForm.statusFilter : undefined
      );
      await loadReports();
      setShowGenerateModal(false);
      setGenerateForm({ slotId: '', posteId: '', produitId: '', startDate: '', endDate: '', statusFilter: 'all' });
      if (response?.report) {
        setSelectedReport(response.report);
        setShowReportModal(true);
      }
    } catch {
      setError('Erreur lors de la génération du rapport. Vérifiez les paramètres.');
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm('Supprimer ce rapport ?')) return;
    try {
      await reportService.deleteReport(reportId);
      setReports(prev => prev.filter(r => r.id !== reportId));
      if (selectedReport?.id === reportId) { setSelectedReport(null); setShowReportModal(false); }
    } catch {
      setError('Erreur lors de la suppression du rapport');
    }
  };

  const handleViewReport = async (reportId: string) => {
    try {
      const response = await reportService.getReportById(reportId);
      if (response?.report) { setSelectedReport(response.report); setShowReportModal(true); }
    } catch {
      setError('Erreur lors de l\'affichage du rapport');
    }
  };

  // ── PDF export ──────────────────────────────────────────────────────────────

  const exportToPDF = (report: Report) => {
    const produit = produits.find(p => p.id === report.deviceInfo?.produitId);
    const slot    = slots.find(s => s.id === report.deviceInfo?.slotId);

    const testsHTML = report.tests.map((test: any, i: number) => {
      const pass     = test.status === 'SUCCESS';
      const cmdLabel = cmdNames[test.commandId] || test.commandId || 'N/A';
      const pdfLines = parseLogs(test.logs || []);
      const logsRows = pdfLines.length === 0
        ? `<div class="tl-row tl-other"><span class="tl-txt tl-empty">${test.status === 'SUCCESS' ? 'Commande exécutée avec succès — logs détaillés non disponibles.' : 'Échec — logs détaillés non disponibles.'}</span></div>`
        : pdfLines.map(l => {
            if (l.dir === 'cmd')
              return `<div class="tl-row tl-cmd"><span class="tl-dir">(pc→gw)</span><span class="tl-txt">${escHtml(l.text)}</span></div>`;
            if (l.dir === 'resp')
              return `<div class="tl-row tl-resp"><span class="tl-dir">(gw→pc)</span><span class="tl-txt">${escHtml(l.text)}</span></div>`;
            if (l.dir === 'mon')
              return `<div class="tl-row tl-mon"><span class="tl-txt">${escHtml(l.text)}</span></div>`;
            if (l.dir === 'auth')
              return `<div class="tl-row tl-auth"><span class="tl-txt">${escHtml(l.text)}</span></div>`;
            if (l.dir === 'err')
              return `<div class="tl-row tl-err"><span class="tl-dir">(!)</span><span class="tl-txt">${escHtml(l.text)}</span></div>`;
            return `<div class="tl-row tl-other"><span class="tl-txt">${escHtml(l.text)}</span></div>`;
          }).join('');

      return `
        <div class="test-section">
          <div class="test-header">
            <span class="test-num">#${i + 1}</span>
            <span class="test-cmd">${escHtml(cmdLabel)}</span>
            <span class="test-badge ${pass ? 'badge-pass' : 'badge-fail'}">${pass ? 'PASS' : 'FAIL'}</span>
          </div>
          <div class="test-transcript">${logsRows}</div>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Rapport ${report.id}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; background: #fff; color: #0f172a; font-size: 11px; padding: 32px 40px; }

    /* ── Report header ── */
    .rpt-header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    .rpt-title  { font-size: 20px; font-weight: 800; letter-spacing: -0.3px; color: #0f172a; }
    .rpt-sub    { font-size: 10px; color: #64748b; margin-top: 2px; }
    .rpt-meta   { text-align: right; font-size: 10px; color: #475569; line-height: 1.7; }
    .rpt-meta strong { color: #0f172a; }

    /* ── Info strip ── */
    .info-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #e2e8f0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-bottom: 24px; }
    .info-cell  { background: #f8fafc; padding: 10px 14px; }
    .info-label { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; margin-bottom: 3px; }
    .info-value { font-size: 11px; font-weight: 600; color: #0f172a; font-family: 'Consolas', monospace; }

    /* ── Test section ── */
    .test-section { border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 14px; overflow: hidden; page-break-inside: avoid; }
    .test-header  { display: flex; align-items: center; gap: 10px; padding: 8px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .test-num     { font-size: 9px; font-weight: 700; color: #94a3b8; width: 20px; flex-shrink: 0; }
    .test-cmd     { flex: 1; font-family: 'Consolas', monospace; font-size: 11px; font-weight: 600; color: #0f172a; }
    .test-badge   { font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 10px; letter-spacing: 0.05em; flex-shrink: 0; }
    .badge-pass   { background: #dcfce7; color: #15803d; }
    .badge-fail   { background: #fee2e2; color: #dc2626; }
    .test-transcript { padding: 8px 6px; display: flex; flex-direction: column; gap: 2px; }

    /* ── Transcript lines ── */
    .tl-row  { display: flex; gap: 8px; align-items: flex-start; padding: 3px 8px; border-radius: 3px; }
    .tl-dir  { font-weight: 700; white-space: nowrap; flex-shrink: 0; font-size: 9.5px; padding-top: 1px; font-family: 'Consolas', monospace; }
    .tl-txt  { flex: 1; font-family: 'Consolas', monospace; font-size: 10px; line-height: 1.5; word-break: break-all; color: #1e293b; }
    .tl-cmd  { background: #eff6ff; } .tl-cmd  .tl-dir { color: #1d4ed8; } .tl-cmd .tl-txt { color: #1e3a8a; }
    .tl-resp { background: #f0fdf4; } .tl-resp .tl-dir { color: #15803d; } .tl-resp .tl-txt { color: #14532d; }
    .tl-mon  { background: #faf5ff; } .tl-mon  .tl-txt { color: #6b21a8; font-style: italic; }
    .tl-auth { background: #fffbeb; } .tl-auth .tl-txt { color: #92400e; font-style: italic; }
    .tl-err  { background: #fef2f2; } .tl-err  .tl-dir { color: #dc2626; } .tl-err .tl-txt { color: #991b1b; }
    .tl-other .tl-txt { color: #64748b; }
    .tl-empty { font-style: italic; color: #94a3b8; }

    /* ── Footer ── */
    .rpt-footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; }

    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="rpt-header">
    <div>
      <div class="rpt-title">Rapport de Test Telnet</div>
      <div class="rpt-sub">Telnet Test Manager · Rapport automatisé</div>
    </div>
    <div class="rpt-meta">
      <div><strong>ID</strong> ${escHtml(report.id)}</div>
      <div><strong>Date</strong> ${fmtDate(report.createdAt)}</div>
      <div><strong>Généré par</strong> ${escHtml(report.generatedBy || '—')}</div>
    </div>
  </div>

  <div class="info-strip">
    <div class="info-cell">
      <div class="info-label">Appareil</div>
      <div class="info-value">${escHtml(report.deviceInfo?.adresse || '—')}:${report.deviceInfo?.port ?? '—'}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Produit</div>
      <div class="info-value">${escHtml(produit?.nom || `#${report.deviceInfo?.produitId}`)}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Slot</div>
      <div class="info-value">${escHtml(slot?.nom || `#${report.deviceInfo?.slotId}`)}</div>
    </div>
  </div>

  ${testsHTML}

  <div class="rpt-footer">
    <span>Telnet Test Manager</span>
    <span>${report.tests?.length ?? 0} test(s) · ${fmtDate(report.createdAt)}</span>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Autorisez les popups pour exporter le PDF'); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  };

  return (
    <div className="reports-container">
      {/* Page header */}
      <div className="reports-header">
        <h1>Rapports de Tests</h1>
        <div className="header-actions">
          {permissions.canRunTests() && (
            <button className="btn btn-primary" onClick={() => setShowGenerateModal(true)}>
              + Générer un rapport
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="error-message">
          <span>{error}</span>
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      {/* Reports list */}
      {loading ? (
        <div className="loading">Chargement…</div>
      ) : reports.length === 0 ? (
        <div className="empty-state">
          <h3>Aucun rapport</h3>
          <p>Générez votre premier rapport pour voir les résultats des tests.</p>
        </div>
      ) : (
        <div className="reports-list">
          <div className="table-responsive">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Appareil</th>
                  <th>Produit</th>
                  <th>Slot</th>
                  <th>Généré par</th>
                  <th>Résultat</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(report => {
                  const produit = produits.find(p => p.id === report.deviceInfo?.produitId);
                  const slot    = slots.find(s => s.id === report.deviceInfo?.slotId);
                  const pass = report.summary?.success ?? 0;
                  const fail = report.summary?.failure ?? 0;
                  return (
                    <tr key={report.id}>
                      <td className="rpt-date">{fmtDate(report.createdAt)}</td>
                      <td className="rpt-mono">{report.deviceInfo?.adresse}:{report.deviceInfo?.port}</td>
                      <td>{produit?.nom || '—'}</td>
                      <td>{slot?.nom || '—'}</td>
                      <td>{report.generatedBy || '—'}</td>
                      <td>
                        <span className="result-pill">
                          <span className="rp-pass">{pass}</span>
                          <span className="rp-sep">/</span>
                          <span className="rp-fail">{fail}</span>
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button className="btn btn-sm btn-info"    onClick={() => { setSelectedReport(report); setShowReportModal(true); }}>Voir</button>
                          <button className="btn btn-sm btn-primary" onClick={() => exportToPDF(report)}>PDF</button>
                          <button className="btn btn-sm btn-danger"  onClick={() => handleDeleteReport(report.id)}>Supprimer</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Génération modal ── */}
      {showGenerateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Générer un rapport</h2>
              <button className="btn-close" onClick={() => setShowGenerateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Poste</label>
                <select value={generateForm.posteId}
                  onChange={e => setGenerateForm({ ...generateForm, posteId: e.target.value, produitId: '', slotId: '' })}>
                  <option value="">Sélectionner un poste</option>
                  {postes.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Produit</label>
                <select value={generateForm.produitId} disabled={!generateForm.posteId}
                  onChange={e => setGenerateForm({ ...generateForm, produitId: e.target.value, slotId: '' })}>
                  <option value="">Sélectionner un produit</option>
                  {produits.filter(p => p.posteId === parseInt(generateForm.posteId))
                    .map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Slot</label>
                <select value={generateForm.slotId} disabled={!generateForm.produitId}
                  onChange={e => setGenerateForm({ ...generateForm, slotId: e.target.value })}>
                  <option value="">Sélectionner un slot</option>
                  {slots.filter(s => s.produitId === parseInt(generateForm.produitId))
                    .map(s => <option key={s.id} value={s.id}>{s.nom} ({s.adresse}:{s.port})</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date début</label>
                  <input type="date" value={generateForm.startDate}
                    onChange={e => setGenerateForm({ ...generateForm, startDate: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Date fin</label>
                  <input type="date" value={generateForm.endDate}
                    onChange={e => setGenerateForm({ ...generateForm, endDate: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Inclure les tests</label>
                <select value={generateForm.statusFilter}
                  onChange={e => setGenerateForm({ ...generateForm, statusFilter: e.target.value })}>
                  <option value="all">Tous les tests</option>
                  <option value="success">Pass seulement</option>
                  <option value="fail">Fail seulement</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowGenerateModal(false)}>Annuler</button>
              <button className="btn btn-primary"   onClick={handleGenerateReport} disabled={!generateForm.slotId}>Générer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Report view modal ── */}
      {showReportModal && selectedReport && (() => {
        const produit = produits.find(p => p.id === selectedReport.deviceInfo?.produitId);
        const slot    = slots.find(s => s.id === selectedReport.deviceInfo?.slotId);
        return (
          <div className="modal-overlay">
            <div className="modal modal-xl">
              {/* Header */}
              <div className="modal-header">
                <div className="rview-title-block">
                  <h2>Rapport de Test</h2>
                  <span className="rview-id">{selectedReport.id}</span>
                </div>
                <button className="btn-close" onClick={() => setShowReportModal(false)}>×</button>
              </div>

              {/* Info strip */}
              <div className="rview-strip">
                <div className="rview-cell">
                  <span className="rview-label">Date</span>
                  <span className="rview-val">{fmtDate(selectedReport.createdAt)}</span>
                </div>
                <div className="rview-cell">
                  <span className="rview-label">Appareil</span>
                  <span className="rview-val mono">{selectedReport.deviceInfo?.adresse}:{selectedReport.deviceInfo?.port}</span>
                </div>
                <div className="rview-cell">
                  <span className="rview-label">Produit</span>
                  <span className="rview-val">{produit?.nom || '—'}</span>
                </div>
                <div className="rview-cell">
                  <span className="rview-label">Slot</span>
                  <span className="rview-val">{slot?.nom || '—'}</span>
                </div>
                <div className="rview-cell">
                  <span className="rview-label">Généré par</span>
                  <span className="rview-val">{selectedReport.generatedBy || '—'}</span>
                </div>
              </div>

              {/* Tests */}
              <div className="modal-body rview-body">
                {(selectedReport.tests || []).length === 0 ? (
                  <div className="rview-empty">Aucun test dans ce rapport</div>
                ) : (selectedReport.tests as any[]).map((test, i) => {
                  const pass     = test.status === 'SUCCESS';
                  const cmdLabel = cmdNames[test.commandId] || test.commandId || 'N/A';
                  const lines    = parseLogs(test.logs || []);
                  return (
                    <div key={i} className={`rview-test ${pass ? 'rview-test-pass' : 'rview-test-fail'}`}>
                      <div className="rview-test-header">
                        <span className="rview-test-num">#{i + 1}</span>
                        <span className="rview-test-name">{cmdLabel}</span>
                        <span className={`rview-badge ${pass ? 'rview-badge-pass' : 'rview-badge-fail'}`}>
                          {pass ? 'PASS' : 'FAIL'}
                        </span>
                      </div>
                      {lines.length > 0 && (
                        <div className="rview-transcript">
                          {lines.map((l, j) => (
                            <div key={j} className={`rview-log rview-log-${l.dir}`}>
                              {(l.dir === 'cmd' || l.dir === 'resp' || l.dir === 'err') && (
                                <span className="rview-log-dir">
                                  {l.dir === 'cmd' ? '(pc→gw)' : l.dir === 'resp' ? '(gw→pc)' : '(!)'}
                                </span>
                              )}
                              <span className="rview-log-text">{l.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowReportModal(false)}>Fermer</button>
                <button className="btn btn-primary"   onClick={() => exportToPDF(selectedReport)}>Exporter PDF</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default Reports;
