import os
import sqlite3
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import aiosqlite
import hashlib
from fastapi.responses import FileResponse
from PIL import Image
import shutil

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "stats.db")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure thumbnails directory exists
    os.makedirs(os.path.join(os.path.dirname(__file__), "..", "data", "thumbnails"), exist_ok=True)
    
    # Initialize the favorites table on startup
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS favorites (
                path TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                name TEXT NOT NULL
            )
        ''')
        
        # Seed default Drive1 favorite if not present
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

class FavoriteToggleRequest(BaseModel):
    path: str
    type: str
    name: str

@app.get("/api/stats")
async def get_stats():
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
        cursor = await db.execute("SELECT COUNT(DISTINCT substr(filepath, 1, length(filepath) - length(filename))) as folder_count FROM files")
        folder_row = await cursor.fetchone()
        if folder_row:
            stats["folders"] = folder_row["folder_count"]

    return stats

@app.get("/api/favorites")
async def get_favorites():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        cursor = await db.execute('SELECT path, type, name FROM favorites')
        rows = await cursor.fetchall()
        favorites = [{"path": row["path"], "type": row["type"], "name": row["name"]} for row in rows]
    return {"favorites": favorites}

@app.post("/api/favorites/toggle")
async def toggle_favorite(req: FavoriteToggleRequest):
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
async def get_recent_activity():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        
        # We perform a LEFT JOIN to check if the file is in the favorites table
        cursor = await db.execute('''
            SELECT f.filename, f.filepath, f.extension, f.size_bytes, f.modified_time,
                   CASE WHEN fav.path IS NOT NULL THEN 1 ELSE 0 END as is_favorite
            FROM files f
            LEFT JOIN favorites fav ON f.filepath = fav.path
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
async def get_files_list(path: str = "/mnt/Drive1"):
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
async def get_thumbnail(path: str):
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
async def rename_file(req: RenameRequest):
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
async def delete_file(req: DeleteRequest):
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
