import React, { useState, useEffect, useCallback } from 'react';
import { posteService, produitService, slotService, referenceService } from '../services/api';
import type { Poste, Produit, Slot, Reference } from '../services/api';
import './Configuration.css';

type TabId = 'postes' | 'produits' | 'slots' | 'references';

function apiErr(e: any): string {
  return e?.response?.data?.error || e?.message || 'Erreur serveur';
}

function getUserRole(): string {
  try { return JSON.parse(sessionStorage.getItem('user') || '{}')?.role || ''; } catch { return ''; }
}

// ─── Generic confirm-delete modal ────────────────────────────────────────────

interface ConfirmDeleteProps {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}
const ConfirmDelete: React.FC<ConfirmDeleteProps> = ({ label, onConfirm, onCancel }) => (
  <div className="modal-overlay" onClick={onCancel}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <h2>Confirmer la suppression</h2>
        <button className="btn-close" onClick={onCancel}>×</button>
      </div>
      <div className="modal-body">
        <p style={{ margin: 0, fontSize: '0.875rem' }}>
          Supprimer <strong>{label}</strong> ?
        </p>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Cette action est irréversible.
        </p>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button className="btn btn-danger" onClick={onConfirm}>Supprimer</button>
      </div>
    </div>
  </div>
);

// ══════════════════════════════════════════════════════════════════════════════
// POSTES TAB
// ══════════════════════════════════════════════════════════════════════════════

