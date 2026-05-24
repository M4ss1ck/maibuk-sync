/// <reference path="../pb_data/types.d.ts" />

// Companion tombstone table for the metrics row-level sync. When a user
// disables a metrics category, the originating device writes one tombstone
// per deleted event; peers replay the tombstones (and drop their local
// copies of those events) on the next pull.
//
// Like `metrics_events_rows`, this table is append-only — dedup on
// (user, client_id), immutable once created.

migrate(
  (app) => {
    const usersCollection = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      type: "base",
      name: "metrics_tombstones_rows",
      listRule: "@request.auth.id = user",
      viewRule: "@request.auth.id = user",
      createRule: "@request.auth.id = user",
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "user",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: usersCollection.id,
          cascadeDelete: true,
        },
        {
          name: "client_id",
          type: "text",
          required: true,
        },
        {
          name: "device_id",
          type: "text",
          required: true,
        },
        {
          name: "deleted_at",
          type: "text",
          required: true,
        },
        {
          name: "reason",
          type: "text",
          required: true,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_metrics_tombstones_user_client ON metrics_tombstones_rows (user, client_id)",
        "CREATE INDEX idx_metrics_tombstones_user_updated ON metrics_tombstones_rows (user, updated)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("metrics_tombstones_rows");
    app.delete(collection);
  },
);
