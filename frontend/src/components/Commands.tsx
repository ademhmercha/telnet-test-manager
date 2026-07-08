import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './Commands.css';

interface TelnetCommand {
  id: string;
  name: string;
  type: 'single' | 'monitoring' | 'sequence';
  command?: string;
  description: string;
  expectedResponse?: string;
  expectedEvents?: string[];
}

interface FormState {
  id: string;
  name: string;
  type: 'single' | 'monitoring';
  command: string;
  description: string;
  expectedResponse: string;
  expectedEvents: string;
}

const emptyForm: FormState = {
  id: '',
  name: '',
  type: 'single',
  command: '',
  description: '',
  expectedResponse: '',
  expectedEvents: '',
};

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
}

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionStorage.getItem('token')}`,
  };
}

const Commands: React.FC = () => {
  // @ts-ignore
  const { t: _t } = useTranslation();
  const t = (key: string, opts?: Record<string, any>): string => String(_t(key, opts as any));
  const [commands, setCommands] = useState<TelnetCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TelnetCommand | null>(null);
  const [search, setSearch] = useState('');

  const userRaw = sessionStorage.getItem('user');
  const user = userRaw ? JSON.parse(userRaw) : null;
  const canEdit = user?.role === 'admin' || user?.role === 'engineer';

  useEffect(() => {
    fetchCommands();
  }, []);

  const fetchCommands = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/telnet-commands', { headers: apiHeaders() });
      const data = await res.json();
      setCommands(data.commands || []);
    } catch {
      setError(t('commands.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  };

  const openEditModal = (cmd: TelnetCommand) => {
    setForm({
      id: cmd.id,
      name: cmd.name,
      type: cmd.type === 'sequence' ? 'single' : cmd.type,
      command: cmd.command || '',
      description: cmd.description || '',
      expectedResponse: cmd.expectedResponse || '',
      expectedEvents: cmd.expectedEvents?.join(', ') || '',
    });
    setEditingId(cmd.id);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setError('');
  };

  const handleFormChange = (field: keyof FormState, value: string) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'name') next.id = slugify(value);
      return next;
    });
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.command.trim()) {
      setError(t('commands.nameRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body: any = {
        id: form.id || slugify(form.name),
        name: form.name.trim(),
        type: form.type,
        command: form.command.trim(),
        description: form.description.trim(),
        expectedResponse: form.type === 'single' && form.expectedResponse.trim() ? form.expectedResponse.trim() : undefined,
        expectedEvents: form.type === 'monitoring' && form.expectedEvents.trim()
          ? form.expectedEvents.split(',').map(e => e.trim()).filter(Boolean)
          : undefined,
      };

      if (editingId) {
        const res = await fetch(`/telnet-commands/${editingId}`, {
          method: 'PUT',
          headers: apiHeaders(),
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('common.serverError'));
        setCommands(prev => prev.map(c => c.id === editingId ? data.command : c));
      } else {
        const res = await fetch('/telnet-commands', {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('common.serverError'));
        setCommands(prev => [...prev, data.command]);
      }
      closeModal();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cmd: TelnetCommand) => {
    try {
      const res = await fetch(`/telnet-commands/${cmd.id}`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t('common.serverError'));
      }
      setCommands(prev => prev.filter(c => c.id !== cmd.id));
      setConfirmDelete(null);
    } catch (err: any) {
      setError(err.message);
      setConfirmDelete(null);
    }
  };

  const filtered = commands.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.command || '').toLowerCase().includes(search.toLowerCase()) ||
    c.id.toLowerCase().includes(search.toLowerCase())
  );

  const typeLabel = (type: string) => {
    if (type === 'monitoring') return 'Monitoring';
    if (type === 'sequence') return 'Séquence';
    return 'Single';
  };

  return (
    <div className="commands-container">
      {/* Header */}
      <div className="commands-header">
        <h1>{t('commands.title')}</h1>
        <div className="header-actions">
          <div className="search-container">
            <input
              className="search-input"
              placeholder={t('common.search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={openModal}>
              {t('commands.addCommand')}
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

      {loading ? (
        <div className="loading">{t('common.loading')}</div>
      ) : (
        <div className="commands-list">
          <div className="table-responsive">
            <table className="commands-table">
              <thead>
                <tr>
                  <th>{t('commands.colName')}</th>
                  <th>{t('commands.colId')}</th>
                  <th>{t('commands.colType')}</th>
                  <th>{t('commands.colCommand')}</th>
                  <th>{t('commands.colDescription')}</th>
                  <th>{t('commands.colExpected')}</th>
                  {canEdit && <th>{t('commands.colActions')}</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 7 : 6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      {t('commands.noCommands')}
                    </td>
                  </tr>
                ) : (
                  filtered.map(cmd => (
                    <tr key={cmd.id}>
                      <td><strong>{cmd.name}</strong></td>
                      <td><code className="cmd-id">{cmd.id}</code></td>
                      <td>
                        <span className={`type-badge type-${cmd.type}`}>{typeLabel(cmd.type)}</span>
                      </td>
                      <td><code className="cmd-code">{cmd.command || '—'}</code></td>
                      <td className="desc-cell">{cmd.description || '—'}</td>
                      <td>
                        {cmd.expectedResponse
                          ? <code className="expected-code">{cmd.expectedResponse}</code>
                          : cmd.expectedEvents && cmd.expectedEvents.length > 0
                            ? <div className="expected-events-list">
                                {cmd.expectedEvents.map((ev, i) => (
                                  <code key={i} className="expected-event-badge">{ev}</code>
                                ))}
                              </div>
                            : <span className="muted">—</span>}
                      </td>
                      {canEdit && (
                        <td>
                          <div className="action-buttons">
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => openEditModal(cmd)}
                            >
                              {t('common.edit')}
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => setConfirmDelete(cmd)}
                            >
                              {t('common.delete')}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="commands-footer">
            {t('commands.count', { count: filtered.length })}
            {search && ` ${t('commands.filteredOn', { search })}`}
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? t('commands.editCommand') : t('commands.newCommand')}</h2>
              <button className="btn-close" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              {error && (
                <div className="error-message" style={{ marginBottom: '1rem' }}>
                  <span>{error}</span>
                </div>
              )}
              <div className="form-group">
                <label>{t('commands.fieldName')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => handleFormChange('name', e.target.value)}
                  placeholder="ex: Vérifier USB Port 1"
                />
              </div>
              <div className="form-group">
                <label>{t('commands.fieldId')}</label>
                <input
                  type="text"
                  value={form.id}
                  onChange={e => handleFormChange('id', e.target.value)}
                  placeholder="ex: verifier-usb-port-1"
                />
              </div>
              <div className="form-group">
                <label>{t('commands.fieldType')}</label>
                <select
                  value={form.type}
                  onChange={e => handleFormChange('type', e.target.value)}
                >
                  <option value="single">{t('commands.typeSingle')}</option>
                  <option value="monitoring">{t('commands.typeMonitoring')}</option>
                </select>
              </div>
              <div className="form-group">
                <label>{t('commands.fieldShellCommand')}</label>
                <input
                  type="text"
                  value={form.command}
                  onChange={e => handleFormChange('command', e.target.value)}
                  placeholder="ex: scos-storage -b usb test -p P1"
                  style={{ fontFamily: 'Consolas, monospace' }}
                />
              </div>
              <div className="form-group">
                <label>{t('commands.fieldDescription')}</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => handleFormChange('description', e.target.value)}
                  placeholder="ex: Teste le port USB P1"
                />
              </div>
              {form.type === 'single' && (
                <div className="form-group">
                  <label>{t('commands.fieldExpectedResponse')} <span className="muted">({t('common.optional')})</span></label>
                  <input
                    type="text"
                    value={form.expectedResponse}
                    onChange={e => handleFormChange('expectedResponse', e.target.value)}
                    placeholder="ex: USB:P1:2:OK"
                    style={{ fontFamily: 'Consolas, monospace' }}
                  />
                  <small style={{ color: 'var(--text-faint)', fontSize: '0.72rem', marginTop: '0.25rem', display: 'block' }}>
                    {t('commands.hintExpectedResponse')}
                  </small>
                </div>
              )}
              {form.type === 'monitoring' && (
                <div className="form-group">
                  <label>{t('commands.fieldExpectedEvents')} <span className="muted">({t('common.optional')})</span></label>
                  <input
                    type="text"
                    value={form.expectedEvents}
                    onChange={e => handleFormChange('expectedEvents', e.target.value)}
                    placeholder="ex: KEY_WLAN:PRESSED, KEY_WPS_BUTTON:PRESSED"
                    style={{ fontFamily: 'Consolas, monospace' }}
                  />
                  <small style={{ color: 'var(--text-faint)', fontSize: '0.72rem', marginTop: '0.25rem', display: 'block' }}>
                    {t('commands.hintExpectedEvents')}
                  </small>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? t('commands.saving') : (editingId ? t('common.save') : t('common.add'))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('common.confirmDelete')}</h2>
              <button className="btn-close" onClick={() => setConfirmDelete(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text)' }}>
                {t('commands.deleteConfirm', { name: confirmDelete.name })}
              </p>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {t('common.irreversible')}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</button>
              <button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Commands;
