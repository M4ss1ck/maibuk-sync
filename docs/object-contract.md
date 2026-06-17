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
| `kind` | yes | Object type. maibuk: `book`, `note`, `version`, `metric`. |
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
