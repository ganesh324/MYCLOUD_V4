import os
import sqlite3
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import aiosqlite

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "stats.db")

@asynccontextmanager
async def lifespan(app: FastAPI):
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

@app.get("/api/recent")
async def get_recent_activity():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        
        cursor = await db.execute('''
            SELECT filename, extension, size_bytes, modified_time 
            FROM files 
            ORDER BY modified_time DESC 
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
                "type": type_,
                "size": row["size_bytes"],
                "modified": row["modified_time"]
            })
            
    return {"recent": recent}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
