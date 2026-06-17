/// <reference path="../pb_data/types.d.ts" />

// Generic, app-agnostic sync collection. The server stores an opaque envelope:
// routing/identity fields stay plaintext (app_name, kind, key, group, checksum,
// deleted); everything descriptive lives in the ENCRYPTED meta/content. No
// app-specific columns -- schema changes and new apps never touch the server.
// Invariants the server does NOT enforce live in docs/object-contract.md.

migrate(
  (app) => {
    const usersCollection = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      type: "base",
      name: "objects",
      listRule: "@request.auth.id = user",
      viewRule: "@request.auth.id = user",
      createRule: "@request.auth.id = user",
      updateRule: "@request.auth.id = user",
      deleteRule: "@request.auth.id = user",
      fields: [
        {
          name: "user",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: usersCollection.id,
          cascadeDelete: true,
        },
        { name: "app_name", type: "text", required: true },
        { name: "kind", type: "text", required: true },
        { name: "key", type: "text", required: true },
        { name: "group", type: "text", required: false },
        { name: "checksum", type: "text", required: false },
        { name: "deleted", type: "bool", required: false },
        { name: "meta", type: "text", required: false },
        {
          name: "content",
          type: "file",
          required: false,
          maxSize: 52428800,
          maxSelect: 1,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false, system: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true, system: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_objects_user_app_kind_key ON objects (user, app_name, kind, key)",
        "CREATE INDEX idx_objects_user_app_updated ON objects (user, app_name, updated)",
        "CREATE INDEX idx_objects_user_app_kind_group ON objects (user, app_name, kind, `group`)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("objects");
    app.delete(collection);
  },
);
