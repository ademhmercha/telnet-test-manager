import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/api';
import LanguageSwitcher from './LanguageSwitcher';
import './Login.css';

interface LoginProps {
  onLogin: (user: any, token: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  // @ts-ignore
  const { t: _t } = useTranslation();
  const t = (key: string, opts?: Record<string, any>): string => String(_t(key, opts as any));
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { usernameRef.current?.focus(); }, []);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError(t('login.fillFields'));
      triggerShake();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await authService.login(email.trim(), password);
      sessionStorage.setItem('token', response.token);
      sessionStorage.setItem('user', JSON.stringify(response.user));
      onLogin(response.user, response.token);
    } catch (err: any) {
      setError(err.response?.data?.error || t('login.badCredentials'));
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root">

      {/* ── Left panel ─────────────────────────────────────────── */}
      <aside className="login-aside">
        <div className="aside-inner">

          <div className="aside-brand">
            <img src="/Sagemcom-Logo.png" alt="Sagemcom" className="aside-sagem-logo" />
            <div className="aside-divider" />
            <span className="aside-product-label">Telnet Test Manager</span>
          </div>


        </div>
      </aside>

      {/* ── Right panel (form) ─────────────────────────────────── */}
      <main className="login-main">
        <div className="login-lang-switcher">
          <LanguageSwitcher />
        </div>

        <div className={`login-form-wrap ${isShaking ? 'shake' : ''}`}>
          <div className="form-header">
            <h2>{t('login.title')}</h2>
            <p>{t('login.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="field-group">
              <label htmlFor="username">Email</label>
              <input
                ref={usernameRef}
                id="username"
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nom@sagemcom.com"
                autoComplete="username"
                disabled={loading}
              />
            </div>

            <div className="field-group">
              <label htmlFor="password">Mot de passe</label>
              <div className="pwd-wrap">
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="pwd-toggle"
                  onClick={() => setShowPwd(v => !v)}
                  tabIndex={-1}
                  aria-label={showPwd ? t('login.hidePwd') : t('login.showPwd')}
                >
                  {showPwd ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="login-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? (
                <><span className="btn-spinner" /> {t('login.signingIn')}</>
              ) : (
                <>
                  {t('login.signin')}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </>
              )}
            </button>
          </form>

        </div>
      </main>

    </div>
  );
};

export default Login;
