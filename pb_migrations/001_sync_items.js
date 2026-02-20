/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const usersCollection = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      type: "base",
      name: "sync_items",
      listRule: "@request.auth.id = user",
      viewRule: "@request.auth.id = user",
      createRule: "@request.auth.id != ''",
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
        {
          name: "book_id",
          type: "text",
          required: true,
        },
        {
          name: "encrypted_data",
          type: "file",
          required: false,
          maxSize: 52428800, // 50MB
          maxSelect: 1,
        },
        {
          name: "checksum",
          type: "text",
          required: false,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_sync_items_user_book ON sync_items (user, book_id)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("sync_items");
    app.delete(collection);
  }
);
