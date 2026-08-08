const db = require("../config/db");

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Not authenticated" });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}

// The permission rule itself, decoupled from Express.
// super_admin bypasses all checks.
// user role: checks user_permissions table.
// viewer role: read-only (blocks create/update/delete).
//
// Exposed separately from perm() because some routes only learn which module
// they are acting on after reading the row — the Recycle Bin holds records
// from every module, so it cannot name one at mount time.
async function hasPerm(user, module, action) {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  if (action === "read") return true;
  if (user.role === "viewer") return false;
  const col = `can_${action}`;
  const r = await db.query(
    `SELECT ${col} FROM user_permissions WHERE user_id=$1 AND module=$2`,
    [user.id, module],
  );
  return Boolean(r.rows[0]?.[col]);
}

// Per-module, per-action permission check as Express middleware.
function perm(module, action) {
  return async (req, res, next) => {
    if (!req.isAuthenticated())
      return res.status(401).json({ error: "Not authenticated" });
    try {
      if (await hasPerm(req.user, module, action)) return next();
      res.status(403).json({ error: "Permission denied" });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireAuth, requireRole, perm, hasPerm };
