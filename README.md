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
3. The `sync_items` and `version_items` collections are created automatically via migrations

## Manual Setup (without Docker)

1. Download PocketBase from https://pocketbase.io/docs/
2. Copy `pb_migrations/` to the same directory as the PocketBase binary
3. Run `./pocketbase serve`

## Collections

### sync_items

Live-document store — one row per book, last-write-wins.

| Field            | Type             | Notes                                      |
| ---------------- | ---------------- | ------------------------------------------ |
| `user`           | relation → users | Owner of the sync item                     |
| `book_id`        | text             | Client-side book UUID                      |
| `encrypted_data` | file             | Encrypted blob (max 50MB)                  |
| `checksum`       | text             | SHA-256 of plaintext (for sync comparison) |

Access rules ensure users can only read/write their own sync items.

### version_items

Point-in-time snapshots — append-only, immutable, one row per saved version.
Sync is a pure union (push local-only, pull remote-only), so records are
create-only from the client. Admins can still delete via the dashboard.

| Field                | Type             | Notes                                              |
| -------------------- | ---------------- | -------------------------------------------------- |
| `user`               | relation → users | Owner                                              |
| `version_id`         | text             | Client-side version UUID (unique per user)         |
| `book_id`            | text             | Client-side book UUID                              |
| `encrypted_data`     | file             | Encrypted `serializeBook()` JSON blob (max 50MB)   |
| `checksum`           | text             | SHA-256 of plaintext (verified before client insert) |
| `version_name`       | text             | Nullable — set for named versions, null for auto   |
| `version_trigger`    | text             | `manual` / `auto-idle` / `close` / `pre-sync` / `pre-restore` |
| `version_created_at` | number           | Original local `created_at` (Unix seconds)         |
| `word_count`         | number           | Word count at snapshot time                        |

Access rules: list/view/create scoped to `user = @request.auth.id`; update and
delete blocked at the API (admin-only).
