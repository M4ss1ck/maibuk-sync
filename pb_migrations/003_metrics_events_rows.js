/// <reference path="../pb_data/types.d.ts" />

// Append-only per-event row table for the metrics row-level sync.
// Client schema doc lives at
// docs/plans/2026-05-23-metrics-sync-pocketbase-schema.md in the maibuk repo.
//
// Each row holds one metric event. Metadata stays plaintext so the server can
// answer the `updated > since` pull query; the prose-free payload (word
// counts, chapter id, sessionId, etc.) is encrypted client-side.
//
// Rows are immutable once created. Dedup across devices is enforced by the
// unique index on (user, client_id) — a UUID minted on the originating
// device. Conflicts surface as 400/409 on create and are treated as
// "already-pushed" by the client.

migrate(
  (app) => {
    const usersCollection = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      type: "base",
      name: "metrics_events_rows",
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
          name: "timestamp",
          type: "text",
          required: true,
        },
        {
          name: "local_date",
          type: "text",
          required: true,
        },
        {
          name: "tz_offset_min",
          type: "number",
          required: true,
        },
        {
          name: "event_type",
          type: "text",
          required: true,
        },
        {
          name: "work_id",
          type: "text",
          required: false,
        },
        {
          name: "schema_version",
          type: "number",
          required: true,
        },
        {
          name: "encrypted_payload",
          type: "text",
          required: true,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_metrics_events_user_client ON metrics_events_rows (user, client_id)",
        "CREATE INDEX idx_metrics_events_user_updated ON metrics_events_rows (user, updated)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("metrics_events_rows");
    app.delete(collection);
  },
);
