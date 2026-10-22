/// <reference path="../pb_data/types.d.ts" />

// Free the payload of objects soft-deleted before pb_hooks/objects.pb.js
// existed: their `content` file was kept on every delete. Clearing the field
// and saving makes PocketBase remove the file. Rerunning finds nothing to do.
// The down migration cannot bring the files back, so it does nothing.

migrate(
  (app) => {
    const records = app.findRecordsByFilter("objects", "deleted = true && content != ''", "", 0, 0);
    for (const record of records) {
      record.set("content", "");
      app.save(record);
    }
  },
  () => {}
);
