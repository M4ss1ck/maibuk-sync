/// <reference path="../pb_data/types.d.ts" />

// Clean-break removal of the per-app collections now superseded by `objects`.
// Deploy ONLY after all clients have upgraded to the generic-collection build.
// The down-migration intentionally does not recreate them -- restore from the
// earlier migrations (001-006) if a rollback is ever required.

const LEGACY = [
  "sync_items",
  "note_items",
  "version_items",
  "metrics_events_rows",
  "metrics_tombstones_rows",
  "metrics_sync",
];

migrate(
  (app) => {
    for (const name of LEGACY) {
      try {
        const collection = app.findCollectionByNameOrId(name);
        app.delete(collection);
      } catch (_) {
        // Collection may not exist (e.g. metrics_sync never created) -- skip.
      }
    }
  },
  (_app) => {
    // Irreversible by design; recreate via migrations 001-006 if needed.
  },
);
