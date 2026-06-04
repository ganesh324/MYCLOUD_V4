#!/usr/bin/python3
import hashlib
import os
import sqlite3
from datetime import datetime

# Path Configurations
DATA_DIR = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "data"))
ENV_PATH = os.environ.get("MYCLOUD_ENV_FILE", os.path.join(DATA_DIR, "mycloud.env"))


def load_env_file(path):
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file(ENV_PATH)

MOUNT_POINT = os.path.realpath(os.environ.get("MYCLOUD_STORAGE_ROOT", "/mnt/Drive1"))
DB_PATH = os.environ.get("MYCLOUD_DB_PATH", os.path.join(DATA_DIR, "stats.db"))
TRASH_DIR_NAME = ".mycloud_trash"
TRASH_ROOT = os.path.join(MOUNT_POINT, TRASH_DIR_NAME)


def is_trash_path(path):
    resolved = os.path.realpath(path)
    trash_root = os.path.realpath(TRASH_ROOT)
    return resolved == trash_root or resolved.startswith(trash_root + os.sep)


def compute_file_hash(path):
    digest = hashlib.sha256()
    try:
        with open(path, "rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except (OSError, FileNotFoundError):
        return None

def init_db():
    """Creates the files table if it doesn't exist."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            filepath TEXT UNIQUE NOT NULL,
            extension TEXT,
            size_bytes INTEGER,
            modified_time TEXT,
            content_hash TEXT
        )
    """)
    try:
        cursor.execute("ALTER TABLE files ADD COLUMN content_hash TEXT")
    except sqlite3.OperationalError as exc:
        if "duplicate column" not in str(exc).lower():
            raise
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_content_hash ON files(content_hash)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_filepath ON files(filepath)")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS file_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL,
            username TEXT NOT NULL,
            permission TEXT NOT NULL DEFAULT 'full',
            granted_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(path, username)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_file_permissions_username ON file_permissions(username)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_file_permissions_path ON file_permissions(path)")
    conn.commit()
    conn.close()

def index_drive():
    """Scans the drive and performs a bulk insert into the database."""
    print(f"Starting drive scan on {MOUNT_POINT}...")
    file_records = []
    
    # Walk through the directory tree
    for root, dirs, files in os.walk(MOUNT_POINT):
        if is_trash_path(root):
            dirs[:] = []
            continue

        dirs[:] = [d for d in dirs if d != TRASH_DIR_NAME]

        # Gracefully handle the corrupted folders by checking readability
        # If a directory is corrupted, removing it from 'dirs' prevents os.walk from entering it
        readable_dirs = []
        for d in dirs:
            dir_path = os.path.join(root, d)
            try:
                os.listdir(dir_path)
                readable_dirs.append(d)
            except OSError:
                print(f"Skipping corrupted directory: {dir_path}")
        dirs[:] = readable_dirs  # Update directories in-place to drop bad ones

        for d in readable_dirs:
            dir_path = os.path.join(root, d)
            try:
                stat_info = os.stat(dir_path)
                mod_time = datetime.fromtimestamp(stat_info.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
                file_records.append((d, dir_path, "directory", 0, mod_time, None))
            except (OSError, FileNotFoundError):
                continue

        for file in files:
            full_path = os.path.join(root, file)
            try:
                # Extract file metadata
                stat_info = os.stat(full_path)
                size = stat_info.st_size
                mod_time = datetime.fromtimestamp(stat_info.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
                _, ext = os.path.splitext(file)
                ext = ext.lower().replace(".", "") # clean extension name (e.g. 'jpg')
                content_hash = compute_file_hash(full_path)

                file_records.append((file, full_path, ext, size, mod_time, content_hash))
            except (OSError, FileNotFoundError):
                # Safely skip individual unreadable ghost files
                continue

    # Write data to SQLite using a transaction for maximum speed
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Clear old index so deleted files disappear from your UI
    cursor.execute("DELETE FROM files")
    
    # Bulk insert all files efficiently
    cursor.executemany("""
        INSERT OR IGNORE INTO files (filename, filepath, extension, size_bytes, modified_time, content_hash)
        VALUES (?, ?, ?, ?, ?, ?)
    """, file_records)
    
    conn.commit()
    total_indexed = cursor.rowcount
    conn.close()
    
    print(f"Scan complete! Successfully indexed {total_indexed} files into the database.")

if __name__ == "__main__":
    init_db()
    index_drive()
