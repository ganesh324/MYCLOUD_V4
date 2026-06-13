#!/usr/bin/env python3
import argparse
import hashlib
import os
import subprocess
import time
from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = APP_DIR / "data" if (APP_DIR / "data").exists() else APP_DIR / "app" / "data"
DATA_DIR = Path(os.environ.get("MYCLOUD_DATA_DIR", DEFAULT_DATA_DIR))
ENV_PATH = Path(os.environ.get("MYCLOUD_ENV_FILE", DATA_DIR / "mycloud.env"))
VIDEO_EXTENSIONS = {"3gp", "avi", "mkv", "mov", "mp4", "mts", "mxf", "vob", "wmv"}
THUMB_PROFILE = "video-sq384-q88-v1"
TRASH_DIR_NAME = ".mycloud_trash"


def load_env_file(path: Path):
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file(ENV_PATH)

STORAGE_ROOT = Path(os.environ.get("MYCLOUD_STORAGE_ROOT", "/mnt/Drive1")).resolve()
THUMBNAILS_DIR = Path(os.environ.get("MYCLOUD_THUMBNAILS_DIR", DATA_DIR / "thumbnails")).resolve()
TRASH_ROOT = STORAGE_ROOT / TRASH_DIR_NAME


def is_video(path: Path) -> bool:
    return path.is_file() and path.suffix.lower().lstrip(".") in VIDEO_EXTENSIONS


def is_trash_path(path: Path) -> bool:
    try:
        path.resolve().relative_to(TRASH_ROOT.resolve())
        return True
    except ValueError:
        return False


def thumbnail_path(path: Path) -> Path:
    stat = path.stat()
    cache_key = f"{path}:{stat.st_size}:{stat.st_mtime_ns}:{THUMB_PROFILE}"
    path_hash = hashlib.md5(cache_key.encode("utf-8")).hexdigest()
    return THUMBNAILS_DIR / f"{path_hash}.jpg"


def generate_thumbnail(path: Path, overwrite: bool = False) -> bool:
    try:
        output_path = thumbnail_path(path)
    except OSError as exc:
        print(f"skip {path}: {exc}", flush=True)
        return False

    if output_path.exists() and not overwrite:
        return False

    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_suffix(".tmp.jpg")
    last_error = "ffmpeg did not produce a frame"
    for timestamp in ("00:00:03", "00:00:01", "00:00:00.1"):
        tmp_path.unlink(missing_ok=True)
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            timestamp,
            "-i",
            str(path),
            "-frames:v",
            "1",
            "-vf",
            "scale=384:384:force_original_aspect_ratio=increase,crop=384:384,format=yuvj420p",
            "-q:v",
            "3",
            "-threads",
            "1",
            str(tmp_path),
        ]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, timeout=60)
            if tmp_path.exists():
                tmp_path.replace(output_path)
                print(f"thumbnail {path} -> {output_path}", flush=True)
                return True
        except subprocess.CalledProcessError as exc:
            last_error = exc.stderr.strip() or str(exc)
        except (OSError, subprocess.TimeoutExpired) as exc:
            last_error = str(exc)
    tmp_path.unlink(missing_ok=True)
    print(f"failed {path}: {last_error}", flush=True)
    return False


def iter_videos(root: Path):
    for current_root, dirs, files in os.walk(root):
        current_path = Path(current_root)
        if is_trash_path(current_path):
            dirs[:] = []
            continue
        dirs[:] = [d for d in dirs if d != TRASH_DIR_NAME]
        for filename in files:
            path = current_path / filename
            if is_video(path):
                yield path


def run_once(overwrite: bool = False) -> int:
    created = 0
    seen = 0
    print(f"Scanning videos under {STORAGE_ROOT}", flush=True)
    for path in iter_videos(STORAGE_ROOT):
        seen += 1
        if generate_thumbnail(path, overwrite=overwrite):
            created += 1
    print(f"Done. Videos seen: {seen}. Thumbnails created: {created}.", flush=True)
    return created


def watch(interval: int, overwrite: bool = False):
    while True:
        run_once(overwrite=overwrite)
        time.sleep(interval)


def main():
    parser = argparse.ArgumentParser(description="Create cached thumbnails for videos in MyCloud storage.")
    parser.add_argument("--watch", action="store_true", help="keep scanning for new or modified videos")
    parser.add_argument("--interval", type=int, default=int(os.environ.get("MYCLOUD_THUMBNAIL_SCAN_INTERVAL", "120")))
    parser.add_argument("--overwrite", action="store_true", help="recreate thumbnails even if the cache file exists")
    args = parser.parse_args()

    if args.watch:
        watch(max(10, args.interval), overwrite=args.overwrite)
    else:
        run_once(overwrite=args.overwrite)


if __name__ == "__main__":
    main()
