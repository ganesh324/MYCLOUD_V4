#!/usr/bin/python3
import os
import sqlite3
from datetime import datetime

# Path Configurations
MOUNT_POINT = "/mnt/Drive1"
DB_PATH = "/home/ganesh/mycloud/app/data/stats.db"

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
            modified_time TEXT
        )
    """)
    conn.commit()
    conn.close()

def index_drive():
    """Scans the drive and performs a bulk insert into the database."""
    print(f"Starting drive scan on {MOUNT_POINT}...")
    file_records = []
    
    # Walk through the directory tree
    for root, dirs, files in os.walk(MOUNT_POINT):
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

        for file in files:
            full_path = os.path.join(root, file)
            try:
                # Extract file metadata
                stat_info = os.stat(full_path)
                size = stat_info.st_size
                mod_time = datetime.fromtimestamp(stat_info.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
                _, ext = os.path.splitext(file)
                ext = ext.lower().replace(".", "") # clean extension name (e.g. 'jpg')

                file_records.append((file, full_path, ext, size, mod_time))
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
        INSERT OR IGNORE INTO files (filename, filepath, extension, size_bytes, modified_time)
        VALUES (?, ?, ?, ?, ?)
    """, file_records)
    
    conn.commit()
    total_indexed = cursor.rowcount
    conn.close()
    
    print(f"Scan complete! Successfully indexed {total_indexed} files into the database.")

if __name__ == "__main__":
    init_db()
    index_drive()
