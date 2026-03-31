import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Reports from './components/Reports';
import Commands from './components/Commands';
import MultiTest from './components/MultiTest';
import Configuration from './components/Configuration';
import './App.css';

interface User {
  id: number;
  username: string;
  role: string;
}

// Pages disponibles selon le rôle
type ViewId = 'dashboard' | 'reports' | 'commands' | 'multitest' | 'configuration';

interface NavItem {
  id: ViewId;
  label: string;
  roles: string[]; // rôles autorisés
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',     label: 'Dashboard',      roles: ['admin', 'engineer'] },
  { id: 'reports',       label: 'Rapports',        roles: ['admin', 'engineer'] },
  { id: 'commands',      label: 'Commandes',       roles: ['admin', 'engineer'] },
  { id: 'multitest',     label: 'Multi-Test',      roles: ['admin', 'engineer'] },
  { id: 'configuration', label: 'Configuration',   roles: ['admin'] },
];

function App() {
  const [user, setUser]               = useState<User | null>(null);
  const [loading, setLoading]         = useState(true);
  const [currentView, setCurrentView] = useState<ViewId>('dashboard');

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

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setUser(null);
    setCurrentView('dashboard');
  };

  // Si la vue courante n'est plus accessible après un changement de rôle, reset
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
        <div className="loading-spinner">Chargement…</div>
      </div>
    );
  }

  return (
    <div className="App">
      {user ? (
        <>
          <nav className="main-nav">
            <div className="nav-left">
              <span className="nav-brand">Telnet Manager</span>
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
              <button className="nav-logout" onClick={handleLogout}>
                Déconnexion
              </button>
            </div>
          </nav>

          <main className="main-content">
            {safeView === 'dashboard'     && <Dashboard />}
            {safeView === 'reports'       && <Reports />}
            {safeView === 'commands'      && <Commands />}
            {safeView === 'multitest'     && <MultiTest />}
            {safeView === 'configuration' && <Configuration />}
          </main>
        </>
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;
