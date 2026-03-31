import React, { useState, useEffect, useRef } from 'react';
import { authService } from '../services/api';
import './Login.css';

interface LoginProps {
  onLogin: (user: any, token: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername]       = useState('');
  const [password, setPassword]       = useState('');
  const [showPwd, setShowPwd]         = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [isShaking, setIsShaking]     = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { usernameRef.current?.focus(); }, []);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Veuillez remplir tous les champs');
      triggerShake();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await authService.login(username.trim(), password);
      sessionStorage.setItem('token', response.token);
      sessionStorage.setItem('user', JSON.stringify(response.user));
      onLogin(response.user, response.token);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Identifiants incorrects');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root">
      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <aside className="login-aside">
        <div className="aside-inner">
          <div className="aside-logo">
            <div className="aside-logo-mark">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <rect width="36" height="36" rx="8" fill="#2563eb"/>
                <path d="M8 18h6M22 18h6M18 8v6M18 22v6" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                <circle cx="18" cy="18" r="4" stroke="white" strokeWidth="2.5"/>
              </svg>
            </div>
            <span className="aside-logo-name">Telnet Manager</span>
          </div>

          <div className="aside-headline">
            <h1>Plateforme de test<br />& supervision</h1>
            <p>Accès centralisé aux équipements réseau. Exécutez, suivez et rapportez vos tests Telnet.</p>
          </div>

          <div className="aside-roles">
            <div className="aside-role-title">Niveaux d'accès</div>

            <div className="aside-role-card">
              <div className="role-card-header">
                <span className="role-badge role-admin">Administrateur</span>
              </div>
              <ul className="role-perms">
                <li>Tableau de bord &amp; tests</li>
                <li>Commandes Telnet — CRUD complet</li>
                <li>Génération &amp; consultation des rapports</li>
                <li>Configuration (postes, produits, slots)</li>
                <li>Multi-Test &amp; audit logs</li>
              </ul>
            </div>

            <div className="aside-role-card">
              <div className="role-card-header">
                <span className="role-badge role-engineer">Ingénieur</span>
              </div>
              <ul className="role-perms">
                <li>Tableau de bord &amp; exécution des tests</li>
                <li>Consultation des commandes Telnet</li>
                <li>Génération &amp; consultation des rapports</li>
              </ul>
            </div>
          </div>

          <div className="aside-footer">
            <span className="aside-secure-icon">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1L2 3v4c0 3.1 2.1 5.8 5 6.5C9.9 12.8 12 10.1 12 7V3L7 1z" stroke="#4ade80" strokeWidth="1.4" strokeLinejoin="round"/>
                <path d="M5 7l1.5 1.5L9.5 5" stroke="#4ade80" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            Authentification sécurisée · JWT · Bcrypt
          </div>
        </div>
      </aside>

      {/* ── Right panel (form) ───────────────────────────────────────────── */}
      <main className="login-main">
        <div className={`login-form-wrap ${isShaking ? 'shake' : ''}`}>
          <div className="form-header">
            <h2>Connexion</h2>
            <p>Entrez vos identifiants pour accéder à la plateforme</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="field-group">
              <label htmlFor="username">Nom d'utilisateur</label>
              <input
                ref={usernameRef}
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
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
                  aria-label={showPwd ? 'Masquer' : 'Afficher'}
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
                <><span className="btn-spinner" /> Connexion en cours…</>
              ) : (
                <>
                  Se connecter
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </>
              )}
            </button>
          </form>

          <div className="form-footer">
            Telnet Test Manager · v1.0 · Accès restreint
          </div>
        </div>
      </main>
    </div>
  );
};

export default Login;
