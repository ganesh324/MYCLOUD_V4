import os
import sqlite3
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import aiosqlite
import hashlib
from fastapi.responses import FileResponse, StreamingResponse
from PIL import Image
import shutil
from datetime import datetime
import io
import zipfile
import hmac
import base64
import json
import time
import secrets
import subprocess
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

DATA_DIR = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "data"))
ENV_PATH = os.environ.get("MYCLOUD_ENV_FILE", os.path.join(DATA_DIR, "mycloud.env"))


def load_env_file(path: str):
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


load_env_file(ENV_PATH)

DB_PATH = os.environ.get("MYCLOUD_DB_PATH", os.path.join(DATA_DIR, "stats.db"))
STORAGE_ROOT = os.path.realpath(os.environ.get("MYCLOUD_STORAGE_ROOT", "/mnt/Drive1"))
STORAGE_LABEL = os.environ.get("MYCLOUD_STORAGE_LABEL", os.path.basename(STORAGE_ROOT) or "Storage")
SECRET_KEY = os.environ.get("MYCLOUD_SECRET_KEY", "mycloud_dev_secret_change_me")
DEFAULT_FAVORITE_PATH = os.environ.get("MYCLOUD_DEFAULT_FAVORITE_PATH", STORAGE_ROOT)
DEFAULT_FAVORITE_LABEL = os.environ.get("MYCLOUD_DEFAULT_FAVORITE_LABEL", STORAGE_LABEL)
CORS_ORIGINS = [origin.strip() for origin in os.environ.get("MYCLOUD_CORS_ORIGINS", "*").split(",") if origin.strip()]
BACKEND_HOST = os.environ.get("MYCLOUD_BACKEND_HOST", "0.0.0.0")
BACKEND_PORT = int(os.environ.get("MYCLOUD_BACKEND_PORT", "8000"))
TRASH_DIR_NAME = ".mycloud_trash"
MAINTENANCE_LOGS = {
    "trash_purge": os.path.join(os.path.dirname(__file__), "..", "data", "trash_purge.log"),
    "watchdog": os.path.join(os.path.dirname(__file__), "..", "data", "watchdog.log"),
    "indexer": os.path.join(os.path.dirname(__file__), "..", "scripts", "indexer_cron.log"),
}
def load_json_env(name: str, default):
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        print(f"Invalid JSON in {name}; using default")
        return default


DEFAULT_SEED_USERS = [
    {"username": "admin", "password": "change-me-admin", "role": "admin", "display_name": "Admin"},
    {"username": "user", "password": "change-me-user", "role": "user", "display_name": "User"},
]
DEFAULT_LOGIN_PROFILES = [
    {"id": "admin", "display_name": "Admin", "initials": "AD", "username": "admin"},
    {"id": "user", "display_name": "User", "initials": "US", "username": "user"},
]

SEED_USERS = load_json_env("MYCLOUD_SEED_USERS", DEFAULT_SEED_USERS)
LOGIN_PROFILES = load_json_env("MYCLOUD_LOGIN_PROFILES", DEFAULT_LOGIN_PROFILES)

def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    if not salt:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return dk.hex(), salt

def generate_token(username: str, role: str, display_name: str) -> str:
    payload = {
        "username": username,
        "role": role,
        "display_name": display_name,
        "exp": time.time() + 7 * 24 * 3600
    }
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    signature = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{signature}"

def verify_token(token: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        payload_b64, signature = parts
        padding = '=' * (4 - len(payload_b64) % 4)
        payload_json = base64.urlsafe_b64decode(payload_b64 + padding).decode()
        payload = json.loads(payload_json)
        
        expected_sig = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_sig, signature):
            return None
            
        if time.time() > payload.get("exp", 0):
            return None
            
        return payload
    except Exception:
        return None

security = HTTPBearer(auto_error=False)

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    token: str | None = Query(default=None)
) -> dict:
    token = credentials.credentials if credentials else token
    if not token:
        raise HTTPException(status_code=401, detail="Missing session token")
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")
    return user

def resolve_storage_path(path: str) -> str:
    resolved = os.path.realpath(path)
    try:
        is_inside_root = os.path.commonpath([STORAGE_ROOT, resolved]) == STORAGE_ROOT
    except ValueError:
        is_inside_root = False
    if not is_inside_root:
        raise HTTPException(status_code=403, detail="Access denied")
    return resolved

def safe_child_path(parent: str, name: str) -> str:
    if not name or os.path.basename(name) != name or "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="Invalid file or folder name")
    return resolve_storage_path(os.path.join(parent, name))

def safe_relative_upload_path(parent: str, relative_path: str) -> str:
    cleaned = (relative_path or "").replace("\\", "/").strip("/")
    parts = [part for part in cleaned.split("/") if part]
    if not parts or any(part in {".", ".."} or os.path.basename(part) != part for part in parts):
        raise HTTPException(status_code=400, detail="Invalid upload path")
    return resolve_storage_path(os.path.join(parent, *parts))


def get_trash_root() -> str:
    return os.path.join(STORAGE_ROOT, TRASH_DIR_NAME)


def get_trash_path_prefix() -> str:
    return get_trash_root() + os.sep


def is_trash_path(path: str) -> bool:
    resolved = os.path.realpath(path)
    trash_root = os.path.realpath(get_trash_root())
    return resolved == trash_root or resolved.startswith(trash_root + os.sep)


