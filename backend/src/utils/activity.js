const db = require('../config/db');

/**
 * Insert a row into the activity_log table.
 * Errors are intentionally re-thrown so the caller decides how to handle them.
 */
async function logActivity(userId, action, tableName, recordId, recordLabel, details, ipAddress) {
  await db.query(
    'INSERT INTO activity_log (user_id,action,table_name,record_id,record_label,details,ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [userId, action, tableName, recordId ?? null, recordLabel ?? null, details ?? null, ipAddress ?? null]
  );
}

/**
 * Extract the real client IP from a request, handling X-Forwarded-For proxies.
 */
function getIP(req) {
  const fwd = req.headers['x-forwarded-for'];
  return fwd ? fwd.split(',')[0].trim() : (req.socket?.remoteAddress || req.ip || null);
}

module.exports = { logActivity, getIP };
