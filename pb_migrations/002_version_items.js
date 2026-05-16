/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const usersCollection = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      type: "base",
      name: "version_items",
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
          name: "version_id",
          type: "text",
          required: true,
        },
        {
          name: "book_id",
          type: "text",
          required: true,
        },
        {
          name: "encrypted_data",
          type: "file",
          required: true,
          maxSize: 52428800, // 50MB
          maxSelect: 1,
        },
        {
          name: "checksum",
          type: "text",
          required: true,
        },
        {
          name: "version_name",
          type: "text",
          required: false,
        },
        {
          name: "version_trigger",
          type: "text",
          required: true,
        },
        {
          name: "version_created_at",
          type: "number",
          required: true,
        },
        {
          name: "word_count",
          type: "number",
          required: true,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_version_items_user_version ON version_items (user, version_id)",
        "CREATE INDEX idx_version_items_user_book ON version_items (user, book_id)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("version_items");
    app.delete(collection);
  }
);
