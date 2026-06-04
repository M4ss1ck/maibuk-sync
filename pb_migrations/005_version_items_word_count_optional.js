/// <reference path="../pb_data/types.d.ts" />

// Make version_items.word_count optional.
//
// PocketBase's `required` validator treats the numeric zero value as blank, so
// versions of an empty book (word_count = 0) were rejected on create with
// `validation_required` / "Cannot be blank.", aborting version sync. The count
// is display-only metadata and the client already defaults a missing value to
// 0, so dropping `required` is safe.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("version_items");
    const field = collection.fields.getByName("word_count");
    field.required = false;
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("version_items");
    const field = collection.fields.getByName("word_count");
    field.required = true;
    app.save(collection);
  }
);
