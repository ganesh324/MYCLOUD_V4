import React, { useState } from 'react';
import { User, Lock, Shield, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';

function Login({ onLoginSuccess }) {
  const [method, setMethod] = useState('profile'); // 'profile' | 'credentials'
  const [selectedUser, setSelectedUser] = useState(null); // 'ganesh' | 'haritha'
  const [roleMode, setRoleMode] = useState('user'); // 'admin' | 'user' for Ganesh
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleProfileSelect = (user) => {
    setSelectedUser(user);
    if (user === 'haritha') {
      setRoleMode('user');
    }
    setError('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    let loginUsername = username;
    let loginPassword = password;

    if (method === 'profile') {
      if (selectedUser === 'ganesh') {
        loginUsername = roleMode === 'admin' ? 'ganesh_admin' : 'ganesh';
        loginPassword = 'Hello324';
      } else if (selectedUser === 'haritha') {
        loginUsername = 'haritha';
        loginPassword = 'Hello0611';
      } else {
        setError('Please select a profile first');
        setLoading(false);
        return;
      }
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to authenticate');
      }

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

        <form onSubmit={handleLogin} className="login-form">
          {method === 'profile' ? (
            <div className="profile-selection">
              <p className="section-label">Select your profile to log in</p>
              
              <div className="profile-grid">
                {/* Ganesh Eeti Profile */}
                <div 
                  className={`profile-card glass ${selectedUser === 'ganesh' ? 'active' : ''}`}
                  onClick={() => handleProfileSelect('ganesh')}
                >
                  <div className="profile-avatar ganesh-avatar">GE</div>
                  <div className="profile-name">Ganesh Eeti</div>
                  {selectedUser === 'ganesh' && (
                    <div className="role-switcher-container" onClick={(e) => e.stopPropagation()}>
                      <div className="role-switches">
                        <button 
                          type="button"
                          className={`role-btn ${roleMode === 'user' ? 'active' : ''}`}
                          onClick={() => setRoleMode('user')}
                        >
                          Normal
                        </button>
                        <button 
                          type="button"
                          className={`role-btn ${roleMode === 'admin' ? 'active' : ''}`}
                          onClick={() => setRoleMode('admin')}
                        >
                          Admin
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Haritha Kothuri Profile */}
                <div 
                  className={`profile-card glass ${selectedUser === 'haritha' ? 'active' : ''}`}
                  onClick={() => handleProfileSelect('haritha')}
                >
                  <div className="profile-avatar haritha-avatar">HK</div>
                  <div className="profile-name">Haritha Kothuri</div>
                  {selectedUser === 'haritha' && (
                    <div className="role-switcher-container">
                      <span className="badge badge-user">Normal User</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="profile-action-area">
                <button
                  type="submit"
                  disabled={loading || !selectedUser}
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

                <button
                  type="button"
                  className="switch-login-method-btn"
                  onClick={() => {
                    setMethod('credentials');
                    setError('');
                  }}
                >
                  Log in manually with username & password
                </button>
              </div>
            </div>
          ) : (
            <div className="credentials-selection animate-slide-up">
              <p className="section-label">Log in with your credentials</p>

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
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
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

                <button
                  type="button"
                  className="switch-login-method-btn"
                  onClick={() => {
                    setMethod('profile');
                    setError('');
                  }}
                >
                  Back to Profile Selection
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default Login;
