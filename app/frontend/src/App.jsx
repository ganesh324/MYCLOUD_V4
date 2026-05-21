import { useState, useEffect, useRef } from 'react';
import { 
  Home, Folder, Star, Share2, Search, Upload, Plus, 
  Menu, MoreVertical, Image as ImageIcon, Video, Music, FileText, ChevronRight, ChevronLeft, ArrowLeft,
  LayoutGrid, List, Trash2, Edit3, CloudUpload, Check, Loader2, Download, AlignLeft, X, MoveRight, Copy, Clipboard, Scissors
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

const hasMyCloudDragPayload = (dataTransfer) => Array.from(dataTransfer?.types || []).includes('application/x-mycloud-paths');

function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accentTheme, setAccentTheme] = useState(() => localStorage.getItem('mycloud_accent_theme') || 'deep-ocean');
  const [appConfig, setAppConfig] = useState({ storage_root: '/mnt/Drive1', storage_label: 'Drive1', login_profiles: [] });

  const [stats, setStats] = useState({
    images: 0, videos: 0, music: 0, files: 0, folders: 0, total_size: 0
  });
  const [recent, setRecent] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [dashboardHealth, setDashboardHealth] = useState({ health: null, index: null });
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [currentPath, setCurrentPath] = useState('/mnt/Drive1');
  const [folderContents, setFolderContents] = useState([]);
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [activeModal, setActiveModal] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [renameInput, setRenameInput] = useState('');
  const [moveTarget, setMoveTarget] = useState('');
  const [fileClipboard, setFileClipboard] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [dragOverPath, setDragOverPath] = useState(null);
  
  // Preview States
  const [previewItem, setPreviewItem] = useState(null);
  const [previewTextContent, setPreviewTextContent] = useState('');
  const [loadingPreviewText, setLoadingPreviewText] = useState(false);

  // Folder & Upload States
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadQueue, setUploadQueue] = useState([]);
  const [isCanvasDragging, setIsCanvasDragging] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const currentPathRef = useRef(currentPath);

  // Advanced States: Search, Category Gallery, Bulk Selections
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchDropdownVisible, setSearchDropdownVisible] = useState(false);
  
  const [activeCategory, setActiveCategory] = useState(null);
  const [categoryFiles, setCategoryFiles] = useState([]);
  const [loadingCategory, setLoadingCategory] = useState(false);
  
  const [selectedPaths, setSelectedPaths] = useState([]);
  const [inspectorItem, setInspectorItem] = useState(null);
  const [mobileActiveItem, setMobileActiveItem] = useState(null);
  const [sortBy, setSortBy] = useState('name');
  const [typeFilter, setTypeFilter] = useState('All');
  const [toolsData, setToolsData] = useState({ trash: [], users: [], activity: [], index: null });
  const [operationTarget, setOperationTarget] = useState('');

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  const openFolder = async (path) => {
    setCurrentView('fileManager');
    setCurrentPath(path);
    setInspectorItem(null);
    setSelectedPaths([]);
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
      const [statsRes, recentRes, favRes, healthRes, indexRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/recent'),
        fetch('/api/favorites'),
        fetch('/api/health'),
        fetch('/api/index/status')
      ]);
      const statsData = await statsRes.json();
      const recentData = await recentRes.json();
      const favData = await favRes.json();
      const healthData = healthRes.ok ? await healthRes.json() : null;
      const indexData = indexRes.ok ? await indexRes.json() : null;
      
      setStats(statsData);
      setRecent(recentData.recent || []);
      setFavorites(favData.favorites || []);
      setDashboardHealth({ health: healthData, index: indexData });
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/config/public');
        if (res.ok) {
          const data = await res.json();
          setAppConfig({
            storage_root: data.storage_root || '/mnt/Drive1',
            storage_label: data.storage_label || 'Drive1',
            login_profiles: data.login_profiles || []
          });
          setCurrentPath((previousPath) => previousPath === '/mnt/Drive1' && data.storage_root ? data.storage_root : previousPath);
        }
      } catch (error) {
        console.error('Failed to load app config:', error);
      }
    };
    loadConfig();
  }, []);

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

  const handleMoveClick = (item) => {
    setSelectedItem(item);
    setMoveTarget('');
    setActiveModal('move');
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

  const handleMoveSubmit = async (e) => {
    e.preventDefault();
    if (!moveTarget.trim() || !selectedItem) return;
    try {
      const res = await fetch('/api/files/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: selectedItem.path, target_dir: moveTarget.trim() })
      });
      if (res.ok) {
        setActiveModal(null);
        setMoveTarget('');
        openFolder(currentPath);
        fetchStats();
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to move");
      }
    } catch (error) {
      console.error("Error moving:", error);
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
        let batch;
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
    setUploadMenuOpen(false);
    
    const targetPath = currentPath;
    const newItems = fileList.map((f, idx) => {
      const relativePath = f.webkitRelativePath || f.relativePath || f.name;
      return {
        id: Date.now() + '-' + idx,
        name: relativePath,
        size: f.size,
        progress: 0,
        status: 'pending',
        file: f,
        relativePath,
        targetPath
      };
    });
    
    setUploadQueue(prev => [...prev, ...newItems]);
    
    for (const item of newItems) {
      await uploadSingleFile(item);
    }
    
    if (currentPathRef.current === targetPath) {
      openFolder(targetPath);
    }
    fetchStats();
  };

  const uploadSingleFile = (queueItem) => {
    return new Promise((resolve) => {
      const formData = new FormData();
      formData.append('path', queueItem.targetPath || currentPath);
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

  const openFilePicker = () => {
    setUploadMenuOpen(false);
    fileInputRef.current?.click();
  };

  const openFolderPicker = () => {
    setUploadMenuOpen(false);
    folderInputRef.current?.click();
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

  const openItemMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setInspectorItem(item);
    if (window.matchMedia('(max-width: 768px)').matches) {
      setMobileActiveItem(item);
      return;
    }
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  const handleItemContextMenu = (e, item) => {
    openItemMenu(e, item);
  };

  const handleItemClick = (e, item) => {
    setInspectorItem(item);
    closeContextMenu();
    if (e.ctrlKey || e.metaKey) {
      setSelectedPaths(prev => prev.includes(item.path) ? prev.filter(path => path !== item.path) : [...prev, item.path]);
      return;
    }
    setSelectedPaths([item.path]);
  };

  const handleFolderContextMenu = (e) => {
    if (e.target.closest('.fm-item, .fm-list-row, button, input, select, a')) return;
    e.preventDefault();
    setInspectorItem(null);
    setContextMenu({ x: e.clientX, y: e.clientY, item: null });
  };

  const closeContextMenu = () => setContextMenu(null);

  const getClipboardSourcePaths = (item) => {
    if (item && selectedPaths.includes(item.path)) return selectedPaths;
    return item ? [item.path] : selectedPaths;
  };

  const beginClipboardOperation = (mode, item) => {
    const paths = getClipboardSourcePaths(item);
    if (paths.length === 0) return;
    setFileClipboard({ mode, paths });
    closeContextMenu();
  };

  const pasteClipboard = async (targetDir = currentPath) => {
    if (!fileClipboard?.paths?.length) return;
    const endpointMode = fileClipboard.mode === 'cut' ? 'move' : 'copy';
    for (const path of fileClipboard.paths) {
      const res = await fetch('/api/files/' + endpointMode, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: path, target_dir: targetDir })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || ('Failed to ' + endpointMode + ' item'));
        break;
      }
    }
    if (fileClipboard.mode === 'cut') setFileClipboard(null);
    setSelectedPaths([]);
    closeContextMenu();
    openFolder(currentPath);
    fetchStats();
  };

  const getDragPaths = (item) => selectedPaths.includes(item.path) ? selectedPaths : [item.path];

  const handleItemDragStart = (e, item) => {
    setIsCanvasDragging(false);
    const paths = getDragPaths(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-mycloud-paths', JSON.stringify(paths));
    e.dataTransfer.setData('text/plain', paths.join('\n'));
  };

  const handleFolderDragOver = (e, item) => {
    if (item.type !== 'Folder' || !hasMyCloudDragPayload(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPath(item.path);
  };

  const handleFolderDrop = async (e, item) => {
    if (item.type !== 'Folder') return;
    const rawPaths = e.dataTransfer.getData('application/x-mycloud-paths');
    if (!rawPaths) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);
    setIsCanvasDragging(false);
    const paths = JSON.parse(rawPaths).filter(path => path !== item.path);
    for (const path of paths) {
      const res = await fetch('/api/files/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: path, target_dir: item.path })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Failed to move item');
        break;
      }
    }
    setSelectedPaths([]);
    openFolder(currentPath);
    fetchStats();
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

  const getParentPath = (path) => {
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 1) return path;
    return '/' + parts.slice(0, -1).join('/');
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (value) => {
    if (!value) return 'Unknown';
    return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };


  const pathParts = currentPath.split('/').filter(Boolean);
  const navigatorItems = pathParts.map((part, idx) => ({
    name: part,
    path: '/' + pathParts.slice(0, idx + 1).join('/')
  }));
  const childFolders = folderContents.filter(item => item.type === 'Folder');
  const moveDestinationOptions = [
    ...(currentPath !== appConfig.storage_root ? [{ name: 'Parent folder', path: getParentPath(currentPath) }] : []),
    ...childFolders
      .filter(folder => folder.path !== selectedItem?.path)
      .map(folder => ({ name: folder.name, path: folder.path }))
  ];

  if (!authChecked) {
    return (
      <div className="login-screen" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'radial-gradient(circle at 10% 20%, rgba(26, 32, 44, 1) 0%, rgba(13, 17, 23, 1) 90%)', color: 'white' }}>
        <Loader2 className="animate-spin" size={48} color="#3a7bd5" />
        <p style={{ marginTop: '16px', color: '#94a3b8', fontSize: '0.9rem', letterSpacing: '0.05em' }}>Securing MyCloud session...</p>
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} profiles={appConfig.login_profiles} />;
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

  const totalIndexedFiles = stats.images + stats.videos + stats.music + stats.files;
  const storageSegments = [
    { key: 'images', label: 'Images', value: stats.images, color: '#3a7bd5' },
    { key: 'videos', label: 'Videos', value: stats.videos, color: '#8a2387' },
    { key: 'music', label: 'Music', value: stats.music, color: '#10b981' },
    { key: 'files', label: 'Files', value: stats.files, color: '#f59e0b' }
  ];
  const storageRoot = appConfig.storage_root || '/mnt/Drive1';
  const storageLabel = appConfig.storage_label || 'Drive1';
  const formatDisplayPath = (path) => (path || '').replace(storageRoot, storageLabel);
  const uploadSummary = uploadQueue.reduce((acc, item) => {
    acc.total += item.size || 0;
    acc.loaded += ((item.size || 0) * (item.progress || 0)) / 100;
    acc.completed += item.status === 'completed' ? 1 : 0;
    acc.errors += item.status === 'error' ? 1 : 0;
    acc.active += ['pending', 'uploading', 'processing'].includes(item.status) ? 1 : 0;
    return acc;
  }, { total: 0, loaded: 0, completed: 0, errors: 0, active: 0 });
  const uploadProgress = uploadSummary.total > 0 ? Math.round((uploadSummary.loaded / uploadSummary.total) * 100) : 0;
  const uploadPanelTitle = uploadSummary.active > 0 ? `Uploading ${uploadQueue.length} ${uploadQueue.length === 1 ? 'item' : 'items'}` : uploadSummary.errors > 0 ? 'Upload finished with errors' : 'Upload complete';
  const uploadPanelName = (() => {
    if (uploadQueue.length === 0) return '';
    const firstName = uploadQueue[0].name || 'Upload';
    const rootName = firstName.split('/')[0];
    return rootName || firstName;
  })();
  const categoryCards = [
    { label: 'Images', count: stats.images, meta: 'image files', icon: ImageIcon, color: '#3a7bd5', action: () => openCategory('Images') },
    { label: 'Videos', count: stats.videos, meta: 'video files', icon: Video, color: '#8a2387', action: () => openCategory('Videos') },
    { label: 'Music', count: stats.music, meta: 'audio files', icon: Music, color: '#10b981', action: () => openCategory('Music') },
    { label: 'Documents', count: stats.files, meta: 'other files', icon: FileText, color: '#f59e0b', action: () => openCategory('Files') },
    { label: 'Folders', count: stats.folders, meta: 'folders', icon: Folder, color: '#0f766e', action: () => openFolder(storageRoot) }
  ];
  const lastIndexLabel = dashboardHealth.index?.database_modified
    ? new Date(dashboardHealth.index.database_modified * 1000).toLocaleString()
    : 'Unknown';

  return (
    <div className={`dashboard ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileMenuOpen ? 'mobile-sidebar-open' : ''}`} onClick={() => contextMenu && closeContextMenu()}>
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

        {currentView === 'fileManager' && !sidebarCollapsed ? (
          <div className="folder-sidebar-workspace explorer-sidebar animate-fade-in">
            <div className="explorer-header">
              <span>Explorer</span>
              <button className="explorer-home-btn" onClick={() => setCurrentView('dashboard')} title="Back to Home">
                <Home size={15} />
              </button>
            </div>

            <div className="explorer-root">
              <button className="explorer-root-label" onClick={() => openFolder(storageRoot)} title={`Open ${storageLabel}`}>
                <ChevronRight size={14} />
                <span>{storageLabel}</span>
              </button>

              <div className="explorer-tree">
                {navigatorItems.map((item, idx) => (
                  <button
                    key={item.path}
                    className={`explorer-tree-row ${item.path === currentPath ? 'active' : ''}`}
                    style={{ paddingLeft: `${8 + idx * 12}px` }}
                    onClick={() => openFolder(item.path)}
                    title={item.path}
                  >
                    <ChevronRight size={13} className="explorer-caret" />
                    <Folder size={15} />
                    <span>{item.name}</span>
                  </button>
                ))}

                <div className="explorer-section-label">Current Folder</div>
                {childFolders.map(folder => (
                  <button
                    key={folder.path}
                    className={`explorer-tree-row child-folder ${inspectorItem?.path === folder.path ? 'selected' : ''}`}
                    onClick={() => openFolder(folder.path)}
                    title={folder.path}
                  >
                    <ChevronRight size={13} className="explorer-caret muted" />
                    <Folder size={15} />
                    <span>{folder.name}</span>
                  </button>
                ))}
                {childFolders.length === 0 && !loadingFolder && (
                  <div className="explorer-empty">No folders</div>
                )}
              </div>
            </div>

            <div className="explorer-details">
              <div className="explorer-section-label">Details</div>
              {inspectorItem ? (
                <div className="explorer-details-grid">
                  <div><span>Type</span><strong>{inspectorItem.type}</strong></div>
                  <div><span>Size</span><strong>{inspectorItem.type === 'Folder' ? '--' : formatSize(inspectorItem.size)}</strong></div>
                  <div><span>Modified</span><strong>{formatDate(inspectorItem.modified)}</strong></div>
                </div>
              ) : (
                <div className="explorer-details-empty">Select an item</div>
              )}
            </div>
          </div>
        ) : (
          <>
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
            onClick={() => { openFolder(storageRoot); setMobileMenuOpen(false); }}
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
          <div className="storage-widget sidebar-storage-card animate-scale-up">
            <div className="sidebar-storage-label">Indexed storage</div>
            <div className="sidebar-storage-size">{formatSize(stats.total_size)}</div>
            <div className="sidebar-storage-meta">{totalIndexedFiles} files across {stats.folders} folders</div>

            <div className="sidebar-storage-bar" aria-label="Storage distribution by file type">
              {storageSegments.map(segment => (
                <span
                  key={segment.key}
                  style={{ width: `${Math.max(totalIndexedFiles ? (segment.value / totalIndexedFiles) * 100 : 0, segment.value ? 3 : 0)}%`, background: segment.color }}
                />
              ))}
            </div>

            <div className="sidebar-storage-legend">
              {storageSegments.map(segment => (
                <span key={segment.key}><i style={{ background: segment.color }} />{segment.label}</span>
              ))}
            </div>

            <div className="sidebar-health-list">
              <div className="sidebar-health-row">
                <span className={`health-dot ${dashboardHealth.health?.status === 'ok' ? 'ok' : 'warn'}`}></span>
                <div><strong>Backend</strong><small>{dashboardHealth.health?.status || 'Checking'}</small></div>
              </div>
              <div className="sidebar-health-row">
                <span className={`health-dot ${dashboardHealth.health?.storage_available ? 'ok' : 'danger'}`}></span>
                <div><strong>Storage</strong><small>{dashboardHealth.health?.storage_available ? 'Drive mounted' : 'Unavailable'}</small></div>
              </div>
              <div className="sidebar-health-row">
                <span className={`health-dot ${dashboardHealth.index?.script_exists ? 'ok' : 'warn'}`}></span>
                <div><strong>Indexer</strong><small>{lastIndexLabel}</small></div>
              </div>
            </div>
          </div>
        )}

          </>
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
                          const parentDir = item.path.substring(0, item.path.lastIndexOf('/')) || storageRoot;
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
                        <span className="search-result-path">{formatDisplayPath(item.path)}</span>
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
                onChange={(e) => { handleUploadFiles(e.target.files); e.target.value = ''; }} 
              />
              <input
                type="file"
                multiple
                ref={folderInputRef}
                style={{ display: 'none' }}
                webkitdirectory=""
                directory=""
                onChange={(e) => { handleUploadFiles(e.target.files); e.target.value = ''; }}
              />
              <div className="upload-action-wrap">
                <button className="btn-primary" onClick={() => setUploadMenuOpen((open) => !open)} aria-expanded={uploadMenuOpen}>
                  <Upload size={18} />
                  Upload
                </button>
                {uploadMenuOpen && (
                  <div className="upload-menu glass animate-scale-up">
                    <button type="button" onClick={openFilePicker}>
                      <FileText size={18} />
                      <span>Files</span>
                    </button>
                    <button type="button" onClick={openFolderPicker}>
                      <Folder size={18} />
                      <span>Folder</span>
                    </button>
                  </div>
                )}
              </div>
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
            <div className="dashboard-card-grid animate-fade-in">
              {categoryCards.map(({ label, count, meta, icon: Icon, color, action }) => (
                <button key={label} className="dashboard-type-card" onClick={action} style={{ '--type-accent': color }}>
                  <span className="type-card-accent"></span>
                  <span className="type-card-icon"><Icon size={18} /></span>
                  <span className="type-card-copy">
                    <strong>{label}</strong>
                    <small>{loading ? 'Loading...' : `${count} ${meta}`}</small>
                  </span>
                </button>
              ))}
            </div>

        <div className="section-header mobile-favorites-header dashboard-section-tight">
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
            onContextMenu={handleFolderContextMenu}
            onDragOver={(e) => { if (hasMyCloudDragPayload(e.dataTransfer)) return; e.preventDefault(); e.stopPropagation(); setIsCanvasDragging(true); }}
            onDragEnter={(e) => { if (hasMyCloudDragPayload(e.dataTransfer)) return; e.preventDefault(); e.stopPropagation(); setIsCanvasDragging(true); }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setIsCanvasDragging(false);
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsCanvasDragging(false);
              if (!hasMyCloudDragPayload(e.dataTransfer)) {
                handleUploadFiles(await collectDroppedFiles(e.dataTransfer));
              }
            }}
          >
            {isCanvasDragging && (
              <div className="canvas-drop-overlay">
                <CloudUpload size={34} />
                <span>Drop files or folders into {formatDisplayPath(currentPath)}</span>
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
                  <button className="fm-command-btn" onClick={openFilePicker} title="Upload files">
                    <CloudUpload size={16} />
                    <span>Upload</span>
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
                        className={`fm-item grid-item ${selectedPaths.includes(item.path) ? 'checked' : ''} ${inspectorItem?.path === item.path ? 'inspected' : ''} ${dragOverPath === item.path ? 'drag-over' : ''}`} 
                        onClick={(e) => handleItemClick(e, item)}
                        onDoubleClick={() => item.type === 'Folder' ? openFolder(item.path) : openPreview(item)}
                        onContextMenu={(e) => handleItemContextMenu(e, item, false)}
                        draggable
                        onDragStart={(e) => handleItemDragStart(e, item)}
                        onDragEnd={() => setDragOverPath(null)}
                        onDragOver={(e) => handleFolderDragOver(e, item)}
                        onDragLeave={() => dragOverPath === item.path && setDragOverPath(null)}
                        onDrop={(e) => handleFolderDrop(e, item)}
                      >
                        <button 
                          className="item-options-btn"
                          onClick={(e) => openItemMenu(e, item)}
                          title="More options"
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
                            className={`fm-list-row ${selectedPaths.includes(item.path) ? 'checked' : ''} ${inspectorItem?.path === item.path ? 'inspected' : ''} ${dragOverPath === item.path ? 'drag-over' : ''}`}
                            onDoubleClick={() => item.type === 'Folder' ? openFolder(item.path) : openPreview(item)}
                            onClick={(e) => handleItemClick(e, item)}
                            onContextMenu={(e) => handleItemContextMenu(e, item, false)}
                            draggable
                            onDragStart={(e) => handleItemDragStart(e, item)}
                            onDragEnd={() => setDragOverPath(null)}
                            onDragOver={(e) => handleFolderDragOver(e, item)}
                            onDragLeave={() => dragOverPath === item.path && setDragOverPath(null)}
                            onDrop={(e) => handleFolderDrop(e, item)}
                          >
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
                                <button 
                                  className="item-options-btn"
                                  onClick={(e) => openItemMenu(e, item)}
                                  title="More options"
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

      {contextMenu && (
        <div
          className="file-context-menu glass"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {(contextMenu.item || selectedPaths.length > 0) && (
            <>
              <button type="button" onClick={() => beginClipboardOperation('cut', contextMenu.item)}>
                <Scissors size={15} />
                <span>{contextMenu.item ? 'Cut' : 'Cut Selected'}</span>
              </button>
              <button type="button" onClick={() => beginClipboardOperation('copy', contextMenu.item)}>
                <Copy size={15} />
                <span>{contextMenu.item ? 'Copy' : 'Copy Selected'}</span>
              </button>
            </>
          )}
          <button
            type="button"
            disabled={!fileClipboard?.paths?.length}
            onClick={() => pasteClipboard(contextMenu.item?.type === 'Folder' ? contextMenu.item.path : currentPath)}
          >
            <Clipboard size={15} />
            <span>{contextMenu.item?.type === 'Folder' ? 'Paste into Folder' : 'Paste'}</span>
          </button>
          {contextMenu.item && (
            <>
              <div className="file-context-divider" />
              <button type="button" onClick={() => { toggleFavorite(contextMenu.item); closeContextMenu(); }}>
                <Star size={15} />
                <span>{contextMenu.item.is_favorite ? "Remove Favorite" : "Add Favorite"}</span>
              </button>
              <button type="button" onClick={() => { handleMoveClick(contextMenu.item); closeContextMenu(); }}>
                <MoveRight size={15} />
                <span>Move</span>
              </button>
              <button type="button" onClick={() => { handleRenameClick(contextMenu.item); closeContextMenu(); }}>
                <Edit3 size={15} />
                <span>Rename</span>
              </button>
              {contextMenu.item.type !== "Folder" && (
                <>
                  <a className="file-context-link" href={authUrl("/api/files/raw", contextMenu.item.path)} onClick={closeContextMenu}>
                    <Download size={15} />
                    <span>Download</span>
                  </a>
                  <button type="button" onClick={() => { shareItem(contextMenu.item); closeContextMenu(); }}>
                    <Share2 size={15} />
                    <span>Share Link</span>
                  </button>
                </>
              )}
              <button type="button" className="danger" onClick={() => { handleDeleteClick(contextMenu.item); closeContextMenu(); }}>
                <Trash2 size={15} />
                <span>Delete</span>
              </button>
            </>
          )}
        </div>
      )}

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

      {/* Move Modal */}
      {activeModal === 'move' && selectedItem && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Move {selectedItem.type}</h3>
            <p className="modal-text">Choose where to move <strong>{selectedItem.name}</strong>.</p>
            {moveDestinationOptions.length > 0 && (
              <div className="move-destination-list">
                {moveDestinationOptions.map(destination => (
                  <button
                    type="button"
                    className={moveTarget === destination.path ? 'move-destination active' : 'move-destination'}
                    key={destination.path}
                    onClick={() => setMoveTarget(destination.path)}
                    title={destination.path}
                  >
                    <Folder size={16} />
                    <span>{destination.name}</span>
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={handleMoveSubmit}>
              <input
                type="text"
                className="modal-input"
                value={moveTarget}
                onChange={(e) => setMoveTarget(e.target.value)}
                autoFocus
                placeholder="Target folder path"
              />
              <div className="modal-footer">
                <button type="button" className="btn-modal-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                <button type="submit" className="btn-modal-primary">Move</button>
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

      {uploadQueue.length > 0 && (
        <div className="upload-floating-panel">
          <div className="upload-floating-header">
            <strong>{uploadPanelTitle}</strong>
            <div className="upload-floating-actions">
              {uploadSummary.active === 0 && (
                <button className="upload-floating-icon" onClick={() => setUploadQueue([])} title="Clear upload status">
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
          <div className="upload-floating-body">
            <Folder size={22} />
            <div className="upload-floating-file">
              <span title={uploadPanelName}>{uploadPanelName}</span>
              <small>{uploadSummary.completed} of {uploadQueue.length} - {formatSize(uploadSummary.loaded)} of {formatSize(uploadSummary.total)}</small>
            </div>
            <div className={`upload-ring ${uploadSummary.active === 0 ? 'done' : ''}`} style={{ '--upload-progress': `${uploadProgress}%` }} aria-label={`${uploadProgress}% uploaded`}>
              <span>{uploadSummary.active === 0 ? <Check size={14} /> : `${uploadProgress}%`}</span>
            </div>
          </div>
          <div className="upload-floating-list">
            {uploadQueue.slice(0, 5).map((item) => (
              <div className="upload-floating-item" key={item.id}>
                <span title={item.name}>{item.name}</span>
                <small>{item.status === 'completed' ? 'Done' : item.status === 'error' ? 'Error' : `${item.progress}%`}</small>
              </div>
            ))}
            {uploadQueue.length > 5 && <div className="upload-floating-more">+{uploadQueue.length - 5} more</div>}
          </div>
          <div className="upload-floating-track">
            <div style={{ width: `${uploadProgress}%` }}></div>
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

              <button 
                className="mobile-sheet-action-btn"
                onClick={() => {
                  handleMoveClick(mobileActiveItem);
                  setMobileActiveItem(null);
                }}
              >
                <MoveRight size={16} color="#64748b" />
                <span>Move</span>
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
