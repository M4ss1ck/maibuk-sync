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
3. The `sync_items`, `version_items`, `metrics_events_rows`, and
   `metrics_tombstones_rows` collections are created automatically via
   migrations

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

### metrics_events_rows

Append-only row-level metrics sync. Each record stores one client-generated
metric event. Metadata stays plaintext for incremental `updated > since` pulls;
the event payload is encrypted client-side and stored as base64 text.

| Field               | Type             | Notes                                      |
| ------------------- | ---------------- | ------------------------------------------ |
| `user`              | relation → users | Owner                                      |
| `created`           | autodate         | Server insert time                         |
| `updated`           | autodate         | Server update time; used for pull cursors  |
| `client_id`         | text             | Client-side event UUID, unique per user    |
| `device_id`         | text             | Originating device UUID                    |
| `timestamp`         | text             | Event time, ISO 8601 UTC                   |
| `local_date`        | text             | Event date in the user's local timezone    |
| `tz_offset_min`     | number           | Local UTC offset in minutes                |
| `event_type`        | text             | `writing.*`, `session.*`, reserved `ai.*`  |
| `work_id`           | text             | Nullable book/work UUID                    |
| `schema_version`    | number           | Event payload schema version               |
| `encrypted_payload` | text             | Base64 encrypted JSON payload              |

Access rules: list/view/create scoped to `user = @request.auth.id`; update and
delete blocked at the API. Unique index on `(user, client_id)` deduplicates
multi-device pushes; `(user, updated)` supports incremental pulls.

### metrics_tombstones_rows

Append-only tombstones for deleted metric events. Tombstones let opt-out purges
propagate across devices without resurrecting events that still exist elsewhere.

| Field        | Type             | Notes                                      |
| ------------ | ---------------- | ------------------------------------------ |
| `user`       | relation → users | Owner                                      |
| `created`    | autodate         | Server insert time                         |
| `updated`    | autodate         | Server update time; used for pull cursors  |
| `client_id`  | text             | Deleted event UUID, unique per user        |
| `device_id`  | text             | Device that performed the delete           |
| `deleted_at` | text             | Deletion time, ISO 8601 UTC                |
| `reason`     | text             | `category-opt-out`, `user-purge`, etc.     |

Access rules and indexes mirror `metrics_events_rows`.
