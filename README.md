# Maibuk Sync Server

PocketBase backend for Maibuk book sync. Stores encrypted blobs — the server never sees plaintext data.

## Quick Start

```bash
docker compose up -d
```

PocketBase will be available at `http://localhost:8090`.

## First-Time Setup

1. Open `http://localhost:8090/_/` to access the admin dashboard
2. Create an admin account
3. The `sync_items` collection is created automatically via migration

## Manual Setup (without Docker)

1. Download PocketBase from https://pocketbase.io/docs/
2. Copy `pb_migrations/` to the same directory as the PocketBase binary
3. Run `./pocketbase serve`

## Collections

### sync_items

| Field            | Type             | Notes                                      |
| ---------------- | ---------------- | ------------------------------------------ |
| `user`           | relation → users | Owner of the sync item                     |
| `book_id`        | text             | Client-side book UUID                      |
| `encrypted_data` | file             | Encrypted blob (max 50MB)                  |
| `checksum`       | text             | SHA-256 of plaintext (for sync comparison) |

Access rules ensure users can only read/write their own sync items.