def compute_file_hash(path: str) -> str | None:
    if not os.path.isfile(path):
        return None
    digest = hashlib.sha256()
    try:
        with open(path, "rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except OSError:
        return None


def remove_path_if_exists(path: str):
    if os.path.isdir(path):
        shutil.rmtree(path, ignore_errors=True)
    elif os.path.exists(path):
        os.remove(path)


def read_tail_lines(path: str, limit: int = 80) -> list[str]:
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as handle:
            lines = handle.readlines()
        return [line.rstrip("\n") for line in lines[-limit:]]
    except OSError:
        return []

@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(os.path.join(os.path.dirname(__file__), "..", "data", "thumbnails"), exist_ok=True)
    
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS favorites (
                path TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                name TEXT NOT NULL
            )
        ''')
        
        await db.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT NOT NULL,
                display_name TEXT NOT NULL
            )
        ''')

        await db.execute('''
            CREATE TABLE IF NOT EXISTS trash_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_path TEXT NOT NULL,
                trash_path TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                size_bytes INTEGER,
                deleted_by TEXT NOT NULL,
                deleted_at TEXT NOT NULL
            )
        ''')

        await db.execute('''
            CREATE TABLE IF NOT EXISTS share_links (
                token TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                name TEXT NOT NULL,
                expires_at REAL,
                created_by TEXT NOT NULL,
                created_at REAL NOT NULL
            )
        ''')

        await db.execute('''
            CREATE TABLE IF NOT EXISTS activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                path TEXT,
                actor TEXT NOT NULL,
                created_at TEXT NOT NULL,
                details TEXT
            )
        ''')

        await db.execute('''
            CREATE TABLE IF NOT EXISTS file_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL,
                username TEXT NOT NULL,
                permission TEXT NOT NULL DEFAULT 'full',
                granted_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(path, username)
            )
        ''')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_file_permissions_username ON file_permissions(username)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_file_permissions_path ON file_permissions(path)')

        cursor = await db.execute("SELECT COUNT(*) FROM users")
        row = await cursor.fetchone()
        if row and row[0] == 0:
            for user_record in SEED_USERS:
                username = user_record.get("username")
                password = user_record.get("password")
                role = user_record.get("role", "user")
                display_name = user_record.get("display_name", username)
                if not username or not password:
                    continue
                hashed, salt = hash_password(password)
                await db.execute('''
                    INSERT INTO users (username, password_hash, salt, role, display_name)
                    VALUES (?, ?, ?, ?, ?)
                ''', (username, hashed, salt, role, display_name))
            await db.commit()
            print(f"Successfully seeded {len(SEED_USERS)} default account(s) in MyCloud database!")
        
        await db.execute('''
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                filepath TEXT UNIQUE NOT NULL,
                extension TEXT,
                size_bytes INTEGER,
                modified_time TEXT,
                content_hash TEXT
            )
        ''')
        try:
            await db.execute('ALTER TABLE files ADD COLUMN content_hash TEXT')
        except sqlite3.OperationalError as exc:
            if "duplicate column" not in str(exc).lower():
                raise
        await db.execute('CREATE INDEX IF NOT EXISTS idx_files_content_hash ON files(content_hash)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_files_filepath ON files(filepath)')

        await db.execute('''
            INSERT OR IGNORE INTO favorites (path, type, name) 
            VALUES (?, 'Folder', ?)
        ''', (DEFAULT_FAVORITE_PATH, DEFAULT_FAVORITE_LABEL))
        await db.execute('''
            INSERT OR IGNORE INTO file_permissions (path, username, permission, granted_by, created_at)
            SELECT f.filepath, u.username, 'full', 'system_migration', ?
            FROM files f
            CROSS JOIN users u
            WHERE u.role != 'admin'
        ''', (datetime.now().strftime("%Y-%m-%d %H:%M:%S"),))
        await db.commit()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "storage_root": STORAGE_ROOT,
        "storage_available": os.path.isdir(STORAGE_ROOT),
        "time": datetime.utcnow().isoformat() + "Z",
    }

@app.get("/api/config/public")
async def public_config():
    return {
        "storage_root": STORAGE_ROOT,
        "storage_label": STORAGE_LABEL,
        "login_profiles": LOGIN_PROFILES,
    }

IMAGE_EXTENSIONS = {"bmp", "gif", "jpeg", "jpg", "png", "tga", "tif", "webp", "psd", "ico", "svg", "icns"}
VIDEO_EXTENSIONS = {"3gp", "avi", "mkv", "mov", "mp4", "mts", "mxf", "vob", "wmv"}
MUSIC_EXTENSIONS = {"mp3", "wav", "flac", "ogg", "aac"}
PDF_EXTENSIONS = {"pdf"}
TEXT_EXTENSIONS = {"txt", "md", "js", "jsx", "ts", "tsx", "json", "css", "html", "py", "sh", "yml", "yaml", "ini", "conf", "log"}

class FavoriteToggleRequest(BaseModel):
    path: str
    type: str
    name: str

class MkdirRequest(BaseModel):
    path: str
    folder_name: str

class FavoriteItem(BaseModel):
    path: str
    type: str
    name: str

class BulkFavoriteRequest(BaseModel):
    items: list[FavoriteItem]

class BulkDeleteRequest(BaseModel):
    paths: list[str]

class LoginRequest(BaseModel):
    username: str
    password: str

class UserCreateRequest(BaseModel):
    username: str
    password: str
    role: str = "user"
    display_name: str

class PasswordChangeRequest(BaseModel):
    username: str
    new_password: str

class FileOperationRequest(BaseModel):
    source_path: str
    target_dir: str
    new_name: str | None = None

class ShareCreateRequest(BaseModel):
    path: str
    expires_hours: int | None = 24

def require_admin(user: dict):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

def get_item_type_from_extension(extension: str | None) -> str:
    ext = (extension or "").lower().replace(".", "")
    if ext == "directory":
        return "Folder"
    if ext in IMAGE_EXTENSIONS:
        return "Image"
    if ext in VIDEO_EXTENSIONS:
        return "Video"
    if ext in MUSIC_EXTENSIONS:
        return "Music"
    if ext in PDF_EXTENSIONS:
        return "PDF"
    if ext in TEXT_EXTENSIONS:
        return "Text"
    return "File"


def get_item_type(path: str) -> str:
    if os.path.isdir(path):
        return "Folder"
    return get_item_type_from_extension(os.path.splitext(path)[1])


