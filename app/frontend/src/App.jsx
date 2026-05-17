import { useState, useEffect, useRef } from 'react';
import { 
  Home, Folder, Star, Share2, Search, Upload, Plus, 
  Menu, MoreVertical, Image as ImageIcon, Video, Music, FileText, ChevronRight, ChevronLeft, ArrowLeft,
  LayoutGrid, List, Trash2, Edit3, CloudUpload, Check, AlertCircle, Loader2, Download, AlignLeft, X
} from 'lucide-react';
import './App.css';
import Login from './Login';

const ACCENT_THEMES = [
  { id: 'deep-ocean', name: 'Deep Ocean Blue', colors: ['#3a7bd5', '#1e5de6'] },
  { id: 'emerald-pine', name: 'Emerald Pine', colors: ['#059669', '#064e3b'] },
  { id: 'dark-obsidian', name: 'Dark Obsidian', colors: ['#475569', '#020617'] },
  { id: 'solarized-bronze', name: 'Solarized Bronze', colors: ['#d97706', '#78350f'] }
];

// Setup global fetch interceptor for MyCloud session tokens
const originalFetch = window.fetch;
window.fetch = async (url, options = {}) => {
  const token = localStorage.getItem("mycloud_token");
  if (token) {
    options.headers = {
      ...options.headers,
      "Authorization": `Bearer ${token}`
    };
  }
  return originalFetch(url, options);
};

const authUrl = (endpoint, path) => {
  const params = new URLSearchParams({ path });
  const token = localStorage.getItem("mycloud_token");
  if (token) params.set("token", token);
  return `${endpoint}?${params.toString()}`;
};

