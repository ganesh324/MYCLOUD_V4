# MyCloud Future Plans

## Cloud Drive Integrations

Add Google Drive and OneDrive as external storage providers inside MyCloud.

### Goal

Users should be able to connect their own cloud accounts and browse cloud files from the MyCloud UI without copying everything into the NAS by default.

### Providers

- Google Drive
- Microsoft OneDrive

### Authentication

Use OAuth per MyCloud user.

Required environment values:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
CLOUD_REDIRECT_BASE_URL=http://localhost:3000
```

Local redirect URLs:

```text
http://localhost:3000/api/cloud/google/callback
http://localhost:3000/api/cloud/onedrive/callback
```

### UI Placement

Add these entries to the left sidebar:

- Google Drive
- OneDrive

These should appear below the existing local file sections such as All Files, Shared, and Trash.

### Expected Features

- Connect or disconnect cloud account.
- Browse cloud folders and files.
- Download/open cloud files.
- Upload files from MyCloud to Google Drive or OneDrive.
- Import selected cloud files into local NAS storage.
- Optional later: sync selected cloud folders into local paths like `/mnt/Drive1/Cloud/GoogleDrive/...`.

### Permissions Model

Local NAS permissions stay in the MyCloud database.

Cloud permissions should remain controlled by Google or Microsoft. A MyCloud user should only see the cloud account they personally connected, unless a later admin-level shared cloud integration is explicitly added.

### Backend Plan

Add tables for cloud accounts and tokens:

```sql
CREATE TABLE cloud_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  provider TEXT NOT NULL,
  account_email TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(username, provider)
);
```

Add API routes:

- `GET /api/cloud/providers`
- `GET /api/cloud/google/auth`
- `GET /api/cloud/google/callback`
- `GET /api/cloud/onedrive/auth`
- `GET /api/cloud/onedrive/callback`
- `GET /api/cloud/{provider}/list`
- `GET /api/cloud/{provider}/download`
- `POST /api/cloud/{provider}/upload`
- `POST /api/cloud/{provider}/import`
- `DELETE /api/cloud/{provider}/disconnect`

### Notes

Google Drive can use the Drive API `files.list` flow.

OneDrive can use Microsoft Graph drive items, especially folder children endpoints such as `/me/drive/root:/path:/children`.