const PostesTab: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [items, setItems]       = useState<Poste[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [showModal, setShowModal]     = useState(false);
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [saving, setSaving]           = useState(false);
  const [confirmDel, setConfirmDel]   = useState<Poste | null>(null);
  const [form, setForm] = useState({ nom: '', description: '', statut: 'actif' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await posteService.getPostes()); }
    catch (e) { setError(apiErr(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm({ nom: '', description: '', statut: 'actif' }); setEditingId(null); setShowModal(true); };
  const openEdit = (p: Poste) => { setForm({ nom: p.nom, description: p.description || '', statut: p.statut || 'actif' }); setEditingId(p.id); setShowModal(true); };
  const close = () => { setShowModal(false); setEditingId(null); setError(''); };

  const handleSave = async () => {
    if (!form.nom.trim()) { setError('Le nom est requis'); return; }
    setSaving(true); setError('');
    try {
      if (editingId !== null) {
        const { poste } = await posteService.updatePoste(editingId, form);
        setItems(prev => prev.map(p => p.id === editingId ? poste : p));
      } else {
        const { poste } = await posteService.createPoste(form as any);
        setItems(prev => [...prev, poste]);
      }
      close();
    } catch (e) { setError(apiErr(e)); }
    finally { setSaving(false); }
  };

  const handleDelete = async (p: Poste) => {
    try { await posteService.deletePoste(p.id); setItems(prev => prev.filter(x => x.id !== p.id)); }
    catch (e) { setError(apiErr(e)); }
    finally { setConfirmDel(null); }
  };

  const filtered = items.filter(p =>
    p.nom.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="tab-toolbar">
        <input className="search-input" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn btn-primary" onClick={openAdd}>+ Nouveau poste</button>
      </div>

      {error && <div className="error-message"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}

      {loading ? <div className="loading">Chargement...</div> : (
        <div className="cfg-table-wrap">
          <div className="table-responsive">
            <table className="cfg-table">
              <thead><tr>
                <th>ID</th><th>Nom</th><th>Description</th><th>Statut</th>
                {isAdmin && <th>Actions</th>}
              </tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 5 : 4} className="empty-row">Aucun poste trouvé</td></tr>
                ) : filtered.map(p => (
                  <tr key={p.id}>
                    <td><span className="id-badge">{p.id}</span></td>
                    <td><strong>{p.nom}</strong></td>
                    <td className="desc-cell">{p.description || '—'}</td>
                    <td><span className={`statut-badge statut-${p.statut}`}>{p.statut}</span></td>
                    {isAdmin && (
                      <td><div className="action-buttons">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>Modifier</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel(p)}>Supprimer</button>
                      </div></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">{filtered.length} poste{filtered.length !== 1 ? 's' : ''}</div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId !== null ? 'Modifier le poste' : 'Nouveau poste'}</h2>
              <button className="btn-close" onClick={close}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="error-message" style={{ marginBottom: '1rem' }}><span>{error}</span></div>}
              <div className="form-group">
                <label>Nom *</label>
                <input type="text" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="ex: Station de Traitement" />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description du poste" />
              </div>
              <div className="form-group">
                <label>Statut</label>
                <select value={form.statut} onChange={e => setForm(f => ({ ...f, statut: e.target.value }))}>
                  <option value="actif">Actif</option>
                  <option value="inactif">Inactif</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={close}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement...' : (editingId !== null ? 'Enregistrer' : 'Créer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && <ConfirmDelete label={confirmDel.nom} onConfirm={() => handleDelete(confirmDel)} onCancel={() => setConfirmDel(null)} />}
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PRODUITS TAB
// ══════════════════════════════════════════════════════════════════════════════

const ProduitsTab: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [items, setItems]     = useState<Produit[]>([]);
  const [postes, setPostes]   = useState<Poste[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [saving, setSaving]         = useState(false);
  const [confirmDel, setConfirmDel] = useState<Produit | null>(null);
  const [form, setForm] = useState({ nom: '', posteId: '', description: '' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [p, ps] = await Promise.all([produitService.getProduits(), posteService.getPostes()]);
      setItems(p); setPostes(ps);
    } catch (e) { setError(apiErr(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm({ nom: '', posteId: postes[0]?.id?.toString() || '', description: '' }); setEditingId(null); setShowModal(true); };
  const openEdit = (p: Produit) => { setForm({ nom: p.nom, posteId: p.posteId.toString(), description: p.description || '' }); setEditingId(p.id); setShowModal(true); };
  const close = () => { setShowModal(false); setEditingId(null); setError(''); };

  const handleSave = async () => {
    if (!form.nom.trim() || !form.posteId) { setError('Nom et poste sont requis'); return; }
    setSaving(true); setError('');
    try {
      const payload = { nom: form.nom, posteId: parseInt(form.posteId), description: form.description };
      if (editingId !== null) {
        const { produit } = await produitService.updateProduit(editingId, payload);
        setItems(prev => prev.map(p => p.id === editingId ? produit : p));
      } else {
        const { produit } = await produitService.createProduit(payload);
        setItems(prev => [...prev, produit]);
      }
      close();
    } catch (e) { setError(apiErr(e)); }
    finally { setSaving(false); }
  };

  const handleDelete = async (p: Produit) => {
    try { await produitService.deleteProduit(p.id); setItems(prev => prev.filter(x => x.id !== p.id)); }
    catch (e) { setError(apiErr(e)); }
    finally { setConfirmDel(null); }
  };

  const posteNom = (id: number) => postes.find(p => p.id === id)?.nom || `Poste #${id}`;

  const filtered = items.filter(p =>
    p.nom.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(search.toLowerCase()) ||
    posteNom(p.posteId).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="tab-toolbar">
        <input className="search-input" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn btn-primary" onClick={openAdd}>+ Nouveau produit</button>
      </div>

      {error && <div className="error-message"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}

      {loading ? <div className="loading">Chargement...</div> : (
        <div className="cfg-table-wrap">
          <div className="table-responsive">
            <table className="cfg-table">
              <thead><tr>
                <th>ID</th><th>Nom</th><th>Poste</th><th>Description</th>
                {isAdmin && <th>Actions</th>}
              </tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 5 : 4} className="empty-row">Aucun produit trouvé</td></tr>
                ) : filtered.map(p => (
                  <tr key={p.id}>
                    <td><span className="id-badge">{p.id}</span></td>
                    <td><strong>{p.nom}</strong></td>
                    <td><span className="ref-badge">{posteNom(p.posteId)}</span></td>
                    <td className="desc-cell">{p.description || '—'}</td>
                    {isAdmin && (
                      <td><div className="action-buttons">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>Modifier</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel(p)}>Supprimer</button>
                      </div></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">{filtered.length} produit{filtered.length !== 1 ? 's' : ''}</div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId !== null ? 'Modifier le produit' : 'Nouveau produit'}</h2>
              <button className="btn-close" onClick={close}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="error-message" style={{ marginBottom: '1rem' }}><span>{error}</span></div>}
              <div className="form-group">
                <label>Nom *</label>
                <input type="text" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="ex: Système de Transfert FTP" />
              </div>
              <div className="form-group">
                <label>Poste *</label>
                <select value={form.posteId} onChange={e => setForm(f => ({ ...f, posteId: e.target.value }))}>
                  <option value="">— Sélectionner —</option>
                  {postes.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description du produit" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={close}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement...' : (editingId !== null ? 'Enregistrer' : 'Créer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && <ConfirmDelete label={confirmDel.nom} onConfirm={() => handleDelete(confirmDel)} onCancel={() => setConfirmDel(null)} />}
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// SLOTS TAB
// ══════════════════════════════════════════════════════════════════════════════

const SlotsTab: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [items, setItems]       = useState<Slot[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [saving, setSaving]         = useState(false);
  const [confirmDel, setConfirmDel] = useState<Slot | null>(null);
  const [form, setForm] = useState({ nom: '', produitId: '', adresse: '', port: '', description: '' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [s, p] = await Promise.all([slotService.getSlots(), produitService.getProduits()]);
      setItems(s); setProduits(p);
    } catch (e) { setError(apiErr(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm({ nom: '', produitId: produits[0]?.id?.toString() || '', adresse: '', port: '23', description: '' }); setEditingId(null); setShowModal(true); };
  const openEdit = (s: Slot) => { setForm({ nom: s.nom, produitId: s.produitId.toString(), adresse: s.adresse, port: s.port.toString(), description: s.description || '' }); setEditingId(s.id); setShowModal(true); };
  const close = () => { setShowModal(false); setEditingId(null); setError(''); };

  const handleSave = async () => {
    if (!form.nom.trim() || !form.produitId || !form.adresse.trim() || !form.port) {
      setError('Nom, produit, adresse et port sont requis'); return;
    }
    setSaving(true); setError('');
    try {
      const payload = { nom: form.nom, produitId: parseInt(form.produitId), adresse: form.adresse, port: parseInt(form.port), description: form.description };
      if (editingId !== null) {
        const { slot } = await slotService.updateSlot(editingId, payload);
        setItems(prev => prev.map(s => s.id === editingId ? slot : s));
      } else {
        const { slot } = await slotService.createSlot(payload);
        setItems(prev => [...prev, slot]);
      }
      close();
    } catch (e) { setError(apiErr(e)); }
    finally { setSaving(false); }
  };

  const handleDelete = async (s: Slot) => {
    try { await slotService.deleteSlot(s.id); setItems(prev => prev.filter(x => x.id !== s.id)); }
    catch (e) { setError(apiErr(e)); }
    finally { setConfirmDel(null); }
  };

  const produitNom = (id: number) => produits.find(p => p.id === id)?.nom || `Produit #${id}`;

  const filtered = items.filter(s =>
    s.nom.toLowerCase().includes(search.toLowerCase()) ||
    s.adresse.toLowerCase().includes(search.toLowerCase()) ||
    produitNom(s.produitId).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="tab-toolbar">
        <input className="search-input" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn btn-primary" onClick={openAdd}>+ Nouveau slot</button>
      </div>

      {error && <div className="error-message"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}

      {loading ? <div className="loading">Chargement...</div> : (
        <div className="cfg-table-wrap">
          <div className="table-responsive">
            <table className="cfg-table">
              <thead><tr>
                <th>ID</th><th>Nom</th><th>Produit</th><th>Adresse</th><th>Port</th><th>Description</th>
                {isAdmin && <th>Actions</th>}
              </tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 7 : 6} className="empty-row">Aucun slot trouvé</td></tr>
                ) : filtered.map(s => (
                  <tr key={s.id}>
                    <td><span className="id-badge">{s.id}</span></td>
                    <td><strong>{s.nom}</strong></td>
                    <td><span className="ref-badge">{produitNom(s.produitId)}</span></td>
                    <td><code className="addr-code">{s.adresse}</code></td>
                    <td><code className="addr-code">{s.port}</code></td>
                    <td className="desc-cell">{s.description || '—'}</td>
                    {isAdmin && (
                      <td><div className="action-buttons">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>Modifier</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel(s)}>Supprimer</button>
                      </div></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">{filtered.length} slot{filtered.length !== 1 ? 's' : ''}</div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId !== null ? 'Modifier le slot' : 'Nouveau slot'}</h2>
              <button className="btn-close" onClick={close}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="error-message" style={{ marginBottom: '1rem' }}><span>{error}</span></div>}
              <div className="form-group">
                <label>Nom *</label>
                <input type="text" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="ex: Interface FTP Principale" />
              </div>
              <div className="form-group">
                <label>Produit *</label>
                <select value={form.produitId} onChange={e => setForm(f => ({ ...f, produitId: e.target.value }))}>
                  <option value="">— Sélectionner —</option>
                  {produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Adresse IP *</label>
                  <input type="text" value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} placeholder="ex: 192.168.1.1" style={{ fontFamily: 'Consolas, monospace' }} />
                </div>
                <div className="form-group form-group-sm">
                  <label>Port *</label>
                  <input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} placeholder="23" min={1} max={65535} />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description du slot" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={close}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement...' : (editingId !== null ? 'Enregistrer' : 'Créer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && <ConfirmDelete label={confirmDel.nom} onConfirm={() => handleDelete(confirmDel)} onCancel={() => setConfirmDel(null)} />}
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// RÉFÉRENCES TAB
// ══════════════════════════════════════════════════════════════════════════════

const ReferencesTab: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [items, setItems]       = useState<Reference[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [saving, setSaving]         = useState(false);
  const [confirmDel, setConfirmDel] = useState<Reference | null>(null);
  const [form, setForm] = useState({ nom: '', produitId: '', description: '', version: '', statut: 'actif' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [refs, prods] = await Promise.all([
        referenceService.getReferences(),
        produitService.getProduits()
      ]);
      setItems(refs); setProduits(prods);
    } catch (e) { setError(apiErr(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm({ nom: '', produitId: produits[0]?.id?.toString() || '', description: '', version: '', statut: 'actif' }); setEditingId(null); setShowModal(true); };
  const openEdit = (r: Reference) => { setForm({ nom: r.nom, produitId: r.produitId.toString(), description: r.description || '', version: r.version || '', statut: r.statut || 'actif' }); setEditingId(r.id); setShowModal(true); };
  const close = () => { setShowModal(false); setEditingId(null); setError(''); };

  const handleSave = async () => {
    if (!form.nom.trim() || !form.produitId) { setError('Nom et produit sont requis'); return; }
    setSaving(true); setError('');
    try {
      const payload = { nom: form.nom, produitId: parseInt(form.produitId), description: form.description, version: form.version, statut: form.statut };
      if (editingId !== null) {
        const { reference } = await referenceService.updateReference(editingId, payload);
        setItems(prev => prev.map(r => r.id === editingId ? reference : r));
      } else {
        const { reference } = await referenceService.createReference(payload);
        setItems(prev => [...prev, reference]);
      }
      close();
    } catch (e) { setError(apiErr(e)); }
    finally { setSaving(false); }
  };

  const handleDelete = async (r: Reference) => {
    try { await referenceService.deleteReference(r.id); setItems(prev => prev.filter(x => x.id !== r.id)); }
    catch (e) { setError(apiErr(e)); }
    finally { setConfirmDel(null); }
  };

  const produitNom = (id: number) => produits.find(p => p.id === id)?.nom || `Produit #${id}`;

  const filtered = items.filter(r =>
    r.nom.toLowerCase().includes(search.toLowerCase()) ||
    (r.version || '').toLowerCase().includes(search.toLowerCase()) ||
    produitNom(r.produitId).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="tab-toolbar">
        <input className="search-input" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn btn-primary" onClick={openAdd}>+ Nouvelle référence</button>
      </div>

      {error && <div className="error-message"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}

      {loading ? <div className="loading">Chargement...</div> : (
        <div className="cfg-table-wrap">
          <div className="table-responsive">
            <table className="cfg-table">
              <thead><tr>
                <th>ID</th><th>Nom</th><th>Produit</th><th>Version</th><th>Statut</th><th>Description</th>
                {isAdmin && <th>Actions</th>}
              </tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 7 : 6} className="empty-row">Aucune référence trouvée</td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id}>
                    <td><span className="id-badge">{r.id}</span></td>
                    <td><strong>{r.nom}</strong></td>
                    <td><span className="ref-badge">{produitNom(r.produitId)}</span></td>
                    <td><code className="addr-code">{r.version || '—'}</code></td>
                    <td><span className={`statut-badge statut-${r.statut}`}>{r.statut}</span></td>
                    <td className="desc-cell">{r.description || '—'}</td>
                    {isAdmin && (
                      <td><div className="action-buttons">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Modifier</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel(r)}>Supprimer</button>
                      </div></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">{filtered.length} référence{filtered.length !== 1 ? 's' : ''}</div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId !== null ? 'Modifier la référence' : 'Nouvelle référence'}</h2>
              <button className="btn-close" onClick={close}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="error-message" style={{ marginBottom: '1rem' }}><span>{error}</span></div>}
              <div className="form-group">
                <label>Nom *</label>
                <input type="text" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="ex: FTP-SSL-3.0" />
              </div>
              <div className="form-group">
                <label>Produit *</label>
                <select value={form.produitId} onChange={e => setForm(f => ({ ...f, produitId: e.target.value }))}>
                  <option value="">— Sélectionner —</option>
                  {produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Version</label>
                  <input type="text" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="ex: v3.0.0" style={{ fontFamily: 'Consolas, monospace' }} />
                </div>
                <div className="form-group form-group-sm">
                  <label>Statut</label>
                  <select value={form.statut} onChange={e => setForm(f => ({ ...f, statut: e.target.value }))}>
                    <option value="actif">Actif</option>
                    <option value="inactif">Inactif</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description de la référence" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={close}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement...' : (editingId !== null ? 'Enregistrer' : 'Créer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && <ConfirmDelete label={confirmDel.nom} onConfirm={() => handleDelete(confirmDel)} onCancel={() => setConfirmDel(null)} />}
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

const TABS: { id: TabId; label: string }[] = [
  { id: 'postes',     label: 'Postes' },
  { id: 'produits',   label: 'Produits' },
  { id: 'slots',      label: 'Slots' },
  { id: 'references', label: 'Références' },
];

const Configuration: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('postes');
  const role = getUserRole();
  const canEdit = role === 'admin' || role === 'engineer';

  return (
    <div className="cfg-container">
      <div className="cfg-header">
        <h1>Configuration</h1>
        {!canEdit && (
          <span className="read-only-notice">Mode lecture — seuls les admins et ingénieurs peuvent modifier</span>
        )}
      </div>

      <div className="cfg-tabs-wrap">
        <nav className="cfg-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`cfg-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="cfg-tab-content">
          {activeTab === 'postes'     && <PostesTab     isAdmin={canEdit} />}
          {activeTab === 'produits'   && <ProduitsTab   isAdmin={canEdit} />}
          {activeTab === 'slots'      && <SlotsTab      isAdmin={canEdit} />}
          {activeTab === 'references' && <ReferencesTab isAdmin={canEdit} />}
        </div>
      </div>
    </div>
  );
};

export default Configuration;
