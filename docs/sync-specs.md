# Sync Feature — Implementation Plan

## Context

Maibuk is offline-first. Users need to sync book progress across devices. This adds sync via **PocketBase** with **client-side E2E encryption** (AES-GCM-256). The server never sees plaintext. Sync is manual (button press), per-book, with last-write-wins conflict resolution using `updatedAt` timestamps.

---

## Part 1: Server (`/home/massick/Trabajo/web/maibuk-sync`)

### Files to create

**`Dockerfile`**

- Alpine base, download PocketBase v0.25.0 binary
- Copy `pb_migrations/` and `pb_hooks/` into container
- Expose 8090, serve with `--http=0.0.0.0:8090`

**`docker-compose.yml`**

- Single `pocketbase` service, port 8090, `pb_data` volume for persistence

**`.env.example`**

- `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD`

**`pb_migrations/001_sync_items.js`**

- Creates `sync_items` collection with fields:
  - `user` (relation → users, required)
  - `book_id` (text, required)
  - `encrypted_data` (file, max 50MB)
  - `checksum` (text — SHA-256 of plaintext, for sync comparison)
- API rules: list/view `@request.auth.id = user.id`, create `@request.auth.id != ""`, update/delete `@request.auth.id = user.id`

**`pb_hooks/`** — empty directory (placeholder)

**`README.md`** — Setup instructions (docker compose up, admin account, OAuth config)

### Verify

- `docker compose up` → PocketBase on :8090
- Create admin account, verify `sync_items` collection in admin UI

---

## Part 2: Client Foundation (maibuk app)

### Step 2a: Install dependency

- `pnpm add pocketbase`

### Step 2b: Types (`src/features/sync/types.ts`)

```typescript
export type AuthStatus = "logged-out" | "logged-in";
export type SyncStatus = "idle" | "syncing" | "error" | "success";

export interface SyncItemMeta {
  remoteId: string; // PocketBase record ID
  bookId: string;
  checksum: string;
  updatedAt: number; // Unix seconds
}

export interface BookSnapshot {
  book: {
    id: string;
    title: string;
    subtitle: string;
    authorName: string;
    description: string;
    genre: string;
    language: string;
    coverData: string;
    wordCount: number;
    targetWordCount: number;
    status: string;
    createdAt: number;
    updatedAt: number;
  };
  chapters: Array<{
    id: string;
    bookId: string;
    title: string;
    content: string | null;
    synopsis: string;
    order: number;
    parentId: string | null;
    chapterType: string;
    wordCount: number;
    status: string;
    isIncludedInExport: boolean;
    createdAt: number;
    updatedAt: number;
  }>;
}
```

### Step 2c: Crypto (`src/features/sync/crypto.ts`)

Uses Web Crypto API (available in both Tauri webview and browser):

- `deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey>` — PBKDF2, 600k iterations, SHA-256 → AES-GCM-256
- `encrypt(plaintext: string, passphrase: string): Promise<Uint8Array>` — generates random salt (16B) + IV (12B), returns `[salt][iv][ciphertext]`
- `decrypt(blob: Uint8Array, passphrase: string): Promise<string>` — extracts salt/IV, derives key, decrypts
- `computeChecksum(data: string): Promise<string>` — SHA-256, returns hex string

### Step 2d: Serializer (`src/features/sync/serializer.ts`)

- `serializeBook(bookId: string): Promise<string>` — uses `getDatabase()`, raw SQL to fetch book + all chapters, returns JSON string of `BookSnapshot`
- `applyBookSnapshot(snapshot: BookSnapshot): Promise<void>` — upserts book row + all chapter rows via raw SQL (INSERT OR REPLACE)
  - Reloads book/chapter stores after applying

### Step 2e: PocketBase Client (`src/features/sync/client.ts`)

