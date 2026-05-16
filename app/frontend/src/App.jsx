import React, { useState, useEffect } from 'react';
import { 
  Home, Folder, Star, Share2, Search, Upload, Plus, 
  Menu, MoreVertical, Image as ImageIcon, Video, Music, FileText, ChevronRight, ArrowLeft
} from 'lucide-react';
import './App.css';

function App() {
  const [stats, setStats] = useState({
    images: 0, videos: 0, music: 0, files: 0, folders: 0, total_size: 0
  });
  const [recent, setRecent] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [currentPath, setCurrentPath] = useState('/mnt/Drive1');
  const [folderContents, setFolderContents] = useState([]);
  const [loadingFolder, setLoadingFolder] = useState(false);

  const openFolder = async (path) => {
    setCurrentView('fileManager');
    setCurrentPath(path);
    setLoadingFolder(true);
    try {
      const res = await fetch(`/api/files/list?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        setFolderContents(data.items || []);
      } else {
        console.error("Failed to load directory");
        setFolderContents([]);
      }
    } catch (error) {
      console.error("Error fetching folder contents:", error);
      setFolderContents([]);
    } finally {
      setLoadingFolder(false);
    }
  };

  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length > 2) {
      parts.pop();
      openFolder('/' + parts.join('/'));
    } else {
      setCurrentView('dashboard');
    }
  };

  const fetchStats = async () => {
    try {
      const [statsRes, recentRes, favRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/recent'),
        fetch('/api/favorites')
      ]);
      const statsData = await statsRes.json();
      const recentData = await recentRes.json();
      const favData = await favRes.json();
      
      setStats(statsData);
      setRecent(recentData.recent || []);
      setFavorites(favData.favorites || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const toggleFavorite = async (item, isFile = true) => {
    try {
      // Optimistic update
      if (isFile) {
        setRecent(recent.map(r => r.path === item.path ? { ...r, is_favorite: !r.is_favorite } : r));
      }

      const res = await fetch('/api/favorites/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: item.path,
          type: item.type,
          name: item.name
        })
      });
      
      const data = await res.json();
      
      // Update favorites list based on response
      if (data.status === 'added') {
        setFavorites([...favorites, { path: item.path, type: item.type, name: item.name }]);
      } else {
        setFavorites(favorites.filter(f => f.path !== item.path));
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      // Revert optimistic update on error by refetching
      fetchStats();
    }
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const favoriteFolders = favorites.filter(f => f.type === 'Folder');

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <img src="/logo.png" alt="MyCloud Logo" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
          MyCloud
        </div>

        <nav className="nav-menu">
          <div className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentView('dashboard')}>
            <Home size={20} />
            Home
          </div>
          <div className={`nav-item ${currentView === 'fileManager' ? 'active' : ''}`} onClick={() => openFolder('/mnt/Drive1')}>
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
            <div className="action-capsule">
              <button className="btn-primary">
                <Upload size={18} />
                Upload
              </button>
              <button className="btn-secondary">
                <Plus size={18} />
                New Folder
              </button>
            </div>
            
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

        {currentView === 'dashboard' ? (
          <>
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
        
        {loading ? (
          <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>Loading favorites...</div>
        ) : favoriteFolders.length > 0 ? (
          <div className="favorites-grid animate-fade-in">
            {favoriteFolders.map((folder, idx) => (
              <div key={idx} className="favorite-folder-card" onClick={() => openFolder(folder.path)}>
                <Folder size={24} className="favorite-folder-icon" />
                <div className="favorite-folder-info">
                  <span className="favorite-folder-name">{folder.name}</span>
                  <span className="favorite-folder-type">Folder</span>
                </div>
                <Star size={18} className="star-toggle active" style={{ marginLeft: 'auto' }} onClick={(e) => { e.stopPropagation(); toggleFavorite(folder, false); }} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ height: '60px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
            No favorite folders yet.
          </div>
        )}

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
                  <td>
                    <div className="name-cell">
                      <Star 
                        size={18} 
                        className={`star-toggle ${item.is_favorite ? 'active' : ''}`}
                        onClick={() => toggleFavorite(item, true)}
                        style={{ cursor: 'pointer' }}
                      />
                      {item.name}
                    </div>
                  </td>
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
          </>
        ) : (
          <div className="file-manager-view animate-fade-in">
            <div className="breadcrumb">
              <button className="btn-icon" onClick={navigateUp}><ArrowLeft size={20} /></button>
              <div className="path-text">
                {currentPath.split('/').filter(Boolean).map((part, idx, arr) => (
                  <span key={idx} className="breadcrumb-part">
                    {part}
                    {idx < arr.length - 1 && <ChevronRight size={16} />}
                  </span>
                ))}
              </div>
            </div>
            
            {loadingFolder ? (
              <div className="loading-state">Loading folder contents...</div>
            ) : (
              <div className="fm-grid">
                {folderContents.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="fm-item" 
                    onDoubleClick={() => item.type === 'Folder' ? openFolder(item.path) : null}
                  >
                    {item.type === 'Image' ? (
                      <div className="fm-thumbnail-container">
                        <img src={`/api/thumbnail?path=${encodeURIComponent(item.path)}`} alt={item.name} className="fm-thumbnail" loading="lazy" />
                      </div>
                    ) : (
                      <div className="fm-icon-container">
                        {item.type === 'Folder' ? (
                          <Folder size={48} color="#3a7bd5" className="fm-icon" />
                        ) : item.type === 'Video' ? (
                          <Video size={48} color="#9b59b6" className="fm-icon" />
                        ) : item.type === 'Music' ? (
                          <Music size={48} color="#2ecc71" className="fm-icon" />
                        ) : (
                          <FileText size={48} color="#94a3b8" className="fm-icon" />
                        )}
                      </div>
                    )}
                    <div className="fm-item-name" title={item.name}>{item.name}</div>
                  </div>
                ))}
                {folderContents.length === 0 && (
                  <div className="empty-state">This folder is empty</div>
                )}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}

export default App;
