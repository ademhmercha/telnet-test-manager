import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Reports from './components/Reports';
import './App.css';

interface User {
  id: number;
  username: string;
  role: string;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'dashboard' | 'reports'>('dashboard');

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    const userData = sessionStorage.getItem('user');
    
    if (token && userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
      } catch (error) {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData: User, token: string) => {
    setUser(userData);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setUser(null);
    setCurrentView('dashboard');
  };

  const renderNavigation = () => {
    return (
      <nav className="main-nav">
        <div className="nav-left">
          <span className="nav-brand">Telnet Test Manager</span>
          <div className="nav-divider" />
          <div className="nav-links">
            <button
              className={`nav-link ${currentView === 'dashboard' ? 'active' : ''}`}
              onClick={() => setCurrentView('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={`nav-link ${currentView === 'reports' ? 'active' : ''}`}
              onClick={() => setCurrentView('reports')}
            >
              Rapports
            </button>
          </div>
        </div>
        <div className="nav-right">
          <div className="nav-user">
            <span className="nav-user-name">{user?.username}</span>
            <span className="nav-user-role">{user?.role}</span>
          </div>
          <div className="nav-divider" />
          <button className="nav-logout" onClick={handleLogout}>
            Déconnexion
          </button>
        </div>
      </nav>
    );
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="App">
      {user ? (
        <>
          {renderNavigation()}
          <main className="main-content">
            {currentView === 'dashboard' ? <Dashboard /> : <Reports />}
          </main>
        </>
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;