- Module-level `PocketBase` instance (lazy-initialized with URL from store)
- `initClient(url: string): void` — creates/updates PB instance
- `login(email: string, password: string): Promise<AuthModel>`
- `register(email: string, password: string): Promise<AuthModel>`
- `loginWithOAuth(provider: string): Promise<AuthModel>`
- `logout(): void`
- `isAuthenticated(): boolean`
- `pushBookBlob(bookId: string, encryptedData: Blob, checksum: string): Promise<void>` — creates or updates `sync_items` record
- `pullBookBlob(bookId: string): Promise<{ data: Blob; checksum: string } | null>`
- `listRemoteBooks(): Promise<SyncItemMeta[]>`
- `getAuthToken(): string | null` — for restoring auth on app restart

### Step 2f: Sync Engine (`src/features/sync/sync-engine.ts`)

- `syncBook(bookId: string, passphrase: string): Promise<void>`:
  1. Serialize local book → JSON
  2. Compute local checksum
  3. Fetch remote metadata for this `book_id`
  4. **No remote** → encrypt & push
  5. **Checksums match** → skip (already synced)
  6. **Differ** → compare local `updatedAt` vs remote `updatedAt`:
     - Local newer → encrypt & push
     - Remote newer → pull blob, decrypt, apply snapshot
- `syncAllBooks(passphrase: string): Promise<void>`:
  1. Load all local books
  2. Fetch all remote `sync_items` metadata
  3. For each local book: `syncBook()`
  4. For remote-only books (not local): pull, decrypt, apply

### Step 2g: Zustand Store (`src/features/sync/store.ts`)

Follows settings store pattern with `persist` middleware:

```typescript
interface SyncStore {
  // State
  authStatus: AuthStatus;
  userEmail: string | null;
  authToken: string | null; // PB auth token for session restore
  syncStatus: SyncStatus;
  lastSyncedAt: number | null; // Unix seconds
  syncError: string | null;
  apiUrl: string;
  bookSyncMeta: Record<string, SyncItemMeta>;

  // Actions (set() only, async actions use external functions)
  setApiUrl: (url: string) => void;
  setAuthState: (
    status: AuthStatus,
    email: string | null,
    token: string | null,
  ) => void;
  clearAuth: () => void;
  setSyncStatus: (status: SyncStatus, error?: string | null) => void;
  setLastSynced: (timestamp: number) => void;
  updateBookMeta: (bookId: string, meta: SyncItemMeta) => void;
}
```

- Storage key: `"maibuk-sync"`
- On rehydrate: restore PB auth token if present

**Important**: Async operations (login, sync) live in `sync-engine.ts` and `client.ts`, NOT inside the store. Store only holds state and simple setters.

### Step 2h: Barrel export (`src/features/sync/index.ts`)

### Verify

- Import crypto functions, test encrypt/decrypt roundtrip in browser console
- Import client, test login against running PocketBase instance

---

## Part 3: Client UI

### `src/components/sync/SyncStatusButton.tsx`

- Fixed position: `fixed bottom-4 right-4 z-50`
- Cloud icon from `lucide-react` (`Cloud`, `CloudOff`, `Loader2`)
- Visual states: logged-out (gray), idle (default), syncing (spinning), success (green flash), error (red)
- Click: if logged out → open `AuthDialog`; if logged in → open `SyncPanel`
- Small badge/dot indicator for status

### `src/components/sync/AuthDialog.tsx`

- Uses existing `Modal`, `Input`, `Button`
- Fields: Server URL (pre-filled from store), Email, Password
- Toggle between Login / Register modes
- Google OAuth button (calls `loginWithOAuth("google")`)
- On success: close dialog, update store auth state
- Error display for invalid credentials

### `src/components/sync/PassphraseDialog.tsx`

- Uses existing `Modal`, `Input`, `Button`
- Single password input for encryption passphrase
- Warning text: "This passphrase encrypts your data. If lost, synced data cannot be recovered."
- On submit: stores passphrase in module-level variable (memory only), triggers sync
- Shown automatically when user tries to sync without active passphrase

### `src/components/sync/SyncPanel.tsx`

- Popover/dropdown anchored to `SyncStatusButton`
- Shows: user email, last synced time (relative), sync status
- "Sync All" button
- Per-book sync status list (scrollable if many books)
- Logout button
- Error message display if last sync failed

