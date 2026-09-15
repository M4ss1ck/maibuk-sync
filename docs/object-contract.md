# `objects` collection - client-side contract

The sync server is blob-agnostic: it stores a generic envelope and enforces only
that an authenticated user reads/writes their own rows. Every app-specific rule
below is enforced by CLIENTS, not the server. A violation will be accepted by
the server and can silently corrupt sync. Any app integrating with this server
MUST follow this contract.

## Envelope fields

| Field | Plaintext? | Meaning |
|-------|-----------|---------|
| `user` | yes | Owner relation (auth). |
| `app_name` | yes | Owning app id (e.g. `maibuk`). Set on every write. |
| `kind` | yes | Object type. maibuk: `book`, `note`, `canvas`, `version`, `metric`. |
| `key` | yes | Dedup/upsert identity within `(user, app_name, kind)`. |
| `group` | yes | Optional secondary filter. maibuk: set on `version` (= bookId) only. |
| `checksum` | yes | Content hash for change detection without download. |
| `deleted` | yes | Soft-delete flag. |
| `meta` | ENCRYPTED | Opaque descriptive metadata (names, counts, timestamps...). |
| `content` | ENCRYPTED | Opaque payload blob (<=50MB), optional. |
| `created`/`updated` | yes (server) | Autodates; `updated` drives `updated > since` pulls. |

## Rules

1. `kind` vocabulary is fixed per app; new types add a documented `kind`, not a server change.
2. Only `app_name`, `kind`, `key`, `group`, `checksum`, `deleted` may be plaintext. All descriptive data goes in encrypted `meta`/`content`.
3. `version` and `metric` objects are immutable -- never rewrite their content; corrections are new objects.
4. Deletes are soft: set `deleted = true`. Never hard-delete (peers learn of removals via incremental pull).
5. List-and-compare reads filter `deleted = false`; incremental (`updated > since`) reads must NOT filter `deleted`.
6. The encrypted `meta` envelope embeds a `v` (formatVersion); bump it on envelope changes. The server never gates format.

## maibuk kinds

| `kind` | `key` | `group` | Mutable? | `content` |
|--------|-------|---------|----------|-----------|
| `book` | book id | unset | yes | Whole book snapshot (book + chapters). |
| `note` | note id | unset | yes | Whole note snapshot. |
| `canvas` | canvas id | unset | yes | Whole canvas document (nodes, edges, embedded images). |
| `version` | version id | book id | no (rule 3) | Book version snapshot. |
| `metric` | client row id | unset | no (rule 3) | Writing metric row (in `meta`). |

### `canvas`

- One object per canvas, synced as a whole document: a concurrent edit on two devices is a whole-canvas conflict, never a per-node merge.
- The viewport (pan and zoom) is device-local. It is excluded from `content` and from `checksum`, so moving the view never changes the object.
- The payload carries its own `schemaVersion`. A client that pulls a canvas with a newer `schemaVersion` than it understands stores it read-only and never pushes it back.
- Note references inside a canvas point at `note` keys. Deleting a note never rewrites canvases; the reference is kept and shown as missing.
- Embedded images can make a canvas several MB. The 50MB `content` limit (`pb_migrations/007_objects.js`) applies unchanged; clients do not cap size themselves and surface the server's rejection as a sync error.
- Deleting a canvas follows rule 4 (`deleted = true`).
