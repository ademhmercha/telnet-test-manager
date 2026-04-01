import React, { useState, useEffect, useCallback } from 'react';
import './AdminPanel.css';

const API = 'http://localhost:3002';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionStorage.getItem('token')}`
  };
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

function apiErr(e: any): string {
  return e?.message || 'Erreur serveur';
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function fmtUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

type TabId = 'overview' | 'users' | 'tests' | 'auditlogs' | 'analytics';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview',  label: 'Vue d\'ensemble', icon: '◈' },
  { id: 'users',     label: 'Utilisateurs',    icon: '◉' },
  { id: 'tests',     label: 'Tests',           icon: '◎' },
  { id: 'auditlogs', label: 'Audit Logs',      icon: '◆' },
  { id: 'analytics', label: 'Analytiques',     icon: '◑' },
];

// ══════════════════════════════════════════════════════════════════════════════
// OVERVIEW
// ══════════════════════════════════════════════════════════════════════════════

const Overview: React.FC = () => {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/admin/stats');
      setData(res);
    } catch (e) { setError(apiErr(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="ap-loading">Chargement…</div>;
  if (error)   return <div className="ap-error">{error}</div>;

  const { stats, activity } = data;

  const kpis = [
    { label: 'Tests total',       value: stats.totalTests,       sub: `${stats.successRate}% succès`,          color: 'blue'  },
    { label: 'Tests réussis',     value: stats.successfulTests,  sub: `${stats.failedTests} échecs`,           color: 'green' },
    { label: 'Workers actifs',    value: stats.activeWorkers,    sub: 'Tests en cours',                        color: stats.activeWorkers > 0 ? 'orange' : 'grey' },
    { label: 'Utilisateurs',      value: stats.totalUsers,       sub: `${stats.activeUsers} actifs`,           color: 'purple' },
    { label: 'Commandes Telnet',  value: stats.totalCommands,    sub: 'Dans la base',                          color: 'teal'  },
    { label: 'Rapports',          value: stats.totalReports,     sub: 'Générés',                               color: 'slate' },
  ];

  const maxActivity = Math.max(...activity.map((d: any) => d.total), 1);

  return (
    <div className="overview-wrap">
      {/* KPI Grid */}
      <div className="kpi-grid">
        {kpis.map(k => (
          <div key={k.label} className={`kpi-card kpi-${k.color}`}>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Success rate bar */}
      <div className="ap-card">
        <div className="ap-card-header">Taux de succès global</div>
        <div className="rate-bar-wrap">
          <div className="rate-bar-track">
            <div className="rate-bar-fill" style={{ width: `${stats.successRate}%` }} />
          </div>
          <span className="rate-bar-label">{stats.successRate}%</span>
        </div>
        <div className="rate-detail">
          <span className="rd-success">{stats.successfulTests} réussis</span>
          <span className="rd-fail">{stats.failedTests} échecs</span>
          <span className="rd-stopped">{stats.stoppedTests} arrêtés</span>
        </div>
      </div>

      {/* Activity chart (7 days) */}
      <div className="ap-card">
        <div className="ap-card-header">Activité — 7 derniers jours</div>
        <div className="bar-chart">
          {activity.map((d: any) => (
            <div key={d.date} className="bar-col">
              <div className="bar-stacked">
                <div className="bar-seg bar-fail"
                  style={{ height: `${Math.round(d.fail / maxActivity * 100)}%` }}
                  title={`${d.fail} échecs`}
                />
                <div className="bar-seg bar-success"
                  style={{ height: `${Math.round(d.success / maxActivity * 100)}%` }}
                  title={`${d.success} succès`}
                />
              </div>
              <div className="bar-label">{d.date.slice(5)}</div>
              <div className="bar-total">{d.total}</div>
            </div>
          ))}
        </div>
        <div className="chart-legend">
          <span className="legend-success">Succès</span>
          <span className="legend-fail">Échecs</span>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════════════════════════

interface UserItem {
  id: number; username: string; role: string; email: string;
  statut: string; permissions: string[]; lastLogin?: string; createdAt?: string;
}

const Users: React.FC = () => {
  const [users, setUsers]       = useState<UserItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [saving, setSaving]         = useState(false);
  const [confirmDel, setConfirmDel] = useState<UserItem | null>(null);
  const [showPwd, setShowPwd]       = useState(false);
  const [resetModal, setResetModal] = useState<UserItem | null>(null);
  const [newPwd, setNewPwd]         = useState('');
  const [pwdSaving, setPwdSaving]   = useState(false);
  const currentUserId = JSON.parse(sessionStorage.getItem('user') || '{}')?.id;

  const emptyForm = { username: '', password: '', role: 'engineer', email: '', statut: 'actif' };
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const d = await apiFetch('/admin/users'); setUsers(d.users); }
    catch (e) { setError(apiErr(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setForm(emptyForm); setEditingId(null); setShowPwd(false); setShowModal(true); };
  const openEdit = (u: UserItem) => {
    setForm({ username: u.username, password: '', role: u.role, email: u.email || '', statut: u.statut || 'actif' });
    setEditingId(u.id); setShowPwd(false); setShowModal(true);
  };
  const close = () => { setShowModal(false); setEditingId(null); setError(''); };

  const handleSave = async () => {
    if (!form.username.trim()) { setError('Le nom d\'utilisateur est requis'); return; }
    if (!editingId && !form.password) { setError('Le mot de passe est requis'); return; }
    setSaving(true); setError('');
    try {
      if (editingId !== null) {
        const payload: any = { role: form.role, email: form.email, statut: form.statut };
        const d = await apiFetch(`/admin/users/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setUsers(prev => prev.map(u => u.id === editingId ? d.user : u));
      } else {
        const d = await apiFetch('/admin/users', { method: 'POST', body: JSON.stringify(form) });
        setUsers(prev => [...prev, d.user]);
      }
      close();
    } catch (e) { setError(apiErr(e)); }
    finally { setSaving(false); }
  };

  const handleDelete = async (u: UserItem) => {
    try {
      await apiFetch(`/admin/users/${u.id}`, { method: 'DELETE' });
      setUsers(prev => prev.filter(x => x.id !== u.id));
    } catch (e) { setError(apiErr(e)); }
    finally { setConfirmDel(null); }
  };

  const toggleStatut = async (u: UserItem) => {
    const newStatut = u.statut === 'actif' ? 'inactif' : 'actif';
    try {
      const d = await apiFetch(`/admin/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ statut: newStatut }) });
      setUsers(prev => prev.map(x => x.id === u.id ? d.user : x));
    } catch (e) { setError(apiErr(e)); }
  };

  const handleResetPwd = async () => {
    if (!newPwd || newPwd.length < 6) { setError('Minimum 6 caractères'); return; }
    setPwdSaving(true); setError('');
    try {
      await apiFetch(`/admin/users/${resetModal!.id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword: newPwd }) });
      setResetModal(null); setNewPwd('');
    } catch (e) { setError(apiErr(e)); }
    finally { setPwdSaving(false); }
  };

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="ap-toolbar">
        <input className="ap-search" placeholder="Rechercher un utilisateur…" value={search} onChange={e => setSearch(e.target.value)} />
        <button className="ap-btn ap-btn-primary" onClick={openAdd}>+ Nouvel utilisateur</button>
      </div>

      {error && <div className="ap-error-bar"><span>{error}</span><button onClick={() => setError('')}>✕</button></div>}

      {loading ? <div className="ap-loading">Chargement…</div> : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead><tr>
              <th>Utilisateur</th><th>Rôle</th><th>Email</th>
              <th>Statut</th><th>Dernière connexion</th><th>Créé le</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="ap-empty">Aucun utilisateur trouvé</td></tr>
              ) : filtered.map(u => (
                <tr key={u.id} className={u.statut === 'inactif' ? 'row-inactive' : ''}>
                  <td>
                    <div className="user-cell">
                      <div className={`user-avatar user-avatar-${u.role}`}>{u.username[0].toUpperCase()}</div>
                      <div>
                        <div className="user-name">{u.username}</div>
                        <div className="user-id">ID #{u.id}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={`role-pill role-${u.role}`}>{u.role}</span></td>
                  <td className="ap-muted">{u.email || '—'}</td>
                  <td>
                    <button
                      className={`statut-toggle ${u.statut === 'actif' ? 'st-on' : 'st-off'}`}
                      onClick={() => u.id !== currentUserId && toggleStatut(u)}
                      disabled={u.id === currentUserId}
                      title={u.id === currentUserId ? 'Votre propre compte' : ''}
                    >
                      <span className="st-dot" /> {u.statut}
                    </button>
                  </td>
                  <td className="ap-muted ap-mono">{fmtDate(u.lastLogin)}</td>
                  <td className="ap-muted ap-mono">{fmtDate(u.createdAt)}</td>
                  <td>
                    <div className="ap-actions">
                      <button className="ap-btn ap-btn-sm ap-btn-secondary" onClick={() => openEdit(u)}>Modifier</button>
                      <button className="ap-btn ap-btn-sm ap-btn-ghost" onClick={() => { setResetModal(u); setNewPwd(''); }}>Pwd</button>
                      {u.id !== currentUserId && (
                        <button className="ap-btn ap-btn-sm ap-btn-danger" onClick={() => setConfirmDel(u)}>Suppr.</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ap-table-footer">{filtered.length} utilisateur{filtered.length !== 1 ? 's' : ''}</div>
        </div>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <div className="ap-modal-overlay" onClick={close}>
          <div className="ap-modal" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h2>{editingId !== null ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}</h2>
              <button className="ap-modal-close" onClick={close}>✕</button>
            </div>
            <div className="ap-modal-body">
              {error && <div className="ap-error-bar" style={{ marginBottom: '1rem' }}><span>{error}</span></div>}
              <div className="ap-field">
                <label>Nom d'utilisateur *</label>
                <input type="text" value={form.username} disabled={editingId !== null}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="ex: jdupont" />
                {editingId !== null && <small className="ap-hint">Le nom d'utilisateur ne peut pas être modifié</small>}
              </div>
              {editingId === null && (
                <div className="ap-field">
                  <label>Mot de passe *</label>
                  <div className="ap-pwd-wrap">
                    <input type={showPwd ? 'text' : 'password'} value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 6 caractères" />
                    <button type="button" className="ap-pwd-toggle" onClick={() => setShowPwd(v => !v)}>
                      {showPwd ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>
              )}
              <div className="ap-field">
                <label>Rôle *</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="admin">Administrateur</option>
                  <option value="engineer">Ingénieur</option>
                </select>
              </div>
              <div className="ap-field">
                <label>Email</label>
                <input type="text" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="ex: j.dupont@entreprise.com" />
              </div>
              {editingId !== null && (
                <div className="ap-field">
                  <label>Statut</label>
                  <select value={form.statut} onChange={e => setForm(f => ({ ...f, statut: e.target.value }))}>
                    <option value="actif">Actif</option>
                    <option value="inactif">Inactif</option>
                  </select>
                </div>
              )}
            </div>
            <div className="ap-modal-footer">
              <button className="ap-btn ap-btn-secondary" onClick={close}>Annuler</button>
              <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement…' : (editingId !== null ? 'Enregistrer' : 'Créer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetModal && (
        <div className="ap-modal-overlay" onClick={() => setResetModal(null)}>
          <div className="ap-modal ap-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h2>Réinitialiser le mot de passe</h2>
              <button className="ap-modal-close" onClick={() => setResetModal(null)}>✕</button>
            </div>
            <div className="ap-modal-body">
              {error && <div className="ap-error-bar" style={{ marginBottom: '1rem' }}><span>{error}</span></div>}
              <p className="ap-modal-desc">Nouveau mot de passe pour <strong>{resetModal.username}</strong></p>
              <div className="ap-field">
                <label>Nouveau mot de passe *</label>
                <input type="text" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min. 6 caractères" />
              </div>
            </div>
            <div className="ap-modal-footer">
              <button className="ap-btn ap-btn-secondary" onClick={() => setResetModal(null)}>Annuler</button>
              <button className="ap-btn ap-btn-primary" onClick={handleResetPwd} disabled={pwdSaving}>
                {pwdSaving ? 'En cours…' : 'Réinitialiser'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDel && (
        <div className="ap-modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="ap-modal ap-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h2>Confirmer la suppression</h2>
              <button className="ap-modal-close" onClick={() => setConfirmDel(null)}>✕</button>
            </div>
            <div className="ap-modal-body">
              <p className="ap-modal-desc">Supprimer l'utilisateur <strong>{confirmDel.username}</strong> ? Cette action est irréversible.</p>
            </div>
            <div className="ap-modal-footer">
              <button className="ap-btn ap-btn-secondary" onClick={() => setConfirmDel(null)}>Annuler</button>
              <button className="ap-btn ap-btn-danger" onClick={() => handleDelete(confirmDel)}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

const Tests: React.FC = () => {
  const [tests, setTests]       = useState<any[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [offset, setOffset]     = useState(0);
  const [confirmDel, setConfirmDel] = useState<any>(null);
  const [bulkModal, setBulkModal]   = useState(false);
  const [bulkStatus, setBulkStatus] = useState('FAIL');
  const [bulkBefore, setBulkBefore] = useState('');
  const [bulking, setBulking]       = useState(false);
  const LIMIT = 30;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
      if (statusFilter !== 'all') params.append('status', statusFilter);
      const d = await apiFetch(`/admin/tests?${params}`);
      setTests(d.tests); setTotal(d.total);
    } catch (e) { setError(apiErr(e)); }
    finally { setLoading(false); }
  }, [statusFilter, offset]);

  useEffect(() => { setOffset(0); }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  const forceStop = async (t: any) => {
    try {
      await apiFetch(`/admin/tests/${t.id}/stop`, { method: 'POST' });
      setTests(prev => prev.map(x => x.id === t.id ? { ...x, status: 'STOPPED' } : x));
    } catch (e) { setError(apiErr(e)); }
  };

  const handleDelete = async (t: any) => {
    try {
      await apiFetch(`/admin/tests/${t.id}`, { method: 'DELETE' });
      setTests(prev => prev.filter(x => x.id !== t.id));
      setTotal(v => v - 1);
    } catch (e) { setError(apiErr(e)); }
    finally { setConfirmDel(null); }
  };

  const handleBulkDelete = async () => {
    setBulking(true); setError('');
    try {
      const body: any = { status: bulkStatus };
      if (bulkBefore) body.before = new Date(bulkBefore).toISOString();
      const d = await apiFetch('/admin/tests', { method: 'DELETE', body: JSON.stringify(body) });
      alert(d.message);
      setBulkModal(false); load();
    } catch (e) { setError(apiErr(e)); }
    finally { setBulking(false); }
  };

  const statusColors: Record<string, string> = {
    SUCCESS: 'st-success', FAIL: 'st-fail', PENDING: 'st-pending', STOPPED: 'st-stopped', RUNNING: 'st-running'
  };

  return (
    <>
      <div className="ap-toolbar">
        <div className="ap-filter-group">
          {['all','SUCCESS','FAIL','STOPPED','PENDING'].map(s => (
            <button key={s} className={`ap-filter-btn ${statusFilter === s ? 'active' : ''}`}
              onClick={() => setStatusFilter(s)}>
              {s === 'all' ? 'Tous' : s}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="ap-btn ap-btn-ghost" onClick={() => setBulkModal(true)}>Suppression en masse</button>
          <button className="ap-btn ap-btn-secondary" onClick={load}>↻ Rafraîchir</button>
        </div>
      </div>

      {error && <div className="ap-error-bar"><span>{error}</span><button onClick={() => setError('')}>✕</button></div>}

      {loading ? <div className="ap-loading">Chargement…</div> : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead><tr>
              <th>ID</th><th>Statut</th><th>Mode</th><th>Slot</th>
              <th>Commande</th><th>Démarré</th><th>Durée</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {tests.length === 0 ? (
                <tr><td colSpan={8} className="ap-empty">Aucun test trouvé</td></tr>
              ) : tests.map(t => {
                const dur = t.endTime && t.startTime
                  ? Math.round((new Date(t.endTime).getTime() - new Date(t.startTime).getTime()) / 1000)
                  : null;
                return (
                  <tr key={t.id}>
                    <td><span className="ap-mono ap-muted">#{t.id}</span></td>
                    <td><span className={`status-pill ${statusColors[t.status] || ''}`}>{t.status}</span></td>
                    <td><span className="mode-pill">{t.runMode || '—'}</span></td>
                    <td className="ap-mono ap-muted">{t.slotId}</td>
                    <td className="ap-mono ap-muted">{t.commandId || '—'}</td>
                    <td className="ap-mono ap-muted">{fmtDate(t.startTime)}</td>
                    <td className="ap-mono ap-muted">{dur !== null ? `${dur}s` : '—'}</td>
                    <td>
                      <div className="ap-actions">
                        {(t.status === 'PENDING' || t.status === 'RUNNING') && (
                          <button className="ap-btn ap-btn-sm ap-btn-ghost" onClick={() => forceStop(t)}>Stop</button>
                        )}
                        <button className="ap-btn ap-btn-sm ap-btn-danger" onClick={() => setConfirmDel(t)}>Suppr.</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="ap-table-footer ap-pagination">
            <span>{total} test{total !== 1 ? 's' : ''} au total</span>
            <div className="ap-page-btns">
              <button className="ap-btn ap-btn-sm ap-btn-secondary" disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}>← Préc.</button>
              <span className="ap-muted">{Math.floor(offset/LIMIT)+1} / {Math.max(1,Math.ceil(total/LIMIT))}</span>
              <button className="ap-btn ap-btn-sm ap-btn-secondary" disabled={offset + LIMIT >= total}
                onClick={() => setOffset(offset + LIMIT)}>Suiv. →</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete modal */}
      {bulkModal && (
        <div className="ap-modal-overlay" onClick={() => setBulkModal(false)}>
          <div className="ap-modal ap-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h2>Suppression en masse</h2>
              <button className="ap-modal-close" onClick={() => setBulkModal(false)}>✕</button>
            </div>
            <div className="ap-modal-body">
              {error && <div className="ap-error-bar" style={{ marginBottom: '1rem' }}><span>{error}</span></div>}
              <div className="ap-field">
                <label>Statut à supprimer</label>
                <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}>
                  <option value="FAIL">FAIL seulement</option>
                  <option value="STOPPED">STOPPED seulement</option>
                  <option value="SUCCESS">SUCCESS seulement</option>
                  <option value="PENDING">PENDING seulement</option>
                </select>
              </div>
              <div className="ap-field">
                <label>Avant le (optionnel)</label>
                <input type="date" value={bulkBefore} onChange={e => setBulkBefore(e.target.value)} />
                <small className="ap-hint">Laissez vide pour supprimer sans limite de date</small>
              </div>
              <div className="ap-warning">⚠ Cette action est irréversible</div>
            </div>
            <div className="ap-modal-footer">
              <button className="ap-btn ap-btn-secondary" onClick={() => setBulkModal(false)}>Annuler</button>
              <button className="ap-btn ap-btn-danger" onClick={handleBulkDelete} disabled={bulking}>
                {bulking ? 'Suppression…' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm single delete */}
      {confirmDel && (
        <div className="ap-modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="ap-modal ap-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h2>Confirmer la suppression</h2>
              <button className="ap-modal-close" onClick={() => setConfirmDel(null)}>✕</button>
            </div>
            <div className="ap-modal-body">
              <p className="ap-modal-desc">Supprimer le test <strong>#{confirmDel.id}</strong> ?</p>
            </div>
            <div className="ap-modal-footer">
              <button className="ap-btn ap-btn-secondary" onClick={() => setConfirmDel(null)}>Annuler</button>
              <button className="ap-btn ap-btn-danger" onClick={() => handleDelete(confirmDel)}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ══════════════════════════════════════════════════════════════════════════════

const AuditLogs: React.FC = () => {
  const [logs, setLogs]       = useState<any[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');
  const [offset, setOffset]   = useState(0);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
      if (search) params.append('search', search);
      const d = await apiFetch(`/admin/audit-logs?${params}`);
      setLogs(d.logs); setTotal(d.total);
    } catch (e) { setError(apiErr(e)); }
    finally { setLoading(false); }
  }, [search, offset]);

  useEffect(() => { setOffset(0); }, [search]);
  useEffect(() => { load(); }, [load]);

  const ACTION_COLORS: Record<string, string> = {
    LOGIN: 'ac-blue', LOGOUT: 'ac-grey',
    CREATE_USER: 'ac-green', UPDATE_USER: 'ac-yellow', DELETE_USER: 'ac-red',
    RESET_PASSWORD: 'ac-orange',
    RUN_TEST: 'ac-blue', RUN_SEQUENCE: 'ac-blue',
    STOP_TEST: 'ac-orange', ADMIN_FORCE_STOP_TEST: 'ac-red',
    DELETE_TEST: 'ac-red', BULK_DELETE_TESTS: 'ac-red',
    CREATE_TELNET_COMMAND: 'ac-green', UPDATE_TELNET_COMMAND: 'ac-yellow', DELETE_TELNET_COMMAND: 'ac-red',
    CREATE_POSTE: 'ac-green', CREATE_PRODUIT: 'ac-green', CREATE_SLOT: 'ac-green',
  };

  return (
    <>
      <div className="ap-toolbar">
        <input className="ap-search" placeholder="Rechercher une action, un utilisateur…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="ap-btn ap-btn-secondary" onClick={load}>↻ Rafraîchir</button>
      </div>

      {error && <div className="ap-error-bar"><span>{error}</span><button onClick={() => setError('')}>✕</button></div>}

      {loading ? <div className="ap-loading">Chargement…</div> : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead><tr>
              <th>Horodatage</th><th>Utilisateur</th><th>Rôle</th>
              <th>Action</th><th>Méthode</th><th>URL</th><th>IP</th>
            </tr></thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={7} className="ap-empty">Aucun log trouvé</td></tr>
              ) : logs.map((l, i) => (
                <tr key={i}>
                  <td className="ap-mono ap-muted ap-nowrap">{fmtDate(l.timestamp)}</td>
                  <td><strong>{l.username || '—'}</strong></td>
                  <td>{l.role ? <span className={`role-pill role-${l.role}`}>{l.role}</span> : '—'}</td>
                  <td><span className={`action-pill ${ACTION_COLORS[l.action] || 'ac-grey'}`}>{l.action}</span></td>
                  <td><span className="method-pill">{l.method}</span></td>
                  <td className="ap-mono ap-muted ap-truncate">{l.url}</td>
                  <td className="ap-mono ap-muted">{l.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ap-table-footer ap-pagination">
            <span>{total} entrée{total !== 1 ? 's' : ''}</span>
            <div className="ap-page-btns">
              <button className="ap-btn ap-btn-sm ap-btn-secondary" disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}>← Préc.</button>
              <span className="ap-muted">{Math.floor(offset/LIMIT)+1} / {Math.max(1,Math.ceil(total/LIMIT))}</span>
              <button className="ap-btn ap-btn-sm ap-btn-secondary" disabled={offset + LIMIT >= total}
                onClick={() => setOffset(offset + LIMIT)}>Suiv. →</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════

function fmtMinutes(min: number) {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface HBarProps {
  label: string;
  value: number;
  max: number;
  displayValue: string;
  color?: string;
}

const HBar: React.FC<HBarProps> = ({ label, value, max, displayValue, color = 'blue' }) => {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="hbar-row">
      <div className="hbar-label">{label}</div>
      <div className="hbar-track">
        <div className={`hbar-fill hbar-${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="hbar-val">{displayValue}</div>
    </div>
  );
};

const Analytics: React.FC = () => {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [period, setPeriod] = useState('30');

  const load = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const d = await apiFetch(`/admin/analytics?period=${p}`);
      setData(d);
    } catch (e) { setError(apiErr(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(period); }, [load, period]);

  const periods = [
    { value: '7',   label: '7 jours'  },
    { value: '30',  label: '30 jours' },
    { value: '90',  label: '90 jours' },
    { value: '365', label: '1 an'     },
  ];

  return (
    <div className="analytics-wrap">
      {/* Period selector */}
      <div className="analytics-period-bar">
        <span className="analytics-period-label">Période :</span>
        {periods.map(p => (
          <button
            key={p.value}
            className={`period-btn ${period === p.value ? 'active' : ''}`}
            onClick={() => setPeriod(p.value)}
          >{p.label}</button>
        ))}
      </div>

      {loading && <div className="ap-loading">Chargement…</div>}
      {error   && <div className="ap-error">{error}</div>}

      {!loading && !error && data && (() => {
        const { productStats = [], userStats = [], dailyActivity = [] } = data;
        const maxProd  = Math.max(...productStats.map((p: any) => p.total), 1);
        const maxTests = Math.max(...userStats.map((u: any) => u.totalTests), 1);
        const maxTime  = Math.max(...userStats.map((u: any) => u.totalMinutes), 1);
        const maxDay   = Math.max(...dailyActivity.map((d: any) => (d.success || 0) + (d.failed || 0)), 1);

        return (
          <>
            {/* Products most tested */}
            <div className="ap-card">
              <div className="ap-card-header">Produits les plus testés</div>
              {productStats.length === 0
                ? <div className="ap-empty">Aucune donnée pour cette période</div>
                : <div className="hbar-list">
                    {productStats.map((p: any) => (
                      <HBar key={p.produitId}
                        label={p.nom || `Produit #${p.produitId}`}
                        value={p.total}
                        max={maxProd}
                        displayValue={`${p.total} test${p.total !== 1 ? 's' : ''}`}
                        color="blue"
                      />
                    ))}
                  </div>
              }
            </div>

            {/* Tests per user */}
            <div className="ap-card">
              <div className="ap-card-header">Tests par utilisateur</div>
              {userStats.length === 0
                ? <div className="ap-empty">Aucune donnée pour cette période</div>
                : <div className="hbar-list">
                    {userStats.map((u: any) => (
                      <HBar key={u.username}
                        label={`${u.username} (${u.role})`}
                        value={u.totalTests}
                        max={maxTests}
                        displayValue={`${u.totalTests} test${u.totalTests !== 1 ? 's' : ''}`}
                        color={u.role === 'admin' ? 'indigo' : 'teal'}
                      />
                    ))}
                  </div>
              }
            </div>

            {/* Time spent per user */}
            <div className="ap-card">
              <div className="ap-card-header">Temps passé par utilisateur</div>
              {userStats.length === 0
                ? <div className="ap-empty">Aucune donnée pour cette période</div>
                : <div className="hbar-list">
                    {userStats.map((u: any) => (
                      <HBar key={u.username}
                        label={`${u.username} (${u.role})`}
                        value={u.totalMinutes}
                        max={maxTime}
                        displayValue={fmtMinutes(u.totalMinutes)}
                        color="purple"
                      />
                    ))}
                  </div>
              }
            </div>

            {/* Daily activity chart */}
            <div className="ap-card">
              <div className="ap-card-header">Activité quotidienne (14 derniers jours)</div>
              {dailyActivity.length === 0
                ? <div className="ap-empty">Aucune donnée</div>
                : <div className="daily-chart">
                    {dailyActivity.map((d: any) => {
                      const total = (d.success || 0) + (d.failed || 0);
                      const heightPct = maxDay > 0 ? (total / maxDay) * 100 : 0;
                      return (
                        <div key={d.date} className="daily-col">
                          <div className="daily-bar-wrap">
                            <div className="daily-bar" style={{ height: `${heightPct}%` }}>
                              <div className="daily-bar-success"
                                style={{ height: total > 0 ? `${((d.success || 0) / total) * 100}%` : '0%' }} />
                              <div className="daily-bar-failed"
                                style={{ height: total > 0 ? `${((d.failed || 0) / total) * 100}%` : '0%' }} />
                            </div>
                          </div>
                          <div className="daily-label">{d.date?.slice(5)}</div>
                          <div className="daily-count">{total}</div>
                        </div>
                      );
                    })}
                  </div>
              }
              <div className="daily-legend">
                <span className="legend-dot dot-success" /> Succès
                <span className="legend-dot dot-failed" />  Échecs
              </div>
            </div>

            {/* Summary table */}
            <div className="ap-card">
              <div className="ap-card-header">Résumé de performance</div>
              <table className="ap-table">
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Rôle</th>
                    <th>Tests</th>
                    <th>Temps total</th>
                    <th>Moy. tests/session</th>
                  </tr>
                </thead>
                <tbody>
                  {userStats.map((u: any) => (
                    <tr key={u.username}>
                      <td><strong>{u.username}</strong></td>
                      <td><span className={`role-pill role-${u.role}`}>{u.role}</span></td>
                      <td>{u.totalTests}</td>
                      <td>{fmtMinutes(u.totalMinutes)}</td>
                      <td>{u.sessions > 0 ? Math.round(u.totalTests / u.sessions) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

const AdminPanel: React.FC = () => {
  const [tab, setTab] = useState<TabId>('overview');

  return (
    <div className="ap-container">
      <div className="ap-header">
        <div className="ap-header-left">
          <h1>Administration</h1>
          <span className="ap-header-sub">Gestion de la plateforme Telnet Test Manager</span>
        </div>
        <span className="ap-header-badge">Admin</span>
      </div>

      <div className="ap-layout">
        <nav className="ap-sidebar">
          {TABS.map(t => (
            <button key={t.id} className={`ap-nav-btn ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}>
              <span className="ap-nav-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="ap-content">
          {tab === 'overview'   && <Overview />}
          {tab === 'users'      && <Users />}
          {tab === 'tests'      && <Tests />}
          {tab === 'auditlogs'  && <AuditLogs />}
          {tab === 'analytics'  && <Analytics />}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
