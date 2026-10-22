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
3. The `objects` collection is created automatically via migrations

## Manual Setup (without Docker)

1. Download PocketBase 0.25 from https://pocketbase.io/docs/
2. Copy `pb_migrations/` and `pb_hooks/` to the same directory as the PocketBase binary
3. Run `./pocketbase serve`

## Collections

One generic collection, `objects`, stores an encrypted envelope per synced item
(`pb_migrations/007_objects.js`). The rules every client must follow are in
[docs/object-contract.md](docs/object-contract.md).

## Hooks

`pb_hooks/objects.pb.js` clears `content` whenever an object is saved with
`deleted = true`, so a soft delete frees its stored file. Migration
`010_objects_clear_deleted_content.js` does the same once for rows deleted
before the hook existed.

## Tests

```bash
PB_BIN=/path/to/pocketbase test/soft-delete.sh
```

Runs the hook and migration against a throwaway PocketBase (needs `curl` and
`jq`) and prints one `ok` line per case.
