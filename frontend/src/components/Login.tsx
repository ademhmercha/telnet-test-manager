import React, { useState, useEffect } from 'react';
import { authService } from '../services/api';
import './Login.css';

interface LoginProps {
  onLogin: (user: any, token: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Auto-focus on username field
  useEffect(() => {
    const usernameField = document.getElementById('username');
    if (usernameField) {
      usernameField.focus();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      setError('Veuillez remplir tous les champs');
      triggerShake();
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const response = await authService.login(username, password);
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

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  return (
    <div className={`login-container ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
      <div className="login-background">
        <div className="floating-shapes">
          <div className="shape shape-1"></div>
          <div className="shape shape-2"></div>
          <div className="shape shape-3"></div>
          <div className="shape shape-4"></div>
        </div>
      </div>
      
      <div className={`login-card ${isShaking ? 'shake' : ''}`}>
        <div className="login-header">
          <div className="logo-container">
            <div className="logo">
              <div className="logo-icon">◉</div>
            </div>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form" id="login-form">
          <div className="form-group">
            <label htmlFor="username">
              <span className="label-icon">●</span>
              Nom d'utilisateur
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="admin"
              autoComplete="username"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">
              <span className="label-icon">●</span>
              Mot de passe
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          
          {error && (
            <div className="error-message">
              <span className="error-icon">!</span>
              {error}
            </div>
          )}
          
          <button type="submit" disabled={loading} className="login-button">
            {loading ? (
              <>
                <span className="loading-spinner"></span>
                Connexion en cours...
              </>
            ) : (
              <>
                <span className="button-icon">→</span>
                Se connecter
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
