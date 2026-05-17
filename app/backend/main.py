import os
import sqlite3
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends
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
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "stats.db")
SECRET_KEY = "mycloud_super_secure_secret_key_change_me_in_production"

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

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    token = credentials.credentials
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")
    return user

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
        
        cursor = await db.execute("SELECT COUNT(*) FROM users")
        row = await cursor.fetchone()
        if row and row[0] == 0:
            users_to_seed = [
                ("ganesh_admin", "Hello324", "admin", "Ganesh (Admin)"),
                ("ganesh", "Hello324", "user", "Ganesh Eeti"),
                ("haritha", "Hello0611", "user", "Haritha Kothuri")
            ]
            for username, password, role, display_name in users_to_seed:
                hashed, salt = hash_password(password)
                await db.execute('''
                    INSERT INTO users (username, password_hash, salt, role, display_name)
                    VALUES (?, ?, ?, ?, ?)
                ''', (username, hashed, salt, role, display_name))
            await db.commit()
            print("Successfully seeded 3 default accounts in MyCloud database!")
        
        await db.execute('''
            INSERT OR IGNORE INTO favorites (path, type, name) 
            VALUES ('/mnt/Drive1', 'Folder', 'Drive1')
        ''')
        await db.commit()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
            ext = row["extension"]
            ext = ext.lower() if ext else ""
            if ext in IMAGE_EXTENSIONS:
                type_ = "Image"
            elif ext in VIDEO_EXTENSIONS:
                type_ = "Video"
            elif ext in MUSIC_EXTENSIONS:
                type_ = "Music"
            else:
                type_ = "File"
                
            recent.append({
                "name": row["filename"],
                "path": row["filepath"],
                "type": type_,
                "size": row["size_bytes"],
                "modified": row["modified_time"],
                "is_favorite": bool(row["is_favorite"])
            })
            
    return {"recent": recent}

@app.get("/api/files/list")
async def get_files_list(path: str = "/mnt/Drive1", user: dict = Depends(get_current_user)):
    if not os.path.abspath(path).startswith("/mnt/Drive1"):
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not os.path.exists(path) or not os.path.isdir(path):
        raise HTTPException(status_code=404, detail="Directory not found")

    # Fetch favorites to quickly determine favorite status
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute('SELECT path FROM favorites')
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

@app.get("/api/thumbnail")
async def get_thumbnail(path: str, user: dict = Depends(get_current_user)):
    if not os.path.abspath(path).startswith("/mnt/Drive1"):
        raise HTTPException(status_code=403, detail="Access denied")
        
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
    old_path = req.path
    if not os.path.abspath(old_path).startswith("/mnt/Drive1"):
        raise HTTPException(status_code=403, detail="Access denied")
        
    if not os.path.exists(old_path):
        raise HTTPException(status_code=404, detail="File or folder not found")
        
    if not req.new_name or "/" in req.new_name or "\\" in req.new_name:
        raise HTTPException(status_code=400, detail="Invalid new name")
        
    parent_dir = os.path.dirname(old_path)
    new_path = os.path.join(parent_dir, req.new_name)
    
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
    path = req.path
    if not os.path.abspath(path).startswith("/mnt/Drive1"):
        raise HTTPException(status_code=403, detail="Access denied")
        
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File or folder not found")
        
    try:
        if os.path.isdir(path):
            shutil.rmtree(path)
        else:
            os.remove(path)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete on disk: {str(e)}")
        
    # Update DB references
    async with aiosqlite.connect(DB_PATH) as db:
        # Delete from favorites
        await db.execute('DELETE FROM favorites WHERE path = ? OR path LIKE ?', (path, path + '/%'))
        # Delete from files index
        await db.execute('DELETE FROM files WHERE filepath = ? OR filepath LIKE ?', (path, path + '/%'))
        await db.commit()
        
    return {"status": "success"}

@app.get("/api/files/raw")
async def get_raw_file(path: str, user: dict = Depends(get_current_user)):
    if not os.path.abspath(path).startswith("/mnt/Drive1"):
        raise HTTPException(status_code=403, detail="Access denied")
        
    if not os.path.exists(path) or os.path.isdir(path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(path)

@app.get("/api/files/text")
async def get_text_file(path: str, user: dict = Depends(get_current_user)):
    if not os.path.abspath(path).startswith("/mnt/Drive1"):
        raise HTTPException(status_code=403, detail="Access denied")
        
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
    if not os.path.abspath(req.path).startswith("/mnt/Drive1"):
        raise HTTPException(status_code=403, detail="Access denied")
        
    target_dir = os.path.join(req.path, req.folder_name)
    
    if not req.folder_name or "/" in req.folder_name or "\\" in req.folder_name:
        raise HTTPException(status_code=400, detail="Invalid folder name")
        
    if os.path.exists(target_dir):
        raise HTTPException(status_code=400, detail="Folder already exists")
        
    try:
        os.makedirs(target_dir, exist_ok=True)
        return {"status": "success", "path": target_dir}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/files/upload")
async def upload_file(path: str = Form(...), file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not os.path.abspath(path).startswith("/mnt/Drive1"):
        raise HTTPException(status_code=403, detail="Access denied")
        
    if not os.path.exists(path) or not os.path.isdir(path):
        raise HTTPException(status_code=400, detail="Target path is not a directory")
        
    target_filepath = os.path.join(path, file.filename)
    
    try:
        with open(target_filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        stat_info = os.stat(target_filepath)
        size = stat_info.st_size
        mod_time = datetime.fromtimestamp(stat_info.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        ext = os.path.splitext(file.filename)[1].lower().replace(".", "")
        
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute('''
                INSERT OR REPLACE INTO files (filename, filepath, extension, size_bytes, modified_time)
                VALUES (?, ?, ?, ?, ?)
            ''', (file.filename, target_filepath, ext, size, mod_time))
            await db.commit()
            
        return {"status": "success", "filepath": target_filepath}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
            await db.execute('''
                INSERT OR REPLACE INTO favorites (path, type, name) 
                VALUES (?, ?, ?)
            ''', (item.path, item.type, item.name))
        await db.commit()
    return {"status": "success", "count": len(req.items)}

@app.post("/api/files/bulk-delete")
async def bulk_delete(req: BulkDeleteRequest, user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        deleted_count = 0
        for path in req.paths:
            if not os.path.abspath(path).startswith("/mnt/Drive1"):
                continue
            if os.path.exists(path):
                try:
                    if os.path.isdir(path):
                        shutil.rmtree(path)
                    else:
                        os.remove(path)
                    
                    await db.execute('DELETE FROM files WHERE filepath = ? OR filepath LIKE ?', (path, path + '/%'))
                    await db.execute('DELETE FROM favorites WHERE path = ? OR path LIKE ?', (path, path + '/%'))
                    deleted_count += 1
                except Exception as e:
                    print(f"Error deleting {path}: {e}")
                    
        await db.commit()
    return {"status": "success", "count": deleted_count}

@app.post("/api/files/bulk-download")
async def bulk_download(req: BulkDeleteRequest, user: dict = Depends(get_current_user)):
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for path in req.paths:
            if not os.path.abspath(path).startswith("/mnt/Drive1"):
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
