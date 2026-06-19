import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import './Account.css';

interface Props {
  user: { id: number; username: string; role: string; email?: string };
  onUsernameChange: (newUsername: string) => void;
}

export default function Account({ user, onUsernameChange }: Props) {
  const { t: _t } = useTranslation();
  const t = (k: string) => String(_t(k));

  const [newUsername,    setNewUsername]    = useState('');
  const [currentPwd,    setCurrentPwd]     = useState('');
  const [newPwd,        setNewPwd]         = useState('');
  const [confirmPwd,    setConfirmPwd]     = useState('');
  const [loading,       setLoading]        = useState(false);
  const [message,       setMessage]        = useState<{ text: string; ok: boolean } | null>(null);
  const [showCurrent,   setShowCurrent]    = useState(false);
  const [showNew,       setShowNew]        = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!currentPwd) {
      setMessage({ text: t('account.currentPwdRequired'), ok: false });
      return;
    }
    if (!newUsername.trim() && !newPwd) {
      setMessage({ text: t('account.noChanges'), ok: false });
      return;
    }
    if (newPwd && newPwd !== confirmPwd) {
      setMessage({ text: t('account.pwdMismatch'), ok: false });
      return;
    }
    if (newPwd && newPwd.length < 6) {
      setMessage({ text: t('account.pwdTooShort'), ok: false });
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, string> = { currentPassword: currentPwd };
      if (newUsername.trim()) body.username = newUsername.trim();
      if (newPwd)             body.newPassword = newPwd;

      const res = await api.put('/profile', body);
      const data = res.data as { message: string; changes: string[] };

      setMessage({ text: data.message, ok: true });

      if (data.changes?.includes('username') && newUsername.trim()) {
        const stored = sessionStorage.getItem('user');
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.username = newUsername.trim();
          sessionStorage.setItem('user', JSON.stringify(parsed));
        }
        onUsernameChange(newUsername.trim());
      }

      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setNewUsername('');
    } catch (err: any) {
      const msg = err?.response?.data?.error || t('common.serverError');
      setMessage({ text: msg, ok: false });
    } finally {
      setLoading(false);
    }
  };

  const roleBadgeClass = user.role === 'admin' ? 'acct-badge-admin' : 'acct-badge-engineer';

  return (
    <div className="acct-container">
      <div className="acct-card">
        <h2 className="acct-title">{t('account.title')}</h2>

        <div className="acct-info-grid">
          <div className="acct-info-row">
            <span className="acct-info-label">{t('account.username')}</span>
            <span className="acct-info-value">{user.username}</span>
          </div>
          {user.email && (
            <div className="acct-info-row">
              <span className="acct-info-label">{t('account.email')}</span>
              <span className="acct-info-value acct-muted">{user.email}</span>
            </div>
          )}
          <div className="acct-info-row">
            <span className="acct-info-label">{t('account.role')}</span>
            <span className={`acct-role-badge ${roleBadgeClass}`}>{user.role}</span>
          </div>
        </div>

        <hr className="acct-divider" />

        <h3 className="acct-section-title">{t('account.changeTitle')}</h3>
        <p className="acct-hint">{t('account.hint')}</p>

        {message && (
          <div className={`acct-alert ${message.ok ? 'acct-alert-ok' : 'acct-alert-err'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="acct-form">
          <div className="acct-field">
            <label>{t('account.newUsername')}</label>
            <input
              type="text"
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              placeholder={user.username}
              autoComplete="username"
            />
          </div>

          <div className="acct-field">
            <label>{t('account.currentPwd')} <span className="acct-required">*</span></label>
            <div className="acct-pwd-wrap">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPwd}
                onChange={e => setCurrentPwd(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button type="button" className="acct-eye" onClick={() => setShowCurrent(v => !v)}>
                {showCurrent ? t('login.hidePwd') : t('login.showPwd')}
              </button>
            </div>
          </div>

          <div className="acct-field">
            <label>{t('account.newPwd')}</label>
            <div className="acct-pwd-wrap">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
              <button type="button" className="acct-eye" onClick={() => setShowNew(v => !v)}>
                {showNew ? t('login.hidePwd') : t('login.showPwd')}
              </button>
            </div>
          </div>

          {newPwd && (
            <div className="acct-field">
              <label>{t('account.confirmPwd')}</label>
              <input
                type="password"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
          )}

          <button type="submit" className="acct-submit" disabled={loading}>
            {loading ? t('common.loading') : t('account.save')}
          </button>
        </form>
      </div>
    </div>
  );
}