### Wire into App.tsx

Add `<SyncStatusButton />` after `<Routes>` inside `<StartupRedirect>`:

```tsx
<StartupRedirect>
  <PathTracker />
  <Routes>...</Routes>
  <SyncStatusButton />
</StartupRedirect>
```

### Verify

- Sync button visible on all pages (home, settings, editor, cover designer)
- Full flow: login → passphrase → sync → verify encrypted blob in PocketBase admin

---

## Part 4: Settings + i18n

### `src/pages/Settings.tsx`

Add "Sync" section (after General, before Editor):

- Server URL input (bound to `useSyncStore().apiUrl`)
- Account status: shows email if logged in, login button if not
- Info text about E2E encryption and passphrase

### Translation keys (`src/locales/en.json` + `src/locales/es.json`)

Add `sync.*` namespace:

- `sync.title` — "Sync" / "Sincronización"
- `sync.serverUrl` — "Server URL" / "URL del servidor"
- `sync.login` / `sync.register` / `sync.logout`
- `sync.email` / `sync.password`
- `sync.signInWithGoogle`
- `sync.syncAll` / `sync.syncing` / `sync.lastSynced` / `sync.neverSynced`
- `sync.passphrase` / `sync.passphraseHint` / `sync.enterPassphrase`
- `sync.syncSuccess` / `sync.syncError` / `sync.notLoggedIn`
- `sync.encryptionWarning`

### Verify

- Settings page shows sync section
- Switching language (en↔es) updates all sync strings

---

## Part 5: Polish & AGENTS.md

- Update `AGENTS.md` feature module list to include `sync/`
- Handle offline state (check navigator.onLine before sync, show appropriate error)
- Handle PocketBase token expiry (catch 401, clear auth, prompt re-login)
- Test OAuth flow in Tauri webview (fallback: email/password only)

---

## Files Modified (Summary)

| File                     | Change                      |
| ------------------------ | --------------------------- |
| `package.json`           | Add `pocketbase` dependency |
| `src/App.tsx`            | Add `<SyncStatusButton />`  |
| `src/pages/Settings.tsx` | Add Sync section            |
| `src/locales/en.json`    | Add `sync.*` keys           |
| `src/locales/es.json`    | Add `sync.*` keys           |
| `AGENTS.md`              | Add sync feature docs       |

## Files Created (Summary)

| File                                       | Purpose                     |
| ------------------------------------------ | --------------------------- |
| `src/features/sync/types.ts`               | Type definitions            |
| `src/features/sync/crypto.ts`              | E2E encryption (Web Crypto) |
| `src/features/sync/serializer.ts`          | Book ↔ JSON serialization   |
| `src/features/sync/client.ts`              | PocketBase SDK wrapper      |
| `src/features/sync/sync-engine.ts`         | Sync orchestration logic    |
| `src/features/sync/store.ts`               | Zustand persist store       |
| `src/features/sync/index.ts`               | Barrel exports              |
| `src/components/sync/SyncStatusButton.tsx` | Floating sync button        |
| `src/components/sync/AuthDialog.tsx`       | Login/register modal        |
| `src/components/sync/PassphraseDialog.tsx` | Passphrase entry modal      |
| `src/components/sync/SyncPanel.tsx`        | Sync status popover         |

## Passphrase Handling

- **Never persisted** — not in localStorage, SQLite, or sync store
- Module-level variable in `crypto.ts`: `let sessionPassphrase: string | null = null`
- `setPassphrase(p)` / `getPassphrase()` / `clearPassphrase()` exports
- Cleared on logout and app close
- UI prompts via `PassphraseDialog` when needed

## Implementation Order

1. Part 1 (Server) → verify with docker
2. Part 2a-2c (deps, types, crypto) → verify encrypt/decrypt
3. Part 2d-2f (serializer, client, engine) → verify against running PB
4. Part 2g-2h (store, barrel) → verify state management
5. Part 3 (UI components) → verify full flow
6. Part 4 (settings, i18n) → verify UI
7. Part 5 (polish) → final testing
