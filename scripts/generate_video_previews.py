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
PREVIEW_EXTENSIONS = {"mts"}
PREVIEW_PROFILE = "mp4-preview-h264-aac-v1"
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
PREVIEWS_DIR = Path(os.environ.get("MYCLOUD_VIDEO_PREVIEWS_DIR", DATA_DIR / "video_previews")).resolve()
TRASH_ROOT = STORAGE_ROOT / TRASH_DIR_NAME


def resolve_storage_path(path: Path) -> Path:
    resolved = path.resolve()
    resolved.relative_to(STORAGE_ROOT)
    return resolved


def is_preview_source(path: Path) -> bool:
    return path.is_file() and path.suffix.lower().lstrip(".") in PREVIEW_EXTENSIONS


def is_trash_path(path: Path) -> bool:
    try:
        path.resolve().relative_to(TRASH_ROOT.resolve())
        return True
    except ValueError:
        return False


def preview_path(path: Path) -> Path:
    stat = path.stat()
    cache_key = f"{path}:{stat.st_size}:{stat.st_mtime_ns}:{PREVIEW_PROFILE}"
    path_hash = hashlib.md5(cache_key.encode("utf-8")).hexdigest()
    return PREVIEWS_DIR / f"{path_hash}.mp4"


def run_ffmpeg(path: Path, tmp_path: Path, copy_video: bool):
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(path),
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-sn",
        "-dn",
    ]
    if copy_video:
        cmd += ["-c:v", "copy"]
    else:
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p"]
    cmd += ["-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(tmp_path)]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, timeout=60 * 60)


def generate_preview(path: Path, overwrite: bool = False) -> bool:
    try:
        output_path = preview_path(path)
    except OSError as exc:
        print(f"skip {path}: {exc}", flush=True)
        return False

    if output_path.exists() and not overwrite:
        return False

    PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_suffix(".tmp.mp4")
    last_error = "ffmpeg did not create a preview"
    for copy_video in (True, False):
        tmp_path.unlink(missing_ok=True)
        try:
            run_ffmpeg(path, tmp_path, copy_video=copy_video)
            if tmp_path.exists() and tmp_path.stat().st_size > 0:
                tmp_path.replace(output_path)
                print(f"preview {path} -> {output_path}", flush=True)
                return True
        except subprocess.CalledProcessError as exc:
            last_error = exc.stderr.strip() or str(exc)
        except (OSError, subprocess.TimeoutExpired) as exc:
            last_error = str(exc)

    tmp_path.unlink(missing_ok=True)
    print(f"failed {path}: {last_error}", flush=True)
    return False


def iter_sources(root: Path):
    for current_root, dirs, files in os.walk(root):
        current_path = Path(current_root)
        if is_trash_path(current_path):
            dirs[:] = []
            continue
        dirs[:] = [d for d in dirs if d != TRASH_DIR_NAME]
        for filename in files:
            path = current_path / filename
            if is_preview_source(path):
                yield path


def run_once(overwrite: bool = False) -> int:
    created = 0
    seen = 0
    print(f"Scanning MTS videos under {STORAGE_ROOT}", flush=True)
    for path in iter_sources(STORAGE_ROOT):
        seen += 1
        if generate_preview(path, overwrite=overwrite):
            created += 1
    print(f"Done. MTS videos seen: {seen}. MP4 previews created: {created}.", flush=True)
    return created


def watch(interval: int, overwrite: bool = False):
    while True:
        run_once(overwrite=overwrite)
        time.sleep(interval)


def main():
    parser = argparse.ArgumentParser(description="Create browser-playable MP4 previews for MTS videos.")
    parser.add_argument("--path", help="convert one video path inside MYCLOUD_STORAGE_ROOT")
    parser.add_argument("--watch", action="store_true", help="keep scanning for new or modified MTS videos")
    parser.add_argument("--interval", type=int, default=int(os.environ.get("MYCLOUD_VIDEO_PREVIEW_SCAN_INTERVAL", "300")))
    parser.add_argument("--overwrite", action="store_true", help="recreate previews even if the cache file exists")
    args = parser.parse_args()

    if args.path:
        try:
            path = resolve_storage_path(Path(args.path))
        except ValueError:
            raise SystemExit("path is outside MYCLOUD_STORAGE_ROOT")
        if not is_preview_source(path):
            raise SystemExit("path is not a supported preview source")
        generate_preview(path, overwrite=args.overwrite)
    elif args.watch:
        watch(max(30, args.interval), overwrite=args.overwrite)
    else:
        run_once(overwrite=args.overwrite)


if __name__ == "__main__":
    main()