function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accentTheme, setAccentTheme] = useState(() => localStorage.getItem('mycloud_accent_theme') || 'deep-ocean');

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
  const [isCanvasDragging, setIsCanvasDragging] = useState(false);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Advanced States: Search, Category Gallery, Bulk Selections
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchDropdownVisible, setSearchDropdownVisible] = useState(false);
  
  const [activeCategory, setActiveCategory] = useState(null);
  const [categoryFiles, setCategoryFiles] = useState([]);
  const [loadingCategory, setLoadingCategory] = useState(false);
  
  const [selectedPaths, setSelectedPaths] = useState([]);
  const [mobileActiveItem, setMobileActiveItem] = useState(null);
  const [sortBy, setSortBy] = useState('name');
  const [typeFilter, setTypeFilter] = useState('All');
  const [toolsData, setToolsData] = useState({ trash: [], users: [], activity: [], index: null });
  const [operationTarget, setOperationTarget] = useState('');

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
    const checkAuth = async () => {
      const token = localStorage.getItem("mycloud_token");
      if (token) {
        try {
          const res = await fetch('/api/auth/me');
          if (res.ok) {
            const userData = await res.json();
            setUser(userData);
            fetchStats();
          } else {
            localStorage.removeItem("mycloud_token");
            setUser(null);
          }
        } catch (error) {
          console.error("Auth validation failed:", error);
          localStorage.removeItem("mycloud_token");
          setUser(null);
        }
      }
      setAuthChecked(true);
    };
    
    checkAuth();
  }, []);

  const handleLoginSuccess = (loginData) => {
    localStorage.setItem("mycloud_token", loginData.token);
    setUser({
      username: loginData.username,
      role: loginData.role,
      display_name: loginData.display_name
    });
    fetchStats();
  };

  useEffect(() => {
    document.documentElement.dataset.accentTheme = accentTheme;
    localStorage.setItem('mycloud_accent_theme', accentTheme);
  }, [accentTheme]);

  const handleLogout = () => {
    localStorage.removeItem("mycloud_token");
    setUser(null);
    setActiveModal(null);
    setCurrentView('dashboard');
  };

  const toggleFavorite = async (item) => {
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

  const collectDroppedFiles = async (dataTransfer) => {
    const entries = Array.from(dataTransfer.items || [])
      .map(item => item.webkitGetAsEntry?.())
      .filter(Boolean);

    if (entries.length === 0) return Array.from(dataTransfer.files || []);

    const readDirectory = (reader) => new Promise((resolve) => reader.readEntries(resolve));

    const walkEntry = async (entry, prefix = '') => {
      if (entry.isFile) {
        return new Promise((resolve) => {
          entry.file((file) => {
            file.relativePath = `${prefix}${file.name}`;
            resolve([file]);
          });
        });
      }

      if (entry.isDirectory) {
        const reader = entry.createReader();
        const children = [];
        let batch = [];
        do {
          batch = await readDirectory(reader);
          children.push(...batch);
        } while (batch.length > 0);

        const nested = await Promise.all(children.map(child => walkEntry(child, `${prefix}${entry.name}/`)));
        return nested.flat();
      }

      return [];
    };

    const files = await Promise.all(entries.map(entry => walkEntry(entry)));
    return files.flat();
  };

  const handleUploadFiles = async (files) => {
    const fileList = Array.from(files || []);
    if (fileList.length === 0) return;
    setActiveModal('uploadCenter');
    
    const newItems = fileList.map((f, idx) => {
      const relativePath = f.webkitRelativePath || f.relativePath || f.name;
      return {
        id: Date.now() + '-' + idx,
        name: relativePath,
        size: f.size,
        progress: 0,
        status: 'pending',
        file: f,
        relativePath
      };
    });
    
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
      formData.append('relative_path', queueItem.relativePath || queueItem.file.name);
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
          let message = 'Upload failed';
          try {
            message = JSON.parse(xhr.responseText)?.detail || message;
          } catch {
            message = xhr.responseText || message;
          }
          setUploadQueue(prev => prev.map(item => 
            item.id === queueItem.id ? { ...item, status: 'error', error: message } : item
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
      const token = localStorage.getItem("mycloud_token");
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
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

  const handleItemContextMenu = (e, item) => {
    e.preventDefault();
    setMobileActiveItem(item);
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
        fetchStats();
        openFolder(currentPath);
      } else {
        alert("Failed to star selected items");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Move ${selectedPaths.length} selected item${selectedPaths.length === 1 ? '' : 's'} to Trash? You can restore them later from Trash.`)) {
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

  const loadToolsData = async () => {
    const requests = [
      fetch('/api/trash').then(r => r.ok ? r.json() : { trash: [] }),
      fetch('/api/activity').then(r => r.ok ? r.json() : { activity: [] }),
      fetch('/api/index/status').then(r => r.ok ? r.json() : null)
    ];
    if (user?.role === 'admin') {
      requests.push(fetch('/api/admin/users').then(r => r.ok ? r.json() : { users: [] }));
    }
    const [trash, activity, index, users] = await Promise.all(requests);
    setToolsData({ trash: trash.trash || [], activity: activity.activity || [], index, users: users?.users || [] });
  };

  const openTools = async () => {
    setActiveModal('tools');
    await loadToolsData();
  };

  const restoreTrashItem = async (id) => {
    const res = await fetch(`/api/trash/${id}/restore`, { method: 'POST' });
    if (!res.ok) alert('Failed to restore item');
    await loadTrashView();
    await loadToolsData();
    fetchStats();
  };

  const permanentlyDeleteTrashItem = async (id) => {
    if (!window.confirm('Permanently delete this item? This cannot be undone.')) return;
    const res = await fetch(`/api/trash/${id}`, { method: 'DELETE' });
    if (!res.ok) alert('Failed to permanently delete item');
    await loadTrashView();
    await loadToolsData();
  };

  const loadTrashView = async () => {
    const res = await fetch('/api/trash');
    const data = res.ok ? await res.json() : { trash: [] };
    setToolsData(prev => ({ ...prev, trash: data.trash || [] }));
  };

  const openTrashView = async () => {
    setCurrentView('trash');
    setMobileMenuOpen(false);
    await loadTrashView();
  };

  const runReindex = async () => {
    const res = await fetch('/api/index/reindex', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) alert(data.detail || 'Re-index failed');
    await loadToolsData();
    fetchStats();
  };

  const shareItem = async (item) => {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: item.path, expires_hours: 24 })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.detail || 'Failed to create share link');
    const url = `${window.location.origin}${data.url}`;
    await navigator.clipboard?.writeText(url);
    alert(`Share link copied:
${url}`);
  };

  const operateOnSelected = async (mode) => {
    if (!operationTarget.trim() || selectedPaths.length === 0) return alert('Select items and enter a target folder');
    for (const path of selectedPaths) {
      await fetch(`/api/files/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: path, target_dir: operationTarget.trim() })
      });
    }
    setSelectedPaths([]);
    setOperationTarget('');
    openFolder(currentPath);
    fetchStats();
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!authChecked) {
    return (
      <div className="login-screen" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'radial-gradient(circle at 10% 20%, rgba(26, 32, 44, 1) 0%, rgba(13, 17, 23, 1) 90%)', color: 'white' }}>
        <Loader2 className="animate-spin" size={48} color="#3a7bd5" />
        <p style={{ marginTop: '16px', color: '#94a3b8', fontSize: '0.9rem', letterSpacing: '0.05em' }}>Securing MyCloud session...</p>
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const favoriteFolders = favorites.filter(f => f.type === 'Folder');
  const visibleFolderContents = folderContents
    .filter(item => typeFilter === 'All' || item.type === typeFilter)
    .sort((a, b) => {
      if (a.type === 'Folder' && b.type !== 'Folder') return -1;
      if (a.type !== 'Folder' && b.type === 'Folder') return 1;
      if (sortBy === 'size') return (b.size || 0) - (a.size || 0);
      if (sortBy === 'modified') return (b.modified || 0) - (a.modified || 0);
      if (sortBy === 'type') return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });

  return (
    <div className={`dashboard ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileMenuOpen ? 'mobile-sidebar-open' : ''}`}>
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="logo">
          <img src="/logo.png" alt="MyCloud Logo" style={{ width: '32px', height: '32px', minWidth: '32px', objectFit: 'contain' }} />
          {!sidebarCollapsed && <span className="logo-text animate-fade-in">MyCloud</span>}
          
          {/* Close button inside sidebar on mobile */}
          <button className="mobile-sidebar-close" onClick={() => setMobileMenuOpen(false)}>
            <X size={18} />
          </button>

          {/* Desktop collapse button */}
          <button className="sidebar-collapse-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="nav-menu">
          <div 
            className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`} 
            onClick={() => { setCurrentView('dashboard'); setMobileMenuOpen(false); }}
            title="Home"
          >
            <Home size={20} style={{ minWidth: '20px' }} />
            {!sidebarCollapsed && <span className="nav-text">Home</span>}
          </div>
          <div 
            className={`nav-item ${currentView === 'fileManager' ? 'active' : ''}`} 
            onClick={() => { openFolder('/mnt/Drive1'); setMobileMenuOpen(false); }}
            title="All Files"
          >
            <Folder size={20} style={{ minWidth: '20px' }} />
            {!sidebarCollapsed && <span className="nav-text">All Files</span>}
          </div>
          <div className="nav-item" title="Favorites">
            <Star size={20} style={{ minWidth: '20px' }} />
            {!sidebarCollapsed && <span className="nav-text">Favorites</span>}
          </div>
          <div className="nav-item" title="Shared">
            <Share2 size={20} style={{ minWidth: '20px' }} />
            {!sidebarCollapsed && <span className="nav-text">Shared</span>}
          </div>
          <div 
            className={`nav-item ${currentView === 'trash' ? 'active' : ''}`}
            onClick={openTrashView}
            title="Trash"
          >
            <Trash2 size={20} style={{ minWidth: '20px' }} />
            {!sidebarCollapsed && <span className="nav-text">Trash</span>}
          </div>
        </nav>

        {!sidebarCollapsed && (
          <div className="storage-widget animate-scale-up">
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
                    stroke="var(--chart-images)" 
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
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--chart-images)' }}></div> Images</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8a2387' }}></div> Videos</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></div> Music</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fbbf24' }}></div> Files</span>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header">
          {/* Mobile hamburger menu trigger */}
          <button className="mobile-menu-trigger" onClick={() => setMobileMenuOpen(true)}>
            <AlignLeft size={22} />
          </button>

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
              <input
                type="file"
                multiple
                ref={folderInputRef}
                style={{ display: 'none' }}
                webkitdirectory=""
                directory=""
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
            
            <div className="user-profile" style={{ position: 'relative' }}>
              <div className="user-info">
                <span className="user-name">{user.display_name}</span>
                <span className="user-role" style={{ textTransform: 'uppercase' }}>{user.role}</span>
              </div>
              <div className="avatar" onClick={() => setActiveModal(activeModal === 'profileDropdown' ? null : 'profileDropdown')} style={{ cursor: 'pointer', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'white' }}>
                  {user.display_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                </span>
              </div>
              <Menu size={20} color="#64748b" style={{ cursor: 'pointer' }} onClick={() => setActiveModal(activeModal === 'profileDropdown' ? null : 'profileDropdown')} />
              
              {activeModal === 'profileDropdown' && (
                <div className="profile-dropdown-menu glass animate-scale-up" style={{ position: 'absolute', top: '110%', right: 0, width: '260px', padding: '8px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(255, 255, 255, 0.3)', backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(31, 38, 135, 0.15)', zIndex: 100 }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(0, 0, 0, 0.05)', marginBottom: '6px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#1e293b' }}>{user.display_name}</div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'capitalize', marginTop: '2px' }}>Role: {user.role}</div>
                  </div>
                  <div className="accent-theme-picker">
                    <div className="accent-theme-label">Accent Theme</div>
                    <div className="accent-theme-grid">
                      {ACCENT_THEMES.map((theme) => (
                        <button
                          key={theme.id}
                          type="button"
                          className={`accent-theme-option ${accentTheme === theme.id ? 'active' : ''}`}
                          onClick={() => setAccentTheme(theme.id)}
                          title={theme.name}
                        >
                          <span className="accent-theme-swatch" style={{ background: `linear-gradient(135deg, ${theme.colors[0]}, ${theme.colors[1]})` }} />
                          <span>{theme.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={openTools}
                    className="dropdown-tools-btn"
                    style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}
                  >
                    Tools & Admin
                  </button>
                  <button 
                    onClick={handleLogout}
                    style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                    className="dropdown-logout-btn"
                  >
                    Logout
                  </button>
                </div>
              )}
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
                        src={authUrl('/api/files/raw', item.path)} 
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
            <div className="section-header mobile-storage-header">
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

        <div className="section-header mobile-favorites-header" style={{ marginTop: '20px' }}>
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

        <div className="section-header mobile-recent-header">
          <span>RECENT ACTIVITY</span>
        </div>
        
        <div className="recent-activity-container mode-list">
          {/* List/Table Format */}
          <div className="recent-list-view">
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
                  recent.map((item, index) => {
                    return (
                      <tr key={index} className="recent-row">
                        <td>
                          <div className="name-cell" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {item.type === 'Folder' ? (
                              <Folder size={18} color="#3a7bd5" style={{ flexShrink: 0 }} />
                            ) : item.type === 'Image' ? (
                              <ImageIcon size={18} color="#9b59b6" style={{ flexShrink: 0 }} />
                            ) : item.type === 'Video' ? (
                              <Video size={18} color="#e74c3c" style={{ flexShrink: 0 }} />
                            ) : item.type === 'Music' ? (
                              <Music size={18} color="#2ecc71" style={{ flexShrink: 0 }} />
                            ) : (
                              <FileText size={18} color="#94a3b8" style={{ flexShrink: 0 }} />
                            )}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                          </div>
                        </td>
                        <td>{item.type}</td>
                        <td>{formatSize(item.size)}</td>
                        <td>{new Date(item.modified).toLocaleDateString()}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr><td colSpan="4" className="empty-state">No items found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tile/Grid Format */}
          <div className="recent-grid-view animate-fade-in">
            {loading ? (
              <div className="empty-state">Loading...</div>
            ) : recent.length > 0 ? (
              <div className="recent-grid">
                {recent.map((item, index) => (
                  <div key={index} className="recent-grid-card">
                    <div className="recent-card-icon-wrapper">
                      {item.type === 'Folder' ? (
                        <Folder size={24} color="#3a7bd5" />
                      ) : item.type === 'Image' ? (
                        <ImageIcon size={24} color="#9b59b6" />
                      ) : item.type === 'Video' ? (
                        <Video size={24} color="#e74c3c" />
                      ) : item.type === 'Music' ? (
                        <Music size={24} color="#2ecc71" />
                      ) : (
                        <FileText size={24} color="#94a3b8" />
                      )}
                    </div>
                    <div className="recent-card-details">
                      <span className="recent-card-name" title={item.name}>{item.name}</span>
                      <span className="recent-card-meta">{item.type} • {formatSize(item.size)}</span>
                      <span className="recent-card-date">{new Date(item.modified).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">No items found</div>
            )}
          </div>
        </div>
          </>
        ) : currentView === 'trash' ? (
          <div className="trash-view animate-fade-in">
            <div className="section-header mobile-recent-header">
              <span>TRASH</span>
              <button className="btn-modal-secondary" onClick={loadTrashView}>Refresh</button>
            </div>
            <div className="trash-list">
              {toolsData.trash.length === 0 ? (
                <div className="empty-state">Trash is empty</div>
              ) : toolsData.trash.map(item => (
                <div className="trash-row" key={item.id}>
                  <div className="trash-info">
                    {item.type === 'Folder' ? <Folder size={22} color="var(--primary)" /> : <FileText size={22} color="#94a3b8" />}
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.type} • Deleted {new Date(item.deleted_at).toLocaleString()}</span>
                      <small>{item.original_path}</small>
                    </div>
                  </div>
                  <div className="trash-actions">
                    <button className="btn-modal-primary" onClick={() => restoreTrashItem(item.id)}>Restore</button>
                    <button className="btn-modal-secondary" onClick={() => permanentlyDeleteTrashItem(item.id)}>Delete Forever</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            className={`file-manager-view animate-fade-in ${isCanvasDragging ? 'canvas-dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsCanvasDragging(true); }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsCanvasDragging(true); }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setIsCanvasDragging(false);
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsCanvasDragging(false);
              handleUploadFiles(await collectDroppedFiles(e.dataTransfer));
            }}
          >
            {isCanvasDragging && (
              <div className="canvas-drop-overlay">
                <CloudUpload size={34} />
                <span>Drop files or folders to upload here</span>
              </div>
            )}
            <div className={`fm-command-band ${selectedPaths.length > 0 ? 'selection-active' : ''}`}>
              <div className="fm-command-path">
                <button className="btn-icon" onClick={selectedPaths.length > 0 ? () => setSelectedPaths([]) : navigateUp} title={selectedPaths.length > 0 ? 'Clear selection' : 'Back'}>
                  {selectedPaths.length > 0 ? <Plus size={20} style={{ transform: 'rotate(45deg)' }} /> : <ArrowLeft size={20} />}
                </button>
                {selectedPaths.length > 0 ? (
                  <strong>{selectedPaths.length} selected</strong>
                ) : (
                  <div className="path-text">
                    {currentPath.split('/').filter(Boolean).map((part, idx, arr) => (
                      <span key={idx} className="breadcrumb-part">
                        {part}
                        {idx < arr.length - 1 && <ChevronRight size={16} />}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {selectedPaths.length > 0 ? (
                <div className="fm-command-actions selection-actions">
                  <button className="fm-command-btn primary" onClick={handleBulkDownload} title="Download selected as ZIP">
                    <Download size={16} />
                    <span>Download</span>
                  </button>
                  <button className="fm-command-btn" onClick={handleBulkFavorite} title="Star selected">
                    <Star size={16} />
                    <span>Star</span>
                  </button>
                  <input className="batch-target-input" value={operationTarget} onChange={(e) => setOperationTarget(e.target.value)} placeholder="Target folder path" />
                  <button className="fm-command-btn" onClick={() => operateOnSelected('copy')}>Copy</button>
                  <button className="fm-command-btn" onClick={() => operateOnSelected('move')}>Move</button>
                  <button className="fm-command-btn danger" onClick={handleBulkDelete} title="Move selected to Trash">
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </button>
                </div>
              ) : (
                <div className="fm-command-actions">
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="name">Sort: Name</option>
                    <option value="modified">Sort: Modified</option>
                    <option value="size">Sort: Size</option>
                    <option value="type">Sort: Type</option>
                  </select>
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                    <option value="All">All types</option>
                    <option value="Folder">Folders</option>
                    <option value="Image">Images</option>
                    <option value="Video">Videos</option>
                    <option value="Music">Music</option>
                    <option value="PDF">PDFs</option>
                    <option value="Text">Text</option>
                    <option value="File">Files</option>
                  </select>
                  <button className="fm-command-btn" onClick={() => setActiveModal('newFolder')} title="New Folder">
                    <Folder size={16} />
                    <span>Folder</span>
                  </button>
                  <button className="fm-command-btn" onClick={() => setActiveModal('uploadCenter')} title="Upload Files">
                    <CloudUpload size={16} />
                    <span>Upload</span>
                  </button>
                  <button
                    className={`fm-command-btn ${folderContents.length > 0 && folderContents.every(i => selectedPaths.includes(i.path)) ? 'active' : ''}`}
                    onClick={toggleSelectAll}
                  >
                    Select All
                  </button>
                  <div className="view-mode-toggle">
                    <button className={`btn-icon ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="Grid view">
                      <LayoutGrid size={18} />
                    </button>
                    <button className={`btn-icon ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="List view">
                      <List size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            {loadingFolder ? (
              <div className="loading-state">Loading folder contents...</div>
            ) : (
              <>
                {viewMode === 'grid' ? (
                  <div className="fm-grid">
                    {visibleFolderContents.map((item, idx) => (
                      <div 
                        key={idx} 
                        className={`fm-item grid-item ${selectedPaths.includes(item.path) ? 'checked' : ''}`} 
                        onDoubleClick={() => item.type === 'Folder' ? openFolder(item.path) : openPreview(item)}
                        onContextMenu={(e) => handleItemContextMenu(e, item, false)}
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
                        <button 
                          className="mobile-item-options-btn"
                          onClick={(e) => { e.stopPropagation(); setMobileActiveItem(item); }}
                        >
                          <MoreVertical size={14} />
                        </button>
                        
                        {item.type === 'Image' ? (
                          <div className="fm-thumbnail-container">
                            <img src={authUrl('/api/thumbnail', item.path)} alt={item.name} className="fm-thumbnail" loading="lazy" />
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
                        {visibleFolderContents.map((item, idx) => (
                          <tr 
                            key={idx} 
                            className={`fm-list-row ${selectedPaths.includes(item.path) ? 'checked' : ''}`}
                            onDoubleClick={() => item.type === 'Folder' ? openFolder(item.path) : openPreview(item)}
                            onClick={() => toggleSelectItem(item.path)}
                            onContextMenu={(e) => handleItemContextMenu(e, item, false)}
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
                                    <img src={authUrl('/api/thumbnail', item.path)} alt={item.name} className="fm-list-thumbnail" loading="lazy" />
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
                                <div className="fm-list-actions-desktop">
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
                                <button 
                                  className="mobile-item-options-btn"
                                  onClick={(e) => { e.stopPropagation(); setMobileActiveItem(item); }}
                                >
                                  <MoreVertical size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {visibleFolderContents.length === 0 && (
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
            <h3 className="modal-title">Move to Trash</h3>
            <p className="modal-text">Move the {selectedItem.type.toLowerCase()} <strong>{selectedItem.name}</strong> to Trash? You can restore it later from the Trash view.</p>
            <div className="modal-footer">
              <button type="button" className="btn-modal-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
              <button type="button" className="btn-modal-danger" onClick={handleDeleteSubmit}>Move to Trash</button>
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
                  href={authUrl('/api/files/raw', previewItem.path)} 
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
                  <img src={authUrl('/api/files/raw', previewItem.path)} alt={previewItem.name} className="preview-image" />
                </div>
              ) : previewItem.type === 'PDF' ? (
                <iframe 
                  src={authUrl('/api/files/raw', previewItem.path)} 
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
                  <video src={authUrl('/api/files/raw', previewItem.path)} controls className="preview-video" autoPlay />
                </div>
              ) : previewItem.type === 'Music' ? (
                <div className="preview-media-container music">
                  <div className="music-preview-card">
                    <Music size={64} color="var(--primary)" />
                    <span className="music-filename">{previewItem.name}</span>
                    <audio src={authUrl('/api/files/raw', previewItem.path)} controls autoPlay />
                  </div>
                </div>
              ) : (
                <div className="preview-unsupported">
                  <FileText size={64} color="var(--text-muted)" />
                  <p>Previews are not supported for this file type.</p>
                  <a 
                    href={authUrl('/api/files/raw', previewItem.path)} 
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
              onDrop={async (e) => { e.preventDefault(); setIsDragging(false); handleUploadFiles(await collectDroppedFiles(e.dataTransfer)); }}
            >
              <CloudUpload size={48} className="dropzone-icon" />
              <p className="dropzone-text">Drag & drop files or folders here</p>
              <p className="dropzone-sub">Folder structure is preserved when supported by your browser</p>
              <div className="upload-choice-row">
                <button type="button" className="btn-modal-primary" onClick={() => fileInputRef.current.click()}>Choose Files</button>
                <button type="button" className="btn-modal-secondary" onClick={() => folderInputRef.current.click()}>Choose Folder</button>
              </div>
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


      {activeModal === 'tools' && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="modal-content glass tools-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Tools & Admin</h3>
            <div className="tools-grid">
              <section>
                <h4>Trash</h4>
                {toolsData.trash.slice(0, 6).map(item => (
                  <div className="tool-row" key={item.id}>
                    <span>{item.name}</span>
                    <button onClick={() => restoreTrashItem(item.id)}>Restore</button>
                  </div>
                ))}
                {toolsData.trash.length === 0 && <p>No trash items</p>}
              </section>
              <section>
                <h4>Index</h4>
                <p>DB modified: {toolsData.index?.database_modified ? new Date(toolsData.index.database_modified * 1000).toLocaleString() : 'Unknown'}</p>
                {user.role === 'admin' && <button className="btn-modal-primary" onClick={runReindex}>Re-index Now</button>}
              </section>
              {user.role === 'admin' && (
                <section>
                  <h4>Users</h4>
                  {toolsData.users.map(u => <div className="tool-row" key={u.username}><span>{u.display_name}</span><small>{u.role}</small></div>)}
                </section>
              )}
              <section>
                <h4>Activity</h4>
                {toolsData.activity.slice(0, 8).map((a, idx) => <div className="tool-row" key={idx}><span>{a.action}</span><small>{a.actor}</small></div>)}
              </section>
            </div>
            <div className="modal-footer"><button className="btn-modal-secondary" onClick={() => setActiveModal(null)}>Close</button></div>
          </div>
        </div>
      )}

      {/* Modern Blurred Mobile Options Bottom Sheet */}
      {mobileActiveItem && (
        <>
          <div className="mobile-sheet-backdrop" onClick={() => setMobileActiveItem(null)} />
          <div className="mobile-bottom-sheet glass">
            <div className="mobile-sheet-header">
              <div className="mobile-sheet-icon-wrapper">
                {mobileActiveItem.type === 'Folder' ? <Folder size={20} color="#3a7bd5" /> :
                 mobileActiveItem.type === 'Image' ? <ImageIcon size={20} color="#3a7bd5" /> :
                 mobileActiveItem.type === 'Video' ? <Video size={20} color="#8a2387" /> :
                 mobileActiveItem.type === 'Music' ? <Music size={20} color="#10b981" /> :
                 <FileText size={20} color="#94a3b8" />}
              </div>
              <div className="mobile-sheet-title-info">
                <span className="mobile-sheet-name">{mobileActiveItem.name}</span>
                <span className="mobile-sheet-meta">{mobileActiveItem.type === 'Folder' ? 'Folder' : formatSize(mobileActiveItem.size)}</span>
              </div>
            </div>
            
            <div className="mobile-sheet-actions">
              <button 
                className="mobile-sheet-action-btn"
                onClick={() => {
                  toggleFavorite(mobileActiveItem, false);
                  setMobileActiveItem(null);
                }}
              >
                <Star size={16} className={mobileActiveItem.is_favorite ? 'active' : ''} style={{ color: mobileActiveItem.is_favorite ? '#fbbf24' : '#64748b' }} />
                <span>{mobileActiveItem.is_favorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
              </button>
              
              <button 
                className="mobile-sheet-action-btn"
                onClick={() => {
                  handleRenameClick(mobileActiveItem);
                  setMobileActiveItem(null);
                }}
              >
                <Edit3 size={16} color="#64748b" />
                <span>Rename</span>
              </button>

              {mobileActiveItem.type !== 'Folder' && (
                <a 
                  className="mobile-sheet-action-btn"
                  href={authUrl('/api/files/raw', mobileActiveItem.path)}
                  onClick={() => setMobileActiveItem(null)}
                >
                  <Download size={16} color="#64748b" />
                  <span>Download File</span>
                </a>
              )}
              
              {mobileActiveItem.type !== 'Folder' && (
                <button className="mobile-sheet-action-btn" onClick={() => { shareItem(mobileActiveItem); setMobileActiveItem(null); }}>
                  <Share2 size={16} color="#64748b" />
                  <span>Share Link</span>
                </button>
              )}

              <button 
                className="mobile-sheet-action-btn danger"
                onClick={() => {
                  handleDeleteClick(mobileActiveItem);
                  setMobileActiveItem(null);
                }}
              >
                <Trash2 size={16} color="#ef4444" />
                <span>Delete</span>
              </button>
            </div>

            <button 
              className="mobile-sheet-cancel-btn"
              onClick={() => setMobileActiveItem(null)}
            >
              Cancel
            </button>
          </div>
        </>
      )}

    </div>
  );
}

export default App;
