const db = require('../config/db');

async function logAssetEvent({
  assetType, assetId, assetLabel, eventType,
  fromEmployeeId, toEmployeeId,
  fromStatus, toStatus,
  reason, notes, performedBy,
}) {
  await db.query(
    `INSERT INTO asset_history
       (asset_type, asset_id, asset_label, event_type,
        from_employee_id, to_employee_id,
        from_status, to_status, reason, notes, performed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      assetType, assetId, assetLabel ?? null, eventType,
      fromEmployeeId ?? null, toEmployeeId ?? null,
      fromStatus ?? null, toStatus ?? null,
      reason ?? null, notes ?? null, performedBy ?? null,
    ],
  );
}

module.exports = { logAssetEvent };
