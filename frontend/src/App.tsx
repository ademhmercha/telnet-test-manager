import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Reports from './components/Reports';
import Commands from './components/Commands';
import MultiTest from './components/MultiTest';
import Configuration from './components/Configuration';
import AdminPanel from './components/AdminPanel';
import LanguageSwitcher from './components/LanguageSwitcher';
import './App.css';

interface User {
  id: number;
  username: string;
  role: string;
}

type ViewId = 'dashboard' | 'reports' | 'commands' | 'multitest' | 'configuration' | 'admin';

function App() {
  // @ts-ignore
  const { t: _t } = useTranslation();
  const t = (key: string, opts?: Record<string, any>): string => String(_t(key, opts as any));
  const [user, setUser]               = useState<User | null>(null);
  const [loading, setLoading]         = useState(true);
  const [currentView, setCurrentView] = useState<ViewId>('dashboard');

  const NAV_ITEMS = [
    { id: 'dashboard'     as ViewId, label: t('nav.dashboard'),      roles: ['admin', 'engineer'] },
    { id: 'reports'       as ViewId, label: t('nav.reports'),         roles: ['admin', 'engineer'] },
    { id: 'commands'      as ViewId, label: t('nav.commands'),        roles: ['admin', 'engineer'] },
    { id: 'multitest'     as ViewId, label: t('nav.multitest'),       roles: ['admin', 'engineer'] },
    { id: 'configuration' as ViewId, label: t('nav.configuration'),   roles: ['admin'] },
    { id: 'admin'         as ViewId, label: t('nav.admin'),           roles: ['admin'] },
  ];

  useEffect(() => {
    const token    = sessionStorage.getItem('token');
    const userData = sessionStorage.getItem('user');
    if (token && userData) {
      try {
        setUser(JSON.parse(userData));
      } catch {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData: User) => {
    setUser(userData);
    setCurrentView('dashboard');
  };

  const handleLogout = async () => {
    const token = sessionStorage.getItem('token');
    if (token) {
      try {
        await fetch('http://localhost:3002/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch {
        // continue even if the call fails
      }
    }
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setUser(null);
    setCurrentView('dashboard');
  };

  const allowedViews = NAV_ITEMS
    .filter(n => user && n.roles.includes(user.role))
    .map(n => n.id);

  const safeView: ViewId = allowedViews.includes(currentView) ? currentView : 'dashboard';

  const navigate = (view: ViewId) => {
    if (allowedViews.includes(view)) setCurrentView(view);
  };

  const roleBadgeClass = user?.role === 'admin' ? 'nav-role-admin' : 'nav-role-engineer';

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="App">
      {user ? (
        <>
          <nav className="main-nav">
            <div className="nav-left">
              <span className="nav-brand">{t('nav.brand')}</span>
              <div className="nav-divider" />
              <div className="nav-links">
                {NAV_ITEMS.filter(n => n.roles.includes(user.role)).map(n => (
                  <button
                    key={n.id}
                    className={`nav-link ${safeView === n.id ? 'active' : ''}`}
                    onClick={() => navigate(n.id)}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="nav-right">
              <div className="nav-user">
                <span className="nav-user-name">{user.username}</span>
                <span className={`nav-user-role ${roleBadgeClass}`}>{user.role}</span>
              </div>
              <div className="nav-divider" />
              <LanguageSwitcher />
              <div className="nav-divider" />
              <button className="nav-logout" onClick={handleLogout}>
                {t('nav.logout')}
              </button>
            </div>
          </nav>

          <main className="main-content">
            {safeView === 'dashboard'     && <Dashboard />}
            {safeView === 'reports'       && <Reports />}
            {safeView === 'commands'      && <Commands />}
            {safeView === 'multitest'     && <MultiTest />}
            {safeView === 'configuration' && <Configuration />}
            {safeView === 'admin'         && <AdminPanel />}
          </main>
        </>
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;
