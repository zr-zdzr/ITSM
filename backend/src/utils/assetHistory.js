const db = require("../config/db");

/**
 * Append an immutable event to asset_history.
 *
 * The three *_label columns are resolved inside the INSERT rather than passed
 * in. All three FKs are ON DELETE SET NULL, so without a stored copy of the
 * name, removing an employee or a user silently erases them from the chain of
 * custody — the event survives but no longer says who held the asset. Keeping
 * a snapshot of the label means "who had L10247 in 2026?" stays answerable
 * even after the person has left and their record is gone.
 */
async function logAssetEvent({
  assetType,
  assetId,
  assetLabel,
  eventType,
  fromEmployeeId,
  toEmployeeId,
  fromStatus,
  toStatus,
  reason,
  notes,
  performedBy,
}) {
  await db.query(
    `INSERT INTO asset_history
       (asset_type, asset_id, asset_label, event_type,
        from_employee_id, to_employee_id,
        from_employee_label, to_employee_label,
        from_status, to_status, reason, notes,
        performed_by, performed_by_label)
     VALUES ($1,$2,$3,$4,$5,$6,
             (SELECT full_name FROM employees WHERE id = $5),
             (SELECT full_name FROM employees WHERE id = $6),
             $7,$8,$9,$10,$11,
             (SELECT COALESCE(name, email) FROM users WHERE id = $11))`,
    [
      assetType,
      assetId,
      assetLabel ?? null,
      eventType,
      fromEmployeeId ?? null,
      toEmployeeId ?? null,
      fromStatus ?? null,
      toStatus ?? null,
      reason ?? null,
      notes ?? null,
      performedBy ?? null,
    ],
  );
}

module.exports = { logAssetEvent };
