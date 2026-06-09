# MyCloud

## Docker

Create your local environment file first:

```bash
cp .env.example app/data/mycloud.env
```

Edit `app/data/mycloud.env` with your local storage path, users, and secret key. Then build and start the full app:

```bash
docker compose --env-file app/data/mycloud.env up --build
```

Open the app at:

```text
${MYCLOUD_PUBLIC_BASE_URL:-http://localhost:3000}
```

Health check:

```text
${MYCLOUD_HEALTH_URL:-http://localhost:3000/api/health}
```

The compose stack runs:

- `frontend`: Nginx serving the built React app and proxying `/api` to the backend.
- `backend`: FastAPI on `${MYCLOUD_BACKEND_PORT:-8000}` inside the Docker network.

Mounted paths:

- `./app/data` -> `/app/data` for SQLite data, thumbnails, and local environment values.
- `./scripts` -> `/app/scripts` so backend admin tools can run the shared scripts.
- `${MYCLOUD_STORAGE_ROOT}` -> `${MYCLOUD_STORAGE_ROOT}` for your storage drive.

Before using this outside your home network, set a strong `MYCLOUD_SECRET_KEY` in `app/data/mycloud.env`.

Network settings can all live in `app/data/mycloud.env`:

```env
MYCLOUD_BIND_IP=192.168.1.50
MYCLOUD_FRONTEND_PORT=3000
MYCLOUD_PUBLIC_BASE_URL=http://192.168.1.50:3000
MYCLOUD_HEALTH_URL=http://192.168.1.50:3000/api/health
MYCLOUD_BACKEND_HOST=0.0.0.0
MYCLOUD_BACKEND_PORT=8000
MYCLOUD_CORS_ORIGINS=http://192.168.1.50:3000
```

## 24/7 watchdog

The Docker services use `restart: unless-stopped` and include healthchecks. To have the host check the app every few hours and restart the stack if it stops responding, install this cron entry:

```bash
crontab -e
```

```cron
0 */3 * * * MYCLOUD_APP_DIR=/path/to/mycloud /path/to/mycloud/scripts/watchdog.sh
```

Watchdog logs are written to:

```text
${MYCLOUD_WATCHDOG_LOG:-app/data/watchdog.log}
```
