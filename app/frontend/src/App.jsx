import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, Folder, Star, Share2, Search, Upload, Plus, 
  Menu, MoreVertical, Image as ImageIcon, Video, Music, FileText, ChevronRight, ArrowLeft,
  LayoutGrid, List, Trash2, Edit3, CloudUpload, Check, AlertCircle, Loader2
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
  const [viewMode, setViewMode] = useState('grid');
  const [activeModal, setActiveModal] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [renameInput, setRenameInput] = useState('');
  
  // Preview States
  const [previewItem, setPreviewItem] = useState(null);
  const [previewTextContent, setPreviewTextContent] = useState('');
  const [loadingPreviewText, setLoadingPreviewText] = useState(false);

  // Folder & Upload States
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadQueue, setUploadQueue] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

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
      // Optimistic update for recent
      setRecent(recent.map(r => r.path === item.path ? { ...r, is_favorite: !r.is_favorite } : r));
      // Optimistic update for folderContents
      setFolderContents(folderContents.map(f => f.path === item.path ? { ...f, is_favorite: !f.is_favorite } : f));

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
      fetchStats();
      if (currentView === 'fileManager') openFolder(currentPath);
    }
  };

  const handleRenameClick = (item) => {
    setSelectedItem(item);
    setRenameInput(item.name);
    setActiveModal('rename');
  };

  const handleDeleteClick = (item) => {
    setSelectedItem(item);
    setActiveModal('delete');
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    if (!renameInput.trim() || !selectedItem) return;
    try {
      const res = await fetch('/api/files/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedItem.path, new_name: renameInput.trim() })
      });
      if (res.ok) {
        setActiveModal(null);
        openFolder(currentPath);
        fetchStats();
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to rename");
      }
    } catch (error) {
      console.error("Error renaming:", error);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!selectedItem) return;
    try {
      const res = await fetch('/api/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedItem.path })
      });
      if (res.ok) {
        setActiveModal(null);
        openFolder(currentPath);
        fetchStats();
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to delete");
      }
    } catch (error) {
      console.error("Error deleting:", error);
    }
  };

  const openPreview = async (item) => {
    setPreviewItem(item);
    if (item.type === 'Text') {
      setLoadingPreviewText(true);
      setPreviewTextContent('');
      try {
        const res = await fetch(`/api/files/text?path=${encodeURIComponent(item.path)}`);
        if (res.ok) {
          const data = await res.json();
          setPreviewTextContent(data.content);
        } else {
          setPreviewTextContent('Failed to load file content.');
        }
      } catch (error) {
        console.error("Error reading text file:", error);
        setPreviewTextContent('Error loading file content.');
      } finally {
        setLoadingPreviewText(false);
      }
    }
  };

  const handleMkdirSubmit = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch('/api/files/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath, folder_name: newFolderName.trim() })
      });
      if (res.ok) {
        setActiveModal(null);
        setNewFolderName('');
        openFolder(currentPath);
        fetchStats();
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to create folder");
      }
    } catch (error) {
      console.error("Error creating folder:", error);
    }
  };

  const handleUploadFiles = async (files) => {
    if (!files || files.length === 0) return;
    setActiveModal('uploadCenter');
    
    const newItems = Array.from(files).map((f, idx) => ({
      id: Date.now() + '-' + idx,
      name: f.name,
      size: f.size,
      progress: 0,
      status: 'pending',
      file: f
    }));
    
    setUploadQueue(prev => [...prev, ...newItems]);
    
    for (const item of newItems) {
      await uploadSingleFile(item);
    }
    
    openFolder(currentPath);
    fetchStats();
  };

  const uploadSingleFile = (queueItem) => {
    return new Promise((resolve) => {
      const formData = new FormData();
      formData.append('path', currentPath);
      formData.append('file', queueItem.file);
      
      const xhr = new XMLHttpRequest();
      
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploadQueue(prev => prev.map(item => 
            item.id === queueItem.id ? { ...item, progress: percent, status: percent === 100 ? 'processing' : 'uploading' } : item
          ));
        }
      };
      
      xhr.onload = () => {
        if (xhr.status === 200) {
          setUploadQueue(prev => prev.map(item => 
            item.id === queueItem.id ? { ...item, progress: 100, status: 'completed' } : item
          ));
        } else {
          setUploadQueue(prev => prev.map(item => 
            item.id === queueItem.id ? { ...item, status: 'error' } : item
          ));
        }
        resolve();
      };
      
      xhr.onerror = () => {
        setUploadQueue(prev => prev.map(item => 
          item.id === queueItem.id ? { ...item, status: 'error' } : item
        ));
        resolve();
      };
      
      xhr.open('POST', '/api/files/upload', true);
      xhr.send(formData);
    });
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
              <input 
                type="file" 
                multiple 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                onChange={(e) => handleUploadFiles(e.target.files)} 
              />
              <button className="btn-primary" onClick={() => { setActiveModal('uploadCenter'); }}>
                <Upload size={18} />
                Upload
              </button>
              <button className="btn-secondary" onClick={() => setActiveModal('newFolder')}>
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
              <div className="view-mode-toggle">
                <button className={`btn-icon ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>
                  <LayoutGrid size={18} />
                </button>
                <button className={`btn-icon ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
                  <List size={18} />
                </button>
              </div>
            </div>
            
            {loadingFolder ? (
              <div className="loading-state">Loading folder contents...</div>
            ) : (
              <>
                {viewMode === 'grid' ? (
                  <div className="fm-grid">
                    {folderContents.map((item, idx) => (
                      <div 
                        key={idx} 
                        className="fm-item grid-item" 
                        onDoubleClick={() => item.type === 'Folder' ? openFolder(item.path) : openPreview(item)}
                      >
                        <div className="fm-actions-overlay">
                          <button className={`action-btn star ${item.is_favorite ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFavorite(item, false); }}>
                            <Star size={14} />
                          </button>
                          <button className="action-btn edit" onClick={(e) => { e.stopPropagation(); handleRenameClick(item); }}>
                            <Edit3 size={14} />
                          </button>
                          <button className="action-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteClick(item); }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                        
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
                  </div>
                ) : (
                  <div className="fm-list-view">
                    <table className="fm-list-table">
                      <thead>
                        <tr>
                          <th>NAME</th>
                          <th>TYPE</th>
                          <th>SIZE</th>
                          <th>MODIFIED</th>
                          <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {folderContents.map((item, idx) => (
                          <tr 
                            key={idx} 
                            className="fm-list-row"
                            onDoubleClick={() => item.type === 'Folder' ? openFolder(item.path) : openPreview(item)}
                          >
                            <td>
                              <div className="fm-list-name-cell">
                                {item.type === 'Image' ? (
                                  <div className="fm-list-thumbnail-container">
                                    <img src={`/api/thumbnail?path=${encodeURIComponent(item.path)}`} alt={item.name} className="fm-list-thumbnail" loading="lazy" />
                                  </div>
                                ) : item.type === 'Folder' ? (
                                  <Folder size={20} color="#3a7bd5" />
                                ) : item.type === 'Video' ? (
                                  <Video size={20} color="#9b59b6" />
                                ) : item.type === 'Music' ? (
                                  <Music size={20} color="#2ecc71" />
                                ) : (
                                  <FileText size={20} color="#94a3b8" />
                                )}
                                <span className="fm-list-item-name" title={item.name}>{item.name}</span>
                              </div>
                            </td>
                            <td>{item.type}</td>
                            <td>{item.type === 'Folder' ? '--' : formatSize(item.size)}</td>
                            <td>{new Date(item.modified).toLocaleDateString()}</td>
                            <td>
                              <div className="fm-list-actions">
                                <button className={`action-btn star ${item.is_favorite ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFavorite(item, false); }}>
                                  <Star size={14} />
                                </button>
                                <button className="action-btn edit" onClick={(e) => { e.stopPropagation(); handleRenameClick(item); }}>
                                  <Edit3 size={14} />
                                </button>
                                <button className="action-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteClick(item); }}>
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {folderContents.length === 0 && (
                  <div className="empty-state">This folder is empty</div>
                )}
              </>
            )}
          </div>
        )}

      </main>

      {/* Rename Modal */}
      {activeModal === 'rename' && selectedItem && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Rename {selectedItem.type}</h3>
            <form onSubmit={handleRenameSubmit}>
              <input 
                type="text" 
                className="modal-input" 
                value={renameInput} 
                onChange={(e) => setRenameInput(e.target.value)}
                autoFocus
                placeholder="Enter new name"
              />
              <div className="modal-footer">
                <button type="button" className="btn-modal-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                <button type="submit" className="btn-modal-primary">Rename</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {activeModal === 'delete' && selectedItem && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="modal-content glass delete" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Confirm Deletion</h3>
            <p className="modal-text">Are you sure you want to delete the {selectedItem.type.toLowerCase()} <strong>{selectedItem.name}</strong>? This action cannot be undone.</p>
            <div className="modal-footer">
              <button type="button" className="btn-modal-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
              <button type="button" className="btn-modal-danger" onClick={handleDeleteSubmit}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewItem && (
        <div className="preview-backdrop" onClick={() => setPreviewItem(null)}>
          <div className="preview-content glass" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <div className="preview-title-info">
                <span className="preview-badge">{previewItem.type}</span>
                <span className="preview-filename" title={previewItem.name}>{previewItem.name}</span>
              </div>
              <div className="preview-actions">
                <a 
                  href={`/api/files/raw?path=${encodeURIComponent(previewItem.path)}`} 
                  download={previewItem.name} 
                  className="btn-modal-primary"
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '0.85rem' }}
                >
                  Download
                </a>
                <button className="btn-icon close-btn" onClick={() => setPreviewItem(null)}>
                  <Plus size={20} style={{ transform: 'rotate(45deg)' }} />
                </button>
              </div>
            </div>
            <div className="preview-body">
              {previewItem.type === 'Image' ? (
                <div className="preview-media-container">
                  <img src={`/api/files/raw?path=${encodeURIComponent(previewItem.path)}`} alt={previewItem.name} className="preview-image" />
                </div>
              ) : previewItem.type === 'PDF' ? (
                <iframe 
                  src={`/api/files/raw?path=${encodeURIComponent(previewItem.path)}`} 
                  width="100%" 
                  height="100%" 
                  style={{ border: 'none', borderRadius: '12px' }} 
                  title={previewItem.name} 
                />
              ) : previewItem.type === 'Text' ? (
                <div className="preview-text-container">
                  {loadingPreviewText ? (
                    <div className="preview-loading">Loading text content...</div>
                  ) : (
                    <pre className="preview-text-content">
                      <code>{previewTextContent}</code>
                    </pre>
                  )}
                </div>
              ) : previewItem.type === 'Video' ? (
                <div className="preview-media-container">
                  <video src={`/api/files/raw?path=${encodeURIComponent(previewItem.path)}`} controls className="preview-video" autoPlay />
                </div>
              ) : previewItem.type === 'Music' ? (
                <div className="preview-media-container music">
                  <div className="music-preview-card">
                    <Music size={64} color="var(--primary)" />
                    <span className="music-filename">{previewItem.name}</span>
                    <audio src={`/api/files/raw?path=${encodeURIComponent(previewItem.path)}`} controls autoPlay />
                  </div>
                </div>
              ) : (
                <div className="preview-unsupported">
                  <FileText size={64} color="var(--text-muted)" />
                  <p>Previews are not supported for this file type.</p>
                  <a 
                    href={`/api/files/raw?path=${encodeURIComponent(previewItem.path)}`} 
                    download={previewItem.name} 
                    className="btn-modal-primary"
                    style={{ textDecoration: 'none' }}
                  >
                    Download File
                  </a>
                </div>
              )}
            </div>
          </div>
            </div>
      )}

      {/* New Folder Modal */}
      {activeModal === 'newFolder' && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Create New Folder</h3>
            <form onSubmit={handleMkdirSubmit}>
              <input 
                type="text" 
                className="modal-input" 
                value={newFolderName} 
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
                placeholder="Enter folder name"
                required
              />
              <div className="modal-footer">
                <button type="button" className="btn-modal-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                <button type="submit" className="btn-modal-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Center Modal */}
      {activeModal === 'uploadCenter' && (
        <div className="modal-backdrop" onClick={() => { setUploadQueue([]); setActiveModal(null); }}>
          <div className="modal-content glass upload-center" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 className="modal-title" style={{ margin: 0 }}>Upload Center</h3>
              <button className="btn-icon close-btn" onClick={() => { setUploadQueue([]); setActiveModal(null); }}>
                <Plus size={20} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
            
            <div 
              className={`dropzone ${isDragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleUploadFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current.click()}
            >
              <CloudUpload size={48} className="dropzone-icon" />
              <p className="dropzone-text">Drag & drop files here or <span className="browse-link">browse</span></p>
              <p className="dropzone-sub">Supports uploading multiple files at once</p>
            </div>
            
            {uploadQueue.length > 0 && (
              <div className="upload-queue-container">
                <h4 className="queue-title">Upload Progress ({uploadQueue.filter(i => i.status === 'completed').length}/{uploadQueue.length})</h4>
                <div className="upload-queue-list">
                  {uploadQueue.map(item => (
                    <div key={item.id} className="queue-item">
                      <div className="queue-item-info">
                        <span className="queue-item-name" title={item.name}>{item.name}</span>
                        <span className="queue-item-size">{formatSize(item.size)}</span>
                      </div>
                      <div className="queue-progress-row">
                        <div className="queue-progress-track">
                          <div className={`queue-progress-bar ${item.status}`} style={{ width: `${item.progress}%` }}></div>
                        </div>
                        <div className="queue-status-indicator">
                          {item.status === 'pending' && <span className="status-badge pending">Pending</span>}
                          {item.status === 'uploading' && <span className="status-badge uploading">{item.progress}%</span>}
                          {item.status === 'processing' && <span className="status-badge processing"><Loader2 size={12} className="spin" /> Processing</span>}
                          {item.status === 'completed' && <span className="status-badge completed"><Check size={12} /> Done</span>}
                          {item.status === 'error' && <span className="status-badge error"><AlertCircle size={12} /> Error</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="modal-footer" style={{ marginTop: '24px' }}>
              <button 
                type="button" 
                className="btn-modal-secondary" 
                onClick={() => { setUploadQueue([]); setActiveModal(null); }}
              >
                Clear Queue & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

