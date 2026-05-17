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

The compose stack runs:

- `frontend`: Nginx serving the built React app and proxying `/api` to the backend.
- `backend`: FastAPI on port `8000` inside the Docker network.

Mounted paths:

- `./app/data` -> `/app/data` for SQLite data and thumbnails.
- `/mnt/Drive1` -> `/mnt/Drive1` for your storage drive.

Before using this outside your home network, copy `.env.example` to `.env` and set a strong `MYCLOUD_SECRET_KEY`.
