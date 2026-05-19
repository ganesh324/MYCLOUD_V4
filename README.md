# MyCloud

## Docker

Build and start the full app:

```bash
docker compose up --build
```

Open the app at:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/api/health
```

The compose stack runs:

- `frontend`: Nginx serving the built React app and proxying `/api` to the backend.
- `backend`: FastAPI on port `8000` inside the Docker network.

Mounted paths:

- `./app/data` -> `/app/data` for SQLite data and thumbnails.
- `/mnt/Drive1` -> `/mnt/Drive1` for your storage drive.

Before using this outside your home network, copy `.env.example` to `.env` and set a strong `MYCLOUD_SECRET_KEY`.

## 24/7 watchdog

The Docker services use `restart: unless-stopped` and include healthchecks. To have the host check the app every few hours and restart the stack if it stops responding, install this cron entry:

```bash
crontab -e
```

```cron
0 */3 * * * /home/ganesh/mycloud/scripts/watchdog.sh
```

Watchdog logs are written to:

```text
/home/ganesh/mycloud/app/data/watchdog.log
```
