import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, Folder, Star, Share2, Search, Upload, Plus, 
  Menu, MoreVertical, Image as ImageIcon, Video, Music, FileText, ChevronRight, ArrowLeft,
  LayoutGrid, List, Trash2, Edit3, CloudUpload, Check, AlertCircle, Loader2, Download
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

  // Advanced States: Search, Category Gallery, Bulk Selections
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchDropdownVisible, setSearchDropdownVisible] = useState(false);
  
  const [activeCategory, setActiveCategory] = useState(null);
  const [categoryFiles, setCategoryFiles] = useState([]);
  const [loadingCategory, setLoadingCategory] = useState(false);
  
  const [selectedPaths, setSelectedPaths] = useState([]);

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

  const handleSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/files/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (e) {
      console.error("Error searching files:", e);
    }
  };

  const openCategory = async (category) => {
    setActiveCategory(category);
    setCurrentView('categoryGallery');
    setLoadingCategory(true);
    try {
      const res = await fetch(`/api/files/category?category=${category}`);
      if (res.ok) {
        const data = await res.json();
        setCategoryFiles(data);
      }
    } catch (e) {
      console.error("Error fetching category files:", e);
    } finally {
      setLoadingCategory(false);
    }
  };

  const toggleSelectItem = (path, e) => {
    if (e) e.stopPropagation();
    setSelectedPaths(prev => {
      if (prev.includes(path)) {
        return prev.filter(p => p !== path);
      } else {
        return [...prev, path];
      }
    });
  };

  const toggleSelectAll = () => {
    const allPaths = folderContents.map(i => i.path);
    const allSelected = allPaths.every(p => selectedPaths.includes(p));
    if (allSelected) {
      setSelectedPaths(prev => prev.filter(p => !allPaths.includes(p)));
    } else {
      setSelectedPaths(prev => {
        const otherSelected = prev.filter(p => !allPaths.includes(p));
        return [...otherSelected, ...allPaths];
      });
    }
  };

  const handleBulkFavorite = async () => {
    const itemsToFavorite = folderContents
      .filter(item => selectedPaths.includes(item.path))
      .map(item => ({
        path: item.path,
        type: item.type,
        name: item.name
      }));
      
    if (itemsToFavorite.length === 0) return;
    
    try {
      const res = await fetch('/api/files/bulk-favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToFavorite })
      });
      if (res.ok) {
        setSelectedPaths([]);
        fetchFavorites();
        openFolder(currentPath);
      } else {
        alert("Failed to star selected items");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedPaths.length} items? This cannot be undone.`)) {
      return;
    }
    
    try {
      const res = await fetch('/api/files/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: selectedPaths })
      });
      if (res.ok) {
        setSelectedPaths([]);
        openFolder(currentPath);
        fetchStats();
      } else {
        alert("Failed to delete selected items");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkDownload = async () => {
    try {
      const res = await fetch('/api/files/bulk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: selectedPaths })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "mycloud_archive.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setSelectedPaths([]);
      } else {
        alert("Failed to download selected items");
      }
    } catch (e) {
      console.error(e);
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
          <div style={{ position: 'relative', width: '130px', height: '130px', margin: '0 auto 16px auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="130" height="130" viewBox="0 0 130 130" className="donut-chart">
              <circle cx="65" cy="65" r="50" fill="none" stroke="#f1f5f9" strokeWidth="10" />
              
              {/* Images Circle */}
              {stats.images > 0 && (
                <circle 
                  cx="65" 
                  cy="65" 
                  r="50" 
                  fill="none" 
                  stroke="#3a7bd5" 
                  strokeWidth="10" 
                  strokeDasharray={`${((stats.images / (stats.images + stats.videos + stats.music + stats.files || 1)) * 2 * Math.PI * 50)} ${2 * Math.PI * 50}`} 
                  strokeDashoffset={0}
                  transform="rotate(-90 65 65)"
                  style={{ transition: 'stroke-dasharray 0.5s ease', strokeLinecap: 'round' }}
                />
              )}
              
              {/* Videos Circle */}
              {stats.videos > 0 && (
                <circle 
                  cx="65" 
                  cy="65" 
                  r="50" 
                  fill="none" 
                  stroke="#8a2387" 
                  strokeWidth="10" 
                  strokeDasharray={`${((stats.videos / (stats.images + stats.videos + stats.music + stats.files || 1)) * 2 * Math.PI * 50)} ${2 * Math.PI * 50}`} 
                  strokeDashoffset={-((stats.images / (stats.images + stats.videos + stats.music + stats.files || 1)) * 2 * Math.PI * 50)}
                  transform="rotate(-90 65 65)"
                  style={{ transition: 'stroke-dasharray 0.5s ease', strokeLinecap: 'round' }}
                />
              )}
              
              {/* Music Circle */}
              {stats.music > 0 && (
                <circle 
                  cx="65" 
                  cy="65" 
                  r="50" 
                  fill="none" 
                  stroke="#10b981" 
                  strokeWidth="10" 
                  strokeDasharray={`${((stats.music / (stats.images + stats.videos + stats.music + stats.files || 1)) * 2 * Math.PI * 50)} ${2 * Math.PI * 50}`} 
                  strokeDashoffset={-(((stats.images + stats.videos) / (stats.images + stats.videos + stats.music + stats.files || 1)) * 2 * Math.PI * 50)}
                  transform="rotate(-90 65 65)"
                  style={{ transition: 'stroke-dasharray 0.5s ease', strokeLinecap: 'round' }}
                />
              )}
              
              {/* Files Circle */}
              {stats.files > 0 && (
                <circle 
                  cx="65" 
                  cy="65" 
                  r="50" 
                  fill="none" 
                  stroke="#fbbf24" 
                  strokeWidth="10" 
                  strokeDasharray={`${((stats.files / (stats.images + stats.videos + stats.music + stats.files || 1)) * 2 * Math.PI * 50)} ${2 * Math.PI * 50}`} 
                  strokeDashoffset={-(((stats.images + stats.videos + stats.music) / (stats.images + stats.videos + stats.music + stats.files || 1)) * 2 * Math.PI * 50)}
                  transform="rotate(-90 65 65)"
                  style={{ transition: 'stroke-dasharray 0.5s ease', strokeLinecap: 'round' }}
                />
              )}
              
              <text x="65" y="62" textAnchor="middle" style={{ fill: 'var(--text-main)', fontSize: '1rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
                {stats.images + stats.videos + stats.music + stats.files}
              </text>
              <text x="65" y="74" textAnchor="middle" style={{ fill: 'var(--text-muted)', fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Files
              </text>
            </svg>
          </div>
          <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px', textTransform: 'uppercase' }}>
            Storage Distribution
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.62rem', color: '#64748b' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3a7bd5' }}></div> Images</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8a2387' }}></div> Videos</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></div> Music</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fbbf24' }}></div> Files</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header">
          <div className="search-bar-container" style={{ position: 'relative' }}>
            <div className="search-bar">
              <Search size={18} color="#94a3b8" />
              <input 
                type="text" 
                placeholder="Search your drive..." 
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); handleSearch(e.target.value); }}
                onFocus={() => setSearchDropdownVisible(true)}
                onBlur={() => setTimeout(() => setSearchDropdownVisible(false), 200)}
              />
            </div>
            {searchDropdownVisible && searchQuery && (
              <div className="search-results-dropdown glass animate-fade-in">
                {searchResults.length === 0 ? (
                  <div className="search-no-results">No matches found</div>
                ) : (
                  searchResults.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="search-result-item" 
                      onClick={() => {
                        if (item.type === 'Folder') {
                          openFolder(item.path);
                        } else {
                          const parentDir = item.path.substring(0, item.path.lastIndexOf('/')) || '/mnt/Drive1';
                          openFolder(parentDir);
                          setTimeout(() => openPreview(item), 600);
                        }
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                    >
                      <div className="search-result-icon">
                        {item.type === 'Folder' ? <Folder size={16} color="#1abc9c" /> :
                         item.type === 'Image' ? <ImageIcon size={16} color="#3a7bd5" /> :
                         item.type === 'Video' ? <Video size={16} color="#8a2387" /> :
                         item.type === 'Music' ? <Music size={16} color="#10b981" /> :
                         item.type === 'PDF' ? <FileText size={16} color="#ff3838" /> :
                         <FileText size={16} color="#64748b" />}
                      </div>
                      <div className="search-result-info">
                        <span className="search-result-name">{item.name}</span>
                        <span className="search-result-path">{item.path.replace('/mnt/Drive1', 'Drive1')}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
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

        {currentView === 'categoryGallery' ? (
          <div className="category-gallery-view animate-fade-in">
            <div className="gallery-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <button className="btn-back" onClick={() => setCurrentView('dashboard')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'white', fontWeight: 600, color: 'var(--text-main)', cursor: 'pointer', transition: 'all 0.2s' }}>
                <ArrowLeft size={18} />
                Back to Home
              </button>
              <div className="gallery-title-row" style={{ textAlign: 'right' }}>
                <h2 className="gallery-title" style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)' }}>{activeCategory} Library</h2>
                <span className="gallery-count" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>{loadingCategory ? 'Loading...' : `${categoryFiles.length} items`}</span>
              </div>
            </div>
            
            {loadingCategory ? (
              <div className="gallery-loading" style={{ padding: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', color: 'var(--text-muted)' }}>
                <Loader2 size={36} className="spin" color="var(--primary)" />
                <span style={{ fontWeight: 500 }}>Scanning drive for {activeCategory.toLowerCase()}...</span>
              </div>
            ) : categoryFiles.length === 0 ? (
              <div className="empty-state" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 500 }}>No {activeCategory.toLowerCase()} found on your drive.</div>
            ) : activeCategory === 'Images' ? (
              <div className="image-masonry-grid">
                {categoryFiles.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="masonry-item" 
                    onDoubleClick={() => openPreview(item)}
                    title="Double click to preview"
                  >
                    <div className="masonry-thumb-container">
                      <img 
                        src={`/api/files/raw?path=${encodeURIComponent(item.path)}`} 
                        alt={item.name} 
                        className="masonry-img" 
                        loading="lazy"
                      />
                      <div className="masonry-overlay">
                        <span className="masonry-name">{item.name}</span>
                        <span className="masonry-size">{formatSize(item.size)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="files-grid animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
                {categoryFiles.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="fm-item grid-item"
                    onDoubleClick={() => openPreview(item)}
                    style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', cursor: 'pointer', transition: 'all 0.2s' }}
                  >
                    <div className="file-card-icon" style={{ width: '64px', height: '64px', borderRadius: '12px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.type === 'Image' ? <ImageIcon size={32} color="#3a7bd5" /> :
                       item.type === 'Video' ? <Video size={32} color="#8a2387" /> :
                       item.type === 'Music' ? <Music size={32} color="#10b981" /> :
                       item.type === 'PDF' ? <FileText size={32} color="#ff3838" /> :
                       <FileText size={32} color="#64748b" />}
                    </div>
                    <div className="file-card-info" style={{ textAlign: 'center', width: '100%' }}>
                      <span className="file-card-name" title={item.name} style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                      <span className="file-card-size" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatSize(item.size)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : currentView === 'dashboard' ? (
          <>
            <div className="section-header">
              <span>STORAGE OVERVIEW</span>
              <div className="live-stats" onClick={fetchStats}>
                <div className="live-stats-dot"></div>
                REFRESH LIVE STATS
              </div>
            </div>

            <div className="cards-grid animate-fade-in" style={{ marginTop: '16px' }}>
              <div className="card animate-fade-in" onClick={() => openCategory('Images')} style={{ cursor: 'pointer', background: 'var(--card-blue)', animationDelay: '0s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, overflow: 'hidden' }}>
                  <div className="card-icon"><ImageIcon size={20} /></div>
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="card-title" style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Images</div>
                    <div className="card-subtitle" style={{ fontSize: '0.75rem', opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loading ? 'Loading...' : `${stats.images} files`}</div>
                  </div>
                </div>
                <MoreVertical size={18} className="card-options" style={{ marginLeft: 'auto', flexShrink: 0 }} />
              </div>
              
              <div className="card animate-fade-in" onClick={() => openCategory('Videos')} style={{ cursor: 'pointer', background: 'var(--card-purple)', animationDelay: '0.1s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, overflow: 'hidden' }}>
                  <div className="card-icon"><Video size={20} /></div>
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="card-title" style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Videos</div>
                    <div className="card-subtitle" style={{ fontSize: '0.75rem', opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loading ? 'Loading...' : `${stats.videos} files`}</div>
                  </div>
                </div>
                <MoreVertical size={18} className="card-options" style={{ marginLeft: 'auto', flexShrink: 0 }} />
              </div>

              <div className="card animate-fade-in" onClick={() => openCategory('Music')} style={{ cursor: 'pointer', background: 'var(--card-green)', animationDelay: '0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, overflow: 'hidden' }}>
                  <div className="card-icon"><Music size={20} /></div>
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="card-title" style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Music</div>
                    <div className="card-subtitle" style={{ fontSize: '0.75rem', opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loading ? 'Loading...' : `${stats.music} files`}</div>
                  </div>
                </div>
                <MoreVertical size={18} className="card-options" style={{ marginLeft: 'auto', flexShrink: 0 }} />
              </div>

              <div className="card animate-fade-in" onClick={() => openCategory('Files')} style={{ cursor: 'pointer', background: 'var(--card-orange)', animationDelay: '0.3s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, overflow: 'hidden' }}>
                  <div className="card-icon"><FileText size={20} /></div>
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="card-title" style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Files</div>
                    <div className="card-subtitle" style={{ fontSize: '0.75rem', opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loading ? 'Loading...' : `${stats.files} files`}</div>
                  </div>
                </div>
                <MoreVertical size={18} className="card-options" style={{ marginLeft: 'auto', flexShrink: 0 }} />
              </div>

              <div className="card animate-fade-in" onClick={() => openFolder('/mnt/Drive1')} style={{ cursor: 'pointer', background: 'var(--card-teal)', animationDelay: '0.4s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, overflow: 'hidden' }}>
                  <div className="card-icon"><Folder size={20} /></div>
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="card-title" style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Folders</div>
                    <div className="card-subtitle" style={{ fontSize: '0.75rem', opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loading ? 'Loading...' : `${stats.folders} folders`}</div>
                  </div>
                </div>
                <MoreVertical size={18} className="card-options" style={{ marginLeft: 'auto', flexShrink: 0 }} />
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
              <div className="view-mode-toggle" style={{ display: 'flex', alignItems: 'center' }}>
                <button 
                  className={`btn-select-all ${folderContents.length > 0 && folderContents.every(i => selectedPaths.includes(i.path)) ? 'active' : ''}`}
                  onClick={toggleSelectAll}
                  style={{ marginRight: '12px', fontSize: '0.75rem', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'white', fontWeight: 600, color: 'var(--text-main)', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  {folderContents.length > 0 && folderContents.every(i => selectedPaths.includes(i.path)) ? 'Deselect All' : 'Select All'}
                </button>
                <button className={`btn-icon ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
                  <LayoutGrid size={18} />
                </button>
                <button className={`btn-icon ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
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
                        className={`fm-item grid-item ${selectedPaths.includes(item.path) ? 'checked' : ''}`} 
                        onDoubleClick={() => item.type === 'Folder' ? openFolder(item.path) : openPreview(item)}
                      >
                        <div 
                          className={`fm-grid-checkbox ${selectedPaths.includes(item.path) ? 'visible' : ''}`} 
                          onClick={(e) => toggleSelectItem(item.path, e)}
                        >
                          <input 
                            type="checkbox" 
                            checked={selectedPaths.includes(item.path)} 
                            onChange={() => {}} 
                          />
                        </div>
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
                          <th style={{ width: '40px', paddingLeft: '16px' }}>
                            <input 
                              type="checkbox" 
                              checked={folderContents.length > 0 && folderContents.every(i => selectedPaths.includes(i.path))} 
                              onChange={toggleSelectAll} 
                            />
                          </th>
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
                            className={`fm-list-row ${selectedPaths.includes(item.path) ? 'checked' : ''}`}
                            onDoubleClick={() => item.type === 'Folder' ? openFolder(item.path) : openPreview(item)}
                            onClick={() => toggleSelectItem(item.path)}
                          >
                            <td style={{ paddingLeft: '16px', width: '40px' }} onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                checked={selectedPaths.includes(item.path)} 
                                onChange={(e) => toggleSelectItem(item.path, e)} 
                              />
                            </td>
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

      {/* Floating Batch Operations Tray */}
      {selectedPaths.length > 0 && (
        <div className="batch-tray-container animate-slide-up">
          <div className="batch-tray glass">
            <span className="batch-count">{selectedPaths.length} items selected</span>
            
            <div className="batch-actions-row">
              <button className="btn-batch primary" onClick={handleBulkDownload}>
                <Download size={16} />
                Download ZIP
              </button>
              <button className="btn-batch secondary" onClick={handleBulkFavorite}>
                <Star size={16} />
                Star Selected
              </button>
              <button className="btn-batch danger" onClick={handleBulkDelete}>
                <Trash2 size={16} />
                Delete Selected
              </button>
              <div className="batch-divider"></div>
              <button className="btn-icon close-btn" onClick={() => setSelectedPaths([])}>
                <Plus size={20} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

