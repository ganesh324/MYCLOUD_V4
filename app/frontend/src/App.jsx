import React, { useState, useEffect } from 'react';
import { 
  Home, Folder, Star, Share2, Search, Upload, Plus, 
  Menu, MoreVertical, Image as ImageIcon, Video, Music, FileText
} from 'lucide-react';
import './App.css';

function App() {
  const [stats, setStats] = useState({
    images: 0, videos: 0, music: 0, files: 0, folders: 0, total_size: 0
  });
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const [statsRes, recentRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/recent')
      ]);
      const statsData = await statsRes.json();
      const recentData = await recentRes.json();
      setStats(statsData);
      setRecent(recentData.recent || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const calculatePercentage = (count) => {
    const total = stats.images + stats.videos + stats.music + stats.files;
    if (total === 0) return 0;
    return Math.round((count / total) * 100);
  };

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <div style={{ backgroundColor: '#1e5de6', color: 'white', padding: '6px', borderRadius: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          eeticloud
        </div>

        <nav className="nav-menu">
          <div className="nav-item active">
            <Home size={20} />
            Home
          </div>
          <div className="nav-item">
            <Folder size={20} />
            All Files
          </div>
          <div className="nav-item">
            <Star size={20} />
            Favorites
          </div>
          <div className="nav-item">
            <Share2 size={20} />
            Shared
          </div>
        </nav>

        <div className="storage-widget">
          <div style={{ position: 'relative', width: '120px', height: '60px', margin: '0 auto 20px auto' }}>
            {/* Simple semi-circle representing donut chart */}
            <svg viewBox="0 0 100 50" style={{ width: '100%', height: '100%' }}>
              <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#e2e8f0" strokeWidth="12" strokeLinecap="round" />
              {stats.total_size > 0 && (
                <path d="M 10 50 A 40 40 0 0 1 50 10" fill="none" stroke="#1e5de6" strokeWidth="12" strokeLinecap="round" />
              )}
            </svg>
            <div style={{ position: 'absolute', bottom: '0', left: '0', right: '0', textAlign: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>
              {stats.total_size > 0 ? '25%' : '0%'}
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px' }}>
            STORAGE DISTRIBUTION
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', fontSize: '0.65rem', color: '#64748b' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3a7bd5' }}></div> Images</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#9b59b6' }}></div> Videos</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2ecc71' }}></div> Music</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header">
          <div className="search-bar">
            <Search size={18} color="#94a3b8" />
            <input type="text" placeholder="Search your drive..." />
          </div>
          
          <div className="header-actions">
            <button className="btn-primary">
              <Upload size={18} />
              Upload
            </button>
            <button className="btn-secondary">
              <Plus size={18} />
              New Folder
            </button>
            
            <div className="user-profile">
              <div className="user-info">
                <span className="user-name">Ganesh</span>
                <span className="user-role">ADMIN</span>
              </div>
              <div className="avatar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              <Menu size={20} color="#64748b" style={{ cursor: 'pointer' }} />
            </div>
          </div>
        </header>

        <div className="section-header">
          <span>STORAGE OVERVIEW</span>
          <div className="live-stats" onClick={fetchStats}>
            <div className="live-stats-dot"></div>
            REFRESH LIVE STATS
          </div>
        </div>

        <div className="cards-grid">
          <div className="card animate-fade-in" style={{ background: 'var(--card-blue)', animationDelay: '0s' }}>
            <div className="card-header">
              <div className="card-icon"><ImageIcon size={24} /></div>
              <MoreVertical size={20} className="card-options" />
            </div>
            <div>
              <div className="card-title">Images</div>
              <div className="card-subtitle">{loading ? 'Loading...' : `${stats.images} files`}</div>
            </div>
          </div>
          
          <div className="card animate-fade-in" style={{ background: 'var(--card-purple)', animationDelay: '0.1s' }}>
            <div className="card-header">
              <div className="card-icon"><Video size={24} /></div>
              <MoreVertical size={20} className="card-options" />
            </div>
            <div>
              <div className="card-title">Videos</div>
              <div className="card-subtitle">{loading ? 'Loading...' : `${stats.videos} files`}</div>
            </div>
          </div>

          <div className="card animate-fade-in" style={{ background: 'var(--card-green)', animationDelay: '0.2s' }}>
            <div className="card-header">
              <div className="card-icon"><Music size={24} /></div>
              <MoreVertical size={20} className="card-options" />
            </div>
            <div>
              <div className="card-title">Music</div>
              <div className="card-subtitle">{loading ? 'Loading...' : `${stats.music} files`}</div>
            </div>
          </div>

          <div className="card animate-fade-in" style={{ background: 'var(--card-orange)', animationDelay: '0.3s' }}>
            <div className="card-header">
              <div className="card-icon"><FileText size={24} /></div>
              <MoreVertical size={20} className="card-options" />
            </div>
            <div>
              <div className="card-title">Files</div>
              <div className="card-subtitle">{loading ? 'Loading...' : `${stats.files} files`}</div>
            </div>
          </div>

          <div className="card animate-fade-in" style={{ background: 'var(--card-teal)', animationDelay: '0.4s' }}>
            <div className="card-header">
              <div className="card-icon"><Folder size={24} /></div>
              <MoreVertical size={20} className="card-options" />
            </div>
            <div>
              <div className="card-title">Folders</div>
              <div className="card-subtitle">{loading ? 'Loading...' : `${stats.folders} folders`}</div>
            </div>
          </div>
        </div>

        <div className="section-header" style={{ marginTop: '20px' }}>
          <span>FAVORITE FOLDERS</span>
        </div>
        {/* Placeholder for favorite folders (empty in design) */}
        <div style={{ height: '60px' }}></div>

        <div className="section-header">
          <span>RECENT ACTIVITY</span>
        </div>
        
        <table className="recent-activity-table animate-fade-in" style={{ animationDelay: '0.5s' }}>
          <thead>
            <tr>
              <th>NAME</th>
              <th>TYPE</th>
              <th>SIZE</th>
              <th>MODIFIED</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" className="empty-state">Loading...</td></tr>
            ) : recent.length > 0 ? (
              recent.map((item, index) => (
                <tr key={index}>
                  <td>{item.name}</td>
                  <td>{item.type}</td>
                  <td>{formatSize(item.size)}</td>
                  <td>{new Date(item.modified).toLocaleDateString()}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="4" className="empty-state">No items found</td></tr>
            )}
          </tbody>
        </table>

      </main>
    </div>
  );
}

export default App;
