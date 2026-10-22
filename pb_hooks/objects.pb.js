/// <reference path="../pb_data/types.d.ts" />

// A soft delete frees the stored payload. Clients mark a removed object
// `deleted = true` so peers learn of the removal, but an update that leaves out
// `content` keeps the old file, so every deleted object used to keep its whole
// encrypted payload forever. Clearing the file field here makes PocketBase
// delete the file once the save succeeds. App-agnostic: it is what a soft
// delete means for every kind (docs/object-contract.md, rule 4).
//
// Model hooks cover every save path (API, dashboard, migrations). JSVM handlers
// cannot share outer-scope functions, so each one repeats the check.

onRecordCreate((e) => {
  if (e.record.getBool("deleted")) {
    e.record.set("content", "");
  }
  e.next();
}, "objects");

onRecordUpdate((e) => {
  if (e.record.getBool("deleted")) {
    e.record.set("content", "");
  }
  e.next();
}, "objects");
