import { useState } from 'react';
import { User, Lock, Shield, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';

function Login({ onLoginSuccess, profiles = [] }) {
  const [method, setMethod] = useState('profile'); // 'profile' | 'credentials'
  const [selectedUser, setSelectedUser] = useState(null);
  const [roleMode, setRoleMode] = useState('user');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleProfileSelect = (profileId) => {
    const profile = profiles.find((item) => item.id === profileId);
    setSelectedUser(profileId);
    if (!profile?.admin_username) {
      setRoleMode('user');
    }
    setPassword('');
    setError('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    let loginUsername = username;
    let loginPassword = password;

    if (method === 'profile') {
      const selectedProfile = profiles.find((item) => item.id === selectedUser);
      if (!selectedProfile) {
        setError('Please select a profile first');
        setLoading(false);
        return;
      }
      loginUsername = roleMode === 'admin' && selectedProfile.admin_username
        ? selectedProfile.admin_username
        : selectedProfile.username;
      loginPassword = password;
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
      setError(err.message || 'Incorrect password');
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
          {method === 'profile' && profiles.length > 0 ? (
            <div className="profile-selection">
              <p className="section-label">Select your profile to log in</p>
              
              <div className="profile-grid">
                {profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className={`profile-card glass ${selectedUser === profile.id ? 'active' : ''}`}
                    onClick={() => handleProfileSelect(profile.id)}
                  >
                    <div className="profile-avatar">{profile.initials || profile.display_name?.slice(0, 2) || 'U'}</div>
                    <div className="profile-name">{profile.display_name}</div>
                    {selectedUser === profile.id && (
                      <div className="role-switcher-container" onClick={(e) => e.stopPropagation()}>
                        {profile.admin_username ? (
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
                        ) : (
                          <span className="badge badge-user">Normal User</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {selectedUser && (
                <div className="input-group animate-slide-up" style={{ marginTop: '8px' }}>
                  <label htmlFor="profile-password">Enter password for {profiles.find((profile) => profile.id === selectedUser)?.display_name || 'selected profile'}</label>
                  <div className="input-field-wrapper">
                    <Lock size={18} className="input-icon" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="profile-password"
                      placeholder="Enter password..."
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
              )}

              <div className="profile-action-area">
                <button
                  type="submit"
                  disabled={loading || !selectedUser || profiles.length === 0}
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
                    setMethod(profiles.length > 0 ? 'profile' : 'credentials');
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
