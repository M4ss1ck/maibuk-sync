/// <reference path="../pb_data/types.d.ts" />

// Raise the character limit on objects.meta.
//
// `meta` was declared as a plain text field (007_objects.js) without an explicit
// `max`. In PocketBase a text field with no max inherits a default limit of
// 5000 characters, so create failed with `validation_max_text_constraint`
// ("Must be no more than 5000 character(s).") once a record's meta crossed it.
//
// Unlike books/notes/versions, metric objects intentionally inline their
// (encrypted) payload in `meta` so a whole batch can be pulled in one list
// query instead of one file fetch per row. A compacted `aggregate.daily` event
// embeds the ids of every raw event it absorbed, so a busy day's encrypted meta
// can exceed 5000 chars. The value is end-to-end encrypted, so the server never
// sees plaintext; this only lifts the column's validation ceiling. SQLite TEXT
// is variable-length, so a higher max costs nothing until a row actually uses it.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("objects");
    const field = collection.fields.getByName("meta");
    field.max = 1000000;
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("objects");
    const field = collection.fields.getByName("meta");
    field.max = 0;
    app.save(collection);
  }
);
