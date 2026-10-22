#!/usr/bin/env bash
# Integration test for pb_hooks/objects.pb.js and migration 010 against a real
# PocketBase. Usage: PB_BIN=/path/to/pocketbase test/soft-delete.sh
# Needs curl and jq. Uses a throwaway data dir and port; touches nothing else.
set -euo pipefail

PB_BIN=${PB_BIN:?set PB_BIN to a PocketBase 0.25 binary}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
PORT=${PORT:-18090}
URL="http://127.0.0.1:$PORT"
PID=""
trap '[ -n "$PID" ] && kill "$PID" 2>/dev/null; rm -rf "$WORK"' EXIT

fail() { echo "FAIL: $*"; exit 1; }
pass() { echo "ok - $*"; }

start() { # $1 migrations dir, $2 hooks dir
  "$PB_BIN" serve --dir "$WORK/data" --migrationsDir "$1" --hooksDir "$2" \
    --http "127.0.0.1:$PORT" >"$WORK/pb.log" 2>&1 &
  PID=$!
  for _ in $(seq 50); do curl -sf "$URL/api/health" >/dev/null && return; sleep 0.2; done
  cat "$WORK/pb.log"; fail "PocketBase did not start"
}
stop() { kill "$PID"; wait "$PID" 2>/dev/null || true; PID=""; }
files() { find "$WORK/data/storage" -type f -name '*.bin' 2>/dev/null | wc -l; }

auth() {
  curl -sf -X POST "$URL/api/collections/users/records" -H 'Content-Type: application/json' \
    -d '{"email":"t@example.com","password":"password123","passwordConfirm":"password123"}' >/dev/null || true
  TOKEN=$(curl -sf -X POST "$URL/api/collections/users/auth-with-password" -H 'Content-Type: application/json' \
    -d '{"identity":"t@example.com","password":"password123"}' | jq -r .token)
  USER_ID=$(curl -sf "$URL/api/collections/users/auth-refresh" -X POST -H "Authorization: $TOKEN" | jq -r .record.id)
}

create() { # $1 key, $2 deleted
  printf 'payload-%s' "$1" >"$WORK/$1.bin"
  curl -sf -X POST "$URL/api/collections/objects/records" -H "Authorization: $TOKEN" \
    -F "user=$USER_ID" -F app_name=maibuk -F kind=version -F "key=$1" -F "deleted=$2" \
    -F "content=@$WORK/$1.bin" | jq -r .id
}
update() { # $1 id, extra -F args
  local id=$1; shift
  curl -sf -X PATCH "$URL/api/collections/objects/records/$id" -H "Authorization: $TOKEN" "$@" >/dev/null
}
content_of() { curl -sf "$URL/api/collections/objects/records/$1" -H "Authorization: $TOKEN" | jq -r .content; }

# Phase 1: the server as it was (migrations up to 009, no hooks) leaves a
# soft-deleted row holding its file.
mkdir -p "$WORK/old-migrations" "$WORK/no-hooks"
cp "$ROOT"/pb_migrations/00*.js "$WORK/old-migrations/"
start "$WORK/old-migrations" "$WORK/no-hooks"
auth
LEGACY=$(create legacy false)
update "$LEGACY" -F deleted=true
[ "$(files)" = 1 ] || fail "setup: legacy deleted row should still hold its file"
stop

# Phase 2: migration 010 runs on start and frees it.
start "$ROOT/pb_migrations" "$ROOT/pb_hooks"
auth
[ "$(content_of "$LEGACY")" = "" ] || fail "migration 010 left content on a deleted row"
[ "$(files)" = 0 ] || fail "migration 010 left the file on disk"
pass "migration 010 clears content of rows deleted before the hook"

A=$(create a false)
[ "$(content_of "$A")" != "" ] || fail "live row lost its content on create"
update "$A" -F checksum=changed
[ "$(content_of "$A")" != "" ] || fail "updating a live row cleared its content"
pass "a live row keeps its content on create and update"

update "$A" -F deleted=true
[ "$(content_of "$A")" = "" ] || fail "soft delete without content kept the content"
[ "$(files)" = 0 ] || fail "soft delete without content kept the file on disk"
pass "soft delete without a content field removes the file"

B=$(create b false)
printf 'new' >"$WORK/new.bin"
update "$B" -F deleted=true -F "content=@$WORK/new.bin"
[ "$(content_of "$B")" = "" ] || fail "soft delete with a new upload stored it"
[ "$(files)" = 0 ] || fail "soft delete with a new upload left a file"
pass "soft delete with a content upload stores nothing"

C=$(create c true)
[ "$(content_of "$C")" = "" ] || fail "creating a deleted row stored content"
[ "$(files)" = 0 ] || fail "creating a deleted row left a file"
pass "creating a deleted row stores no content"

update "$C" -F deleted=false -F checksum=back
[ "$(content_of "$C")" = "" ] || fail "undeleting invented content"
pass "a deleted row can come back (books are restored this way)"

DUP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/api/collections/objects/records" \
  -H "Authorization: $TOKEN" -F "user=$USER_ID" -F app_name=maibuk -F kind=version -F key=a -F deleted=false)
[ "$DUP" = 400 ] || fail "re-creating a tombstoned key returned $DUP, want 400 (unique index)"
pass "an old client re-pushing a tombstoned key is refused by the unique index"

stop
start "$ROOT/pb_migrations" "$ROOT/pb_hooks"
pass "migration 010 is a no-op on a second start"
echo "all passed"
