import { useState } from 'react';
import { User, Lock, Shield, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import { getRegisteredDevice } from './utils/device';

function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          secret_code: secretCode,
          ...getRegisteredDevice(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to authenticate');
      }

      setSecretCode('');
      onLoginSuccess(data);
    } catch (err) {
      setError(err.message || 'Incorrect username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-glow-1"></div>
      <div className="login-glow-2"></div>

      <div className="login-card glass animate-fade-in">
        <div className="login-header">
          <div className="logo-badge">
            <Shield size={24} className="logo-badge-icon" />
          </div>
          <h1>MyCloud NAS</h1>
          <p className="login-subtitle">Secure Personal Cloud Storage Management</p>
        </div>

        {error && (
          <div className="login-error-alert animate-shake">
            <span className="error-message">{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="login-form credentials-selection animate-slide-up">
          <p className="section-label">Log in with your username and password</p>

          <div className="input-group">
            <label htmlFor="username">Username</label>
            <div className="input-field-wrapper">
              <User size={18} className="input-icon" />
              <input
                type="text"
                id="username"
                placeholder="Enter your username..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="input-field-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                placeholder="Enter your password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="input-group first-login-code-group">
            <label htmlFor="secret-code">First-login secret code</label>
            <div className="input-field-wrapper">
              <Shield size={18} className="input-icon" />
              <input
                type="text"
                id="secret-code"
                placeholder="Only needed for first login"
                value={secretCode}
                onChange={(e) => setSecretCode(e.target.value)}
                autoComplete="one-time-code"
              />
            </div>
          </div>

          <div className="profile-action-area">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary login-btn"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  <span>Enter Drive</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;
