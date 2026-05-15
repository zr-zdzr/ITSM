const db = require('../config/db');

const ALLOWED_TABLES = new Set(['systems','network_devices','mobiles','sims','gws_accounts','employees']);

async function saveToRecycleBin(module, tableName, record, recordName, userId) {
  await db.query(
    `INSERT INTO recycle_bin (module, table_name, record_id, record_name, data, deleted_by)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [module, tableName, record.id, recordName || String(record.id), JSON.stringify(record), userId]
  );
}

module.exports = { saveToRecycleBin, ALLOWED_TABLES };
