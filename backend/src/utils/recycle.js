const db = require("../config/db");

// Tables a recycle_bin row may be restored into. This is a security boundary
// as much as a feature list: the restore route interpolates table_name straight
// into SQL, so anything not named here is refused.
const ALLOWED_TABLES = new Set([
  "systems",
  "network_devices",
  "mobiles",
  "sims",
  "gws_accounts",
  "employees",
  "vendors",
  // Added so these stop being unrecoverable hard deletes.
  "users",
  "maintenance_log",
  "item_categories",
  "heads",
  "sub_heads",
]);

async function saveToRecycleBin(module, tableName, record, recordName, userId) {
  await db.query(
    `INSERT INTO recycle_bin (module, table_name, record_id, record_name, data, deleted_by)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      module,
      tableName,
      record.id,
      recordName || String(record.id),
      JSON.stringify(record),
      userId,
    ],
  );
}

module.exports = { saveToRecycleBin, ALLOWED_TABLES };