async def log_activity(action: str, path: str | None, actor: str, details: str | None = None):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            'INSERT INTO activity_log (action, path, actor, created_at, details) VALUES (?, ?, ?, ?, ?)',
            (action, path, actor, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), details)
        )
        await db.commit()

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        cursor = await db.execute("SELECT password_hash, salt, role, display_name FROM users WHERE username = ?", (req.username,))
        user = await cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username or password")
            
        hashed, _ = hash_password(req.password, user["salt"])
        if hashed != user["password_hash"]:
            raise HTTPException(status_code=401, detail="Invalid username or password")
            
        token = generate_token(req.username, user["role"], user["display_name"])
        return {
            "token": token,
            "username": req.username,
            "role": user["role"],
            "display_name": user["display_name"]
        }

@app.get("/api/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return user

@app.get("/api/stats")
async def get_stats(user: dict = Depends(get_current_user)):
    stats = {
        "images": 0,
        "videos": 0,
        "music": 0,
        "files": 0,
        "folders": 0,
        "total_size": 0,
    }
    
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        
        # Get count by extension
        cursor = await db.execute("SELECT extension, COUNT(*) as count, SUM(size_bytes) as size FROM files GROUP BY extension")
        rows = await cursor.fetchall()
        
        for row in rows:
            ext = row["extension"]
            ext = ext.lower() if ext else ""
            count = row["count"]
            size = row["size"] or 0
            
            if ext == "directory":
                continue
                
            stats["total_size"] += size
            
            if ext in IMAGE_EXTENSIONS:
                stats["images"] += count
            elif ext in VIDEO_EXTENSIONS:
                stats["videos"] += count
            elif ext in MUSIC_EXTENSIONS:
                stats["music"] += count
            else:
                stats["files"] += count
                
        # Count unique folders
        cursor = await db.execute("SELECT COUNT(*) as folder_count FROM files WHERE extension = 'directory'")
        folder_row = await cursor.fetchone()
        if folder_row:
            stats["folders"] = folder_row["folder_count"]

    return stats

@app.get("/api/favorites")
async def get_favorites(user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        cursor = await db.execute('SELECT path, type, name FROM favorites')
        rows = await cursor.fetchall()
        favorites = [{"path": row["path"], "type": row["type"], "name": row["name"]} for row in rows]
    return {"favorites": favorites}

@app.post("/api/favorites/toggle")
async def toggle_favorite(req: FavoriteToggleRequest, user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        cursor = await db.execute('SELECT path FROM favorites WHERE path = ?', (req.path,))
        existing = await cursor.fetchone()
        
        if existing:
            await db.execute('DELETE FROM favorites WHERE path = ?', (req.path,))
            status = "removed"
        else:
            await db.execute('INSERT INTO favorites (path, type, name) VALUES (?, ?, ?)', (req.path, req.type, req.name))
            status = "added"
            
        await db.commit()
    return {"status": status, "path": req.path}

@app.get("/api/recent")
async def get_recent_activity(user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        
        # We perform a LEFT JOIN to check if the file is in the favorites table
        cursor = await db.execute('''
            SELECT f.filename, f.filepath, f.extension, f.size_bytes, f.modified_time,
                   CASE WHEN fav.path IS NOT NULL THEN 1 ELSE 0 END as is_favorite
            FROM files f
            LEFT JOIN favorites fav ON f.filepath = fav.path
            WHERE f.extension != 'directory'
            ORDER BY f.modified_time DESC 
            LIMIT 5
        ''')
        rows = await cursor.fetchall()
        
        recent = []
        for row in rows:
            recent.append({
                "name": row["filename"],
                "path": row["filepath"],
                "type": get_item_type_from_extension(row["extension"]),
                "size": row["size_bytes"],
                "modified": row["modified_time"],
                "is_favorite": bool(row["is_favorite"])
            })
            
    return {"recent": recent}

@app.get("/api/files/list")
async def get_files_list(path: str = STORAGE_ROOT, user: dict = Depends(get_current_user)):
    path = resolve_storage_path(path)
    
    if not os.path.exists(path) or not os.path.isdir(path):
        raise HTTPException(status_code=404, detail="Directory not found")

    # Fetch favorites to quickly determine favorite status
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT path FROM favorites")
        rows = await cursor.fetchall()
        favorites = {row[0] for row in rows}

    items = []
    try:
        with os.scandir(path) as it:
            for entry in it:
                try:
                    stat = entry.stat()
                    name = entry.name
                    entry_path = entry.path
                    
                    if entry.is_dir():
                        item_type = "Folder"
                    else:
                        ext = os.path.splitext(name)[1].lower().replace(".", "")
                        if ext in IMAGE_EXTENSIONS:
                            item_type = "Image"
                        elif ext in VIDEO_EXTENSIONS:
                            item_type = "Video"
                        elif ext in MUSIC_EXTENSIONS:
                            item_type = "Music"
                        elif ext in PDF_EXTENSIONS:
                            item_type = "PDF"
                        elif ext in TEXT_EXTENSIONS:
                            item_type = "Text"
                        else:
                            item_type = "File"
                            
                    items.append({
                        "name": name,
                        "path": entry_path,
                        "type": item_type,
                        "size": stat.st_size,
                        "modified": stat.st_mtime * 1000,
                        "is_favorite": entry_path in favorites
                    })
                except OSError:
                    pass
    except OSError as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    items.sort(key=lambda x: (x["type"] != "Folder", x["name"].lower()))
    return {"items": items}

@app.get("/api/duplicates")
async def get_duplicate_files(
    limit: int = Query(default=250, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(get_current_user)
):
    trash_path_prefix = get_trash_path_prefix()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        total_cursor = await db.execute("""
            WITH active_files AS (
                SELECT f.*
                FROM files f
                WHERE f.extension != 'directory'
                  AND f.size_bytes > 0
                  AND f.content_hash IS NOT NULL
                  AND f.content_hash != ''
                  AND f.filepath NOT LIKE ?
                  AND NOT EXISTS (
                      SELECT 1
                      FROM trash_items t
                      WHERE t.original_path = f.filepath
                         OR t.trash_path = f.filepath
                  )
            )
            SELECT COUNT(*) AS total_groups
            FROM (
                SELECT 1
                FROM active_files
                GROUP BY content_hash
                HAVING COUNT(*) > 1
            ) duplicate_keys
        """, (trash_path_prefix,))
        total_row = await total_cursor.fetchone()
        total_groups = total_row["total_groups"] if total_row else 0

        cursor = await db.execute("""
            WITH active_files AS (
                SELECT f.*
                FROM files f
                WHERE f.extension != 'directory'
                  AND f.size_bytes > 0
                  AND f.content_hash IS NOT NULL
                  AND f.content_hash != ''
                  AND f.filepath NOT LIKE ?
                  AND NOT EXISTS (
                      SELECT 1
                      FROM trash_items t
                      WHERE t.original_path = f.filepath
                         OR t.trash_path = f.filepath
                  )
            ),
            duplicate_keys AS (
                SELECT
                    content_hash,
                    COUNT(*) AS duplicate_count,
                    SUM(size_bytes) AS total_size,
                    MAX(size_bytes) AS item_size
                FROM active_files
                GROUP BY content_hash
                HAVING COUNT(*) > 1
                ORDER BY total_size DESC, duplicate_count DESC, content_hash ASC
                LIMIT ? OFFSET ?
            )
            SELECT
                dk.content_hash,
                dk.duplicate_count,
                dk.total_size,
                dk.item_size,
                f.filename,
                f.filepath,
                f.extension,
                f.size_bytes,
                f.modified_time
            FROM active_files f
            INNER JOIN duplicate_keys dk
                ON f.content_hash = dk.content_hash
            ORDER BY dk.total_size DESC, dk.duplicate_count DESC, dk.content_hash ASC, f.filepath ASC
        """, (trash_path_prefix, limit, offset))
        rows = await cursor.fetchall()

    groups_by_key = {}
    duplicate_groups = []
    for row in rows:
        key = row["content_hash"]
        if key not in groups_by_key:
            group = {
                "id": f"hash::{key[:16]}",
                "hash": key,
                "name": row["filename"],
                "size": row["item_size"] or row["size_bytes"] or 0,
                "count": row["duplicate_count"],
                "wasted_size": (row["duplicate_count"] - 1) * (row["item_size"] or row["size_bytes"] or 0),
                "files": [],
            }
            groups_by_key[key] = group
            duplicate_groups.append(group)

        groups_by_key[key]["files"].append({
            "name": row["filename"],
            "path": row["filepath"],
            "type": get_item_type_from_extension(row["extension"]),
            "size": row["size_bytes"] or 0,
            "modified": row["modified_time"],
        })

    return {
        "duplicates": duplicate_groups,
        "total_groups": total_groups,
        "limit": limit,
        "offset": offset,
        "match_strategy": "sha256",
    }

@app.get("/api/thumbnail")
async def get_thumbnail(path: str, user: dict = Depends(get_current_user)):
    path = resolve_storage_path(path)
        
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
        
    ext = os.path.splitext(path)[1].lower().replace(".", "")
    if ext not in IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Not an image")
        
    path_hash = hashlib.md5(path.encode('utf-8')).hexdigest()
    thumbnails_dir = os.path.join(os.path.dirname(__file__), "..", "data", "thumbnails")
    thumb_path = os.path.join(thumbnails_dir, f"{path_hash}.jpg")
    
    if not os.path.exists(thumb_path):
        try:
            with Image.open(path) as img:
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                img.thumbnail((200, 200))
                img.save(thumb_path, "JPEG")
        except Exception as e:
            print(f"Error generating thumbnail for {path}: {e}")
            raise HTTPException(status_code=500, detail="Error generating thumbnail")
            
    return FileResponse(thumb_path)

class RenameRequest(BaseModel):
    path: str
    new_name: str

class DeleteRequest(BaseModel):
    path: str

@app.post("/api/files/rename")
async def rename_file(req: RenameRequest, user: dict = Depends(get_current_user)):
    old_path = resolve_storage_path(req.path)
        
    if not os.path.exists(old_path):
        raise HTTPException(status_code=404, detail="File or folder not found")
        
    parent_dir = os.path.dirname(old_path)
    new_path = safe_child_path(parent_dir, req.new_name)
    
    if os.path.exists(new_path):
        raise HTTPException(status_code=400, detail="A file or folder with this name already exists")
        
    try:
        os.rename(old_path, new_path)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to rename on disk: {str(e)}")
        
    # Update DB references
    async with aiosqlite.connect(DB_PATH) as db:
        # Update favorites
        await db.execute('UPDATE favorites SET path = ?, name = ? WHERE path = ?', (new_path, req.new_name, old_path))
        # Update sub-favorites
        await db.execute(
            'UPDATE favorites SET path = ? || substr(path, ?) WHERE path LIKE ?',
            (new_path, len(old_path) + 1, old_path + '/%')
        )
        
        # Update files index
        await db.execute('UPDATE files SET filepath = ?, filename = ? WHERE filepath = ?', (new_path, req.new_name, old_path))
        # Update sub-files
        await db.execute(
            'UPDATE files SET filepath = ? || substr(filepath, ?) WHERE filepath LIKE ?',
            (new_path, len(old_path) + 1, old_path + '/%')
        )
        
        await db.commit()
        
    return {"status": "success", "new_path": new_path}

@app.post("/api/files/delete")
async def delete_file(req: DeleteRequest, user: dict = Depends(get_current_user)):
    path = resolve_storage_path(req.path)
        
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File or folder not found")

    trash_root = get_trash_root()
    os.makedirs(trash_root, exist_ok=True)
    name = os.path.basename(path)
    trash_name = f"{int(time.time())}_{secrets.token_hex(4)}_{name}"
    trash_path = os.path.join(trash_root, trash_name)
    item_type = get_item_type(path)
    size_bytes = os.path.getsize(path) if os.path.isfile(path) else 0
        
    try:
        shutil.move(path, trash_path)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to move item to trash: {str(e)}")
        
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('''
            INSERT INTO trash_items (original_path, trash_path, name, type, size_bytes, deleted_by, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (path, trash_path, name, item_type, size_bytes, user["username"], datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
        await db.execute('DELETE FROM favorites WHERE path = ? OR path LIKE ?', (path, path + '/%'))
        await db.execute('DELETE FROM files WHERE filepath = ? OR filepath LIKE ?', (path, path + '/%'))
        await db.commit()
    await log_activity("trash", path, user["username"], trash_path)
        
    return {"status": "trashed", "trash_path": trash_path}

@app.get("/api/files/raw")
async def get_raw_file(path: str, user: dict = Depends(get_current_user)):
    path = resolve_storage_path(path)
        
    if not os.path.exists(path) or os.path.isdir(path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(path)

@app.get("/api/files/text")
async def get_text_file(path: str, user: dict = Depends(get_current_user)):
    path = resolve_storage_path(path)
        
    if not os.path.exists(path) or os.path.isdir(path):
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read(1024 * 1024)
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/files/mkdir")
async def create_directory(req: MkdirRequest, user: dict = Depends(get_current_user)):
    parent_dir = resolve_storage_path(req.path)
    target_dir = safe_child_path(parent_dir, req.folder_name)
        
    if os.path.exists(target_dir):
        raise HTTPException(status_code=400, detail="Folder already exists")
        
    try:
        os.makedirs(target_dir, exist_ok=True)
        mod_time = datetime.fromtimestamp(os.stat(target_dir).st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute('''
                INSERT OR REPLACE INTO files (filename, filepath, extension, size_bytes, modified_time)
                VALUES (?, ?, 'directory', 0, ?)
            ''', (req.folder_name, target_dir, mod_time))
            if user.get("role") != "admin":
                await db.execute('''
                    INSERT OR REPLACE INTO file_permissions (path, username, permission, granted_by, created_at)
                    VALUES (?, ?, 'full', ?, ?)
                ''', (target_dir, user["username"], user["username"], datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
            await db.commit()
        return {"status": "success", "path": target_dir}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/files/upload")
async def upload_file(
    path: str = Form(...),
    file: UploadFile = File(...),
    relative_path: str | None = Form(default=None),
    user: dict = Depends(get_current_user)
):
    path = resolve_storage_path(path)
        
    if not os.path.exists(path) or not os.path.isdir(path):
        raise HTTPException(status_code=400, detail="Target path is not a directory")

    upload_path = relative_path or file.filename or ""
    if "/" in upload_path or "\\" in upload_path:
        target_filepath = safe_relative_upload_path(path, upload_path)
    else:
        safe_filename = os.path.basename(upload_path)
        target_filepath = safe_child_path(path, safe_filename)
    safe_filename = os.path.basename(target_filepath)
    created_dirs = []
    parent_dir = os.path.dirname(target_filepath)
    
    try:
        if parent_dir != path:
            cursor = parent_dir
            stack = []
            while os.path.commonpath([path, cursor]) == path and cursor != path:
                stack.append(cursor)
                cursor = os.path.dirname(cursor)
            for folder_path in reversed(stack):
                if not os.path.exists(folder_path):
                    os.makedirs(folder_path, exist_ok=True)
                    created_dirs.append(folder_path)
                elif not os.path.isdir(folder_path):
                    trash_root = get_trash_root()
                    os.makedirs(trash_root, exist_ok=True)
                    conflict_name = os.path.basename(folder_path)
                    trash_path = os.path.join(trash_root, f"{int(time.time())}_{secrets.token_hex(4)}_{conflict_name}")
                    shutil.move(folder_path, trash_path)
                    os.makedirs(folder_path, exist_ok=True)
                    created_dirs.append(folder_path)
                    async with aiosqlite.connect(DB_PATH) as db:
                        await db.execute('''
                            INSERT INTO trash_items (original_path, trash_path, name, type, size_bytes, deleted_by, deleted_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        ''', (folder_path, trash_path, conflict_name, get_item_type(trash_path), os.path.getsize(trash_path) if os.path.isfile(trash_path) else 0, user["username"], datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
                        await db.execute('DELETE FROM files WHERE filepath = ?', (folder_path,))
                        await db.commit()
        else:
            os.makedirs(parent_dir, exist_ok=True)

        with open(target_filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        stat_info = os.stat(target_filepath)
        size = stat_info.st_size
        mod_time = datetime.fromtimestamp(stat_info.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        ext = os.path.splitext(safe_filename)[1].lower().replace(".", "")
        file_hash = compute_file_hash(target_filepath)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        async with aiosqlite.connect(DB_PATH) as db:
            for folder_path in created_dirs:
                folder_stat = os.stat(folder_path)
                folder_mod_time = datetime.fromtimestamp(folder_stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
                await db.execute('''
                    INSERT OR REPLACE INTO files (filename, filepath, extension, size_bytes, modified_time)
                    VALUES (?, ?, 'directory', 0, ?)
                ''', (os.path.basename(folder_path), folder_path, folder_mod_time))
                if user.get("role") != "admin":
                    await db.execute('''
                        INSERT OR REPLACE INTO file_permissions (path, username, permission, granted_by, created_at)
                        VALUES (?, ?, 'full', ?, ?)
                    ''', (folder_path, user["username"], user["username"], now))

            await db.execute('''
                INSERT OR REPLACE INTO files (filename, filepath, extension, size_bytes, modified_time, content_hash)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (safe_filename, target_filepath, ext, size, mod_time, file_hash))
            if user.get("role") != "admin":
                await db.execute('''
                    INSERT OR REPLACE INTO file_permissions (path, username, permission, granted_by, created_at)
                    VALUES (?, ?, 'full', ?, ?)
                ''', (target_filepath, user["username"], user["username"], now))
            await db.commit()
            
        return {"status": "success", "filepath": target_filepath}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/files/save-edited-image")
async def save_edited_image(
    path: str = Form(...),
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    original_path = resolve_storage_path(path)
    if not os.path.exists(original_path) or os.path.isdir(original_path):
        raise HTTPException(status_code=404, detail="Original image not found")

    original_ext = os.path.splitext(original_path)[1].lower().replace(".", "")
    if original_ext not in IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Original file is not an image")

    parent_dir = os.path.dirname(original_path)
    original_name = os.path.basename(original_path)
    stem, _ = os.path.splitext(original_name)
    content_type = (file.content_type or "").lower()
    output_ext = "png" if "png" in content_type else "jpg"

    candidate_name = f"{stem}-edited.{output_ext}"
    target_path = safe_child_path(parent_dir, candidate_name)
    counter = 2
    while os.path.exists(target_path):
        candidate_name = f"{stem}-edited-{counter}.{output_ext}"
        target_path = safe_child_path(parent_dir, candidate_name)
        counter += 1

    try:
        data = await file.read()
        with Image.open(io.BytesIO(data)) as img:
            if output_ext == "jpg" and img.mode != "RGB":
                img = img.convert("RGB")
            img.save(target_path, "PNG" if output_ext == "png" else "JPEG", quality=92)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid edited image: {str(e)}")

    stat_info = os.stat(target_path)
    size = stat_info.st_size
    mod_time = datetime.fromtimestamp(stat_info.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
    file_hash = compute_file_hash(target_path)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT OR REPLACE INTO files (filename, filepath, extension, size_bytes, modified_time, content_hash)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (candidate_name, target_path, output_ext, size, mod_time, file_hash))
        if user.get("role") != "admin":
            await db.execute("""
                INSERT OR REPLACE INTO file_permissions (path, username, permission, granted_by, created_at)
                VALUES (?, ?, 'full', ?, ?)
            """, (target_path, user["username"], user["username"], now))
        await db.commit()

    await log_activity("image_edit_save", target_path, user["username"], original_path)
    return {"status": "success", "filepath": target_path, "name": candidate_name}

@app.get("/api/files/search")
async def search_files(q: str = "", user: dict = Depends(get_current_user)):
    if not q:
        return []
    async with aiosqlite.connect(DB_PATH) as db:
        query_pattern = f"%{q}%"
        cursor = await db.execute('''
            SELECT filename, filepath, extension, size_bytes, modified_time 
            FROM files 
            WHERE filename LIKE ? 
            LIMIT 50
        ''', (query_pattern,))
        rows = await cursor.fetchall()
        
        results = []
        for row in rows:
            name, path, ext, size, mod_time = row
            if ext == "directory":
                item_type = "Folder"
            elif ext in IMAGE_EXTENSIONS:
                item_type = "Image"
            elif ext in VIDEO_EXTENSIONS:
                item_type = "Video"
            elif ext in MUSIC_EXTENSIONS:
                item_type = "Music"
            elif ext in PDF_EXTENSIONS:
                item_type = "PDF"
            elif ext in TEXT_EXTENSIONS:
                item_type = "Text"
            else:
                item_type = "File"
                
            results.append({
                "name": name,
                "path": path,
                "type": item_type,
                "size": size,
                "modified": mod_time
            })
        return results

@app.get("/api/files/category")
async def get_files_by_category(category: str, user: dict = Depends(get_current_user)):
    ext_filter = None
    exclude_others = False
    
    if category == "Images":
        ext_filter = IMAGE_EXTENSIONS
    elif category == "Videos":
        ext_filter = VIDEO_EXTENSIONS
    elif category == "Music":
        ext_filter = MUSIC_EXTENSIONS
    elif category == "Files":
        exclude_others = True
    else:
        raise HTTPException(status_code=400, detail="Invalid category")
        
    async with aiosqlite.connect(DB_PATH) as db:
        if ext_filter:
            placeholders = ",".join(["?"] * len(ext_filter))
            query = f'''
                SELECT filename, filepath, extension, size_bytes, modified_time 
                FROM files 
                WHERE extension IN ({placeholders})
            '''
            cursor = await db.execute(query, tuple(ext_filter))
        elif exclude_others:
            all_media = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS | MUSIC_EXTENSIONS | PDF_EXTENSIONS | TEXT_EXTENSIONS
            placeholders = ",".join(["?"] * len(all_media))
            query = f'''
                SELECT filename, filepath, extension, size_bytes, modified_time 
                FROM files 
                WHERE extension NOT IN ({placeholders}) AND extension != 'directory'
            '''
            cursor = await db.execute(query, tuple(all_media))
            
        rows = await cursor.fetchall()
        
        results = []
        for row in rows:
            name, path, ext, size, mod_time = row
            if ext in IMAGE_EXTENSIONS:
                item_type = "Image"
            elif ext in VIDEO_EXTENSIONS:
                item_type = "Video"
            elif ext in MUSIC_EXTENSIONS:
                item_type = "Music"
            elif ext in PDF_EXTENSIONS:
                item_type = "PDF"
            elif ext in TEXT_EXTENSIONS:
                item_type = "Text"
            else:
                item_type = "File"
                
            results.append({
                "name": name,
                "path": path,
                "type": item_type,
                "size": size,
                "modified": mod_time
            })
        return results

@app.post("/api/files/bulk-favorite")
async def bulk_favorite(req: BulkFavoriteRequest, user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        for item in req.items:
            try:
                item.path = resolve_storage_path(item.path)
            except HTTPException:
                continue
            await db.execute('''
                INSERT OR REPLACE INTO favorites (path, type, name) 
                VALUES (?, ?, ?)
            ''', (item.path, item.type, item.name))
        await db.commit()
    return {"status": "success", "count": len(req.items)}

@app.post("/api/files/bulk-delete")
async def bulk_delete(req: BulkDeleteRequest, user: dict = Depends(get_current_user)):
    trash_root = get_trash_root()
    os.makedirs(trash_root, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        deleted_count = 0
        for path in req.paths:
            try:
                path = resolve_storage_path(path)
            except HTTPException:
                continue
            if os.path.exists(path):
                try:
                    name = os.path.basename(path)
                    trash_name = f"{int(time.time())}_{secrets.token_hex(4)}_{name}"
                    trash_path = os.path.join(trash_root, trash_name)
                    item_type = get_item_type(path)
                    size_bytes = os.path.getsize(path) if os.path.isfile(path) else 0
                    shutil.move(path, trash_path)
                    await db.execute('''
                        INSERT INTO trash_items (original_path, trash_path, name, type, size_bytes, deleted_by, deleted_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (path, trash_path, name, item_type, size_bytes, user["username"], datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
                    await db.execute('DELETE FROM files WHERE filepath = ? OR filepath LIKE ?', (path, path + '/%'))
                    await db.execute('DELETE FROM favorites WHERE path = ? OR path LIKE ?', (path, path + '/%'))
                    deleted_count += 1
                except Exception as e:
                    print(f"Error moving {path} to trash: {e}")
                    
        await db.commit()
    await log_activity("bulk_trash", None, user["username"], f"{deleted_count} items")
    return {"status": "trashed", "count": deleted_count}

@app.post("/api/files/bulk-download")
async def bulk_download(req: BulkDeleteRequest, user: dict = Depends(get_current_user)):
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for path in req.paths:
            try:
                path = resolve_storage_path(path)
            except HTTPException:
                continue
            if os.path.exists(path):
                if os.path.isdir(path):
                    for root, _, files in os.walk(path):
                        for file in files:
                            file_path = os.path.join(root, file)
                            rel_path = os.path.relpath(file_path, os.path.dirname(path))
                            zip_file.write(file_path, rel_path)
                else:
                    zip_file.write(path, os.path.basename(path))
                    
    zip_buffer.seek(0)
    
    headers = {
        "Content-Disposition": "attachment; filename=mycloud_archive.zip"
    }
    return StreamingResponse(zip_buffer, media_type="application/zip", headers=headers)


@app.get("/api/admin/users")
async def list_users(user: dict = Depends(get_current_user)):
    require_admin(user)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        rows = await (await db.execute('SELECT username, role, display_name FROM users ORDER BY username')).fetchall()
    return {"users": [dict(row) for row in rows]}

@app.post("/api/admin/users")
async def create_user(req: UserCreateRequest, user: dict = Depends(get_current_user)):
    require_admin(user)
    if req.role not in {"admin", "user"}:
        raise HTTPException(status_code=400, detail="Invalid role")
    hashed, salt = hash_password(req.password)
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute('INSERT INTO users (username, password_hash, salt, role, display_name) VALUES (?, ?, ?, ?, ?)', (req.username, hashed, salt, req.role, req.display_name))
            await db.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Username already exists")
    await log_activity("user_create", req.username, user["username"], req.role)
    return {"status": "success"}

@app.post("/api/admin/users/password")
async def change_user_password(req: PasswordChangeRequest, user: dict = Depends(get_current_user)):
    require_admin(user)
    hashed, salt = hash_password(req.new_password)
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute('UPDATE users SET password_hash = ?, salt = ? WHERE username = ?', (hashed, salt, req.username))
        await db.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await log_activity("password_change", req.username, user["username"])
    return {"status": "success"}

@app.delete("/api/admin/users/{username}")
async def delete_user(username: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    if username == user["username"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute('DELETE FROM users WHERE username = ?', (username,))
        await db.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await log_activity("user_delete", username, user["username"])
    return {"status": "success"}

@app.get("/api/files/details")
async def file_details(path: str, user: dict = Depends(get_current_user)):
    path = resolve_storage_path(path)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Item not found")
    stat = os.stat(path)
    return {
        "name": os.path.basename(path),
        "path": path,
        "type": get_item_type(path),
        "size": stat.st_size,
        "modified": stat.st_mtime * 1000,
        "is_directory": os.path.isdir(path)
    }

@app.post("/api/files/copy")
async def copy_item(req: FileOperationRequest, user: dict = Depends(get_current_user)):
    source = resolve_storage_path(req.source_path)
    target_dir = resolve_storage_path(req.target_dir)
    if not os.path.exists(source):
        raise HTTPException(status_code=404, detail="Item not found")
    if not os.path.isdir(target_dir):
        raise HTTPException(status_code=400, detail="Target must be a folder")
    if os.path.isdir(source):
        try:
            target_inside_source = os.path.commonpath([source, target_dir]) == source
        except ValueError:
            target_inside_source = False
        if target_inside_source:
            raise HTTPException(status_code=400, detail="Cannot copy a folder into itself or one of its subfolders")
    target = safe_child_path(target_dir, req.new_name or os.path.basename(source))
    if os.path.exists(target):
        raise HTTPException(status_code=400, detail="Target already exists")
    if os.path.isdir(source):
        shutil.copytree(source, target)
    else:
        shutil.copy2(source, target)
    await log_activity("copy", source, user["username"], target)
    return {"status": "success", "path": target}

@app.post("/api/files/move")
async def move_item(req: FileOperationRequest, user: dict = Depends(get_current_user)):
    source = resolve_storage_path(req.source_path)
    target_dir = resolve_storage_path(req.target_dir)
    if not os.path.exists(source):
        raise HTTPException(status_code=404, detail="Item not found")
    if not os.path.isdir(target_dir):
        raise HTTPException(status_code=400, detail="Target must be a folder")
    if os.path.isdir(source):
        try:
            target_inside_source = os.path.commonpath([source, target_dir]) == source
        except ValueError:
            target_inside_source = False
        if target_inside_source:
            raise HTTPException(status_code=400, detail="Cannot move a folder into itself or one of its subfolders")
    target = safe_child_path(target_dir, req.new_name or os.path.basename(source))
    if os.path.exists(target):
        raise HTTPException(status_code=400, detail="Target already exists")
    shutil.move(source, target)
    await log_activity("move", source, user["username"], target)
    return {"status": "success", "path": target}


@app.get("/api/trash")
async def list_trash(user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        rows = await (await db.execute('SELECT id, original_path, name, type, size_bytes, deleted_by, deleted_at FROM trash_items ORDER BY id DESC')).fetchall()
    return {"trash": [dict(row) for row in rows]}

@app.delete("/api/trash")
async def empty_trash(user: dict = Depends(get_current_user)):
    require_admin(user)
    trash_root = get_trash_root()
    os.makedirs(trash_root, exist_ok=True)
    removed_count = 0

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        rows = await (await db.execute('SELECT * FROM trash_items')).fetchall()
        for row in rows:
            if row["trash_path"] and is_trash_path(row["trash_path"]):
                remove_path_if_exists(row["trash_path"])
                removed_count += 1
        for name in os.listdir(trash_root):
            remove_path_if_exists(os.path.join(trash_root, name))
        await db.execute('DELETE FROM trash_items')
        await db.commit()

    await log_activity("trash_empty", trash_root, user["username"], f"{removed_count} indexed items removed")
    return {"status": "success", "removed_count": removed_count}

@app.get("/api/admin/maintenance/logs")
async def get_maintenance_logs(user: dict = Depends(get_current_user)):
    require_admin(user)
    return {"logs": {name: read_tail_lines(path) for name, path in MAINTENANCE_LOGS.items()}}

@app.post("/api/trash/{item_id}/restore")
async def restore_trash(item_id: int, user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        row = await (await db.execute('SELECT * FROM trash_items WHERE id = ?', (item_id,))).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Trash item not found")
        restore_path = row["original_path"]
        if os.path.exists(restore_path):
            restore_path = os.path.join(os.path.dirname(restore_path), f"restored_{int(time.time())}_{row['name']}")
        os.makedirs(os.path.dirname(restore_path), exist_ok=True)
        shutil.move(row["trash_path"], restore_path)
        await db.execute('DELETE FROM trash_items WHERE id = ?', (item_id,))
        await db.commit()
    await log_activity("restore", restore_path, user["username"])
    return {"status": "success", "path": restore_path}

@app.delete("/api/trash/{item_id}")
async def permanently_delete_trash(item_id: int, user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        row = await (await db.execute('SELECT * FROM trash_items WHERE id = ?', (item_id,))).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Trash item not found")
        if os.path.isdir(row["trash_path"]):
            shutil.rmtree(row["trash_path"], ignore_errors=True)
        elif os.path.exists(row["trash_path"]):
            os.remove(row["trash_path"])
        await db.execute('DELETE FROM trash_items WHERE id = ?', (item_id,))
        await db.commit()
    await log_activity("delete_permanent", row["original_path"], user["username"])
    return {"status": "success"}

@app.post("/api/share")
async def create_share(req: ShareCreateRequest, user: dict = Depends(get_current_user)):
    path = resolve_storage_path(req.path)
    if not os.path.exists(path) or os.path.isdir(path):
        raise HTTPException(status_code=404, detail="File not found")
    token = secrets.token_urlsafe(18)
    expires_at = time.time() + max(req.expires_hours or 24, 1) * 3600
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('INSERT INTO share_links (token, path, name, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', (token, path, os.path.basename(path), expires_at, user["username"], time.time()))
        await db.commit()
    await log_activity("share_create", path, user["username"], token)
    return {"token": token, "url": f"/api/share/{token}"}

@app.get("/api/share/{token}")
async def get_shared_file(token: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        row = await (await db.execute('SELECT * FROM share_links WHERE token = ?', (token,))).fetchone()
    if not row or time.time() > row["expires_at"]:
        raise HTTPException(status_code=404, detail="Share link not found or expired")
    return FileResponse(row["path"], filename=row["name"])

@app.get("/api/activity")
async def activity(user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        rows = await (await db.execute('SELECT action, path, actor, created_at, details FROM activity_log ORDER BY id DESC LIMIT 100')).fetchall()
    return {"activity": [dict(row) for row in rows]}

@app.get("/api/index/status")
async def index_status(user: dict = Depends(get_current_user)):
    script = os.path.join(os.path.dirname(__file__), "..", "scripts", "index_files.py")
    log_path = os.path.join(os.path.dirname(__file__), "..", "scripts", "indexer_cron.log")
    db_mtime = os.path.getmtime(DB_PATH) if os.path.exists(DB_PATH) else None
    return {"database_modified": db_mtime, "script_exists": os.path.exists(script), "log_exists": os.path.exists(log_path)}

@app.post("/api/index/reindex")
async def reindex(user: dict = Depends(get_current_user)):
    require_admin(user)
    script = os.path.join(os.path.dirname(__file__), "..", "scripts", "index_files.py")
    if not os.path.exists(script):
        raise HTTPException(status_code=404, detail="Indexer script not found")
    result = subprocess.run(["python3", script], capture_output=True, text=True, timeout=3600)
    await log_activity("reindex", STORAGE_ROOT, user["username"], result.stdout[-500:])
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr[-1000:] or "Indexer failed")
    return {"status": "success", "output": result.stdout[-2000:]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=BACKEND_HOST, port=BACKEND_PORT, reload=True)
