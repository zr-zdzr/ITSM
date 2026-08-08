const db = require("../config/db");

/**
 * Insert a row into the activity_log table.
 *
 * user_label is resolved in the INSERT itself rather than passed in, so every
 * call site gets it for free and it costs no extra round trip. It is stored
 * denormalised on purpose: activity_log.user_id is ON DELETE SET NULL, so
 * without a copy of the name the whole trail goes anonymous the moment an
 * account is removed. An audit row must keep saying what was true when it
 * was written.
 *
 * `changes` is an optional {field: [before, after]} object for updates.
 *
 * Errors are intentionally re-thrown so the caller decides how to handle them.
 */
async function logActivity(
  userId,
  action,
  tableName,
  recordId,
  recordLabel,
  details,
  ipAddress,
  changes,
) {
  await db.query(
    `INSERT INTO activity_log
       (user_id, user_label, action, table_name, record_id, record_label, details, ip_address, changes)
     VALUES
       ($1, (SELECT COALESCE(name, email) FROM users WHERE id = $1),
        $2, $3, $4, $5, $6, $7, $8)`,
    [
      userId,
      action,
      tableName,
      recordId ?? null,
      recordLabel ?? null,
      details ?? null,
      ipAddress ?? null,
      changes ? JSON.stringify(changes) : null,
    ],
  );
}

// Noise that changes on every write and says nothing about intent.
const IGNORED_FIELDS = new Set(["updated_at", "created_at", "id"]);

/**
 * Diff two versions of a row into {field: [before, after]}, or null when
 * nothing meaningful moved.
 *
 * Values are compared as strings because a column read back from pg is often
 * a different JS type than the one that was sent in (Date vs string, number vs
 * numeric-string). Comparing loosely here avoids logging phantom changes on
 * fields the user never touched — a diff nobody trusts is worse than none.
 * Only keys present in `after` are considered, so a partial update does not
 * report every untouched column as cleared.
 */
function diffRows(before, after) {
  if (!before || !after) return null;
  const changes = {};
  for (const key of Object.keys(after)) {
    if (IGNORED_FIELDS.has(key)) continue;
    const a = before[key];
    const b = after[key];
    const norm = (v) =>
      v === null || v === undefined
        ? null
        : v instanceof Date
          ? v.toISOString()
          : String(v);
    if (norm(a) !== norm(b)) changes[key] = [norm(a), norm(b)];
  }
  return Object.keys(changes).length ? changes : null;
}

/**
 * Extract the real client IP from a request, handling X-Forwarded-For proxies.
 */
function getIP(req) {
  const fwd = req.headers["x-forwarded-for"];
  return fwd
    ? fwd.split(",")[0].trim()
    : req.socket?.remoteAddress || req.ip || null;
}

module.exports = { logActivity, getIP, diffRows };
