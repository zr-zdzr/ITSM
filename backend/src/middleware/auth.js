const db = require('../config/db');

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

// Per-module, per-action permission check.
// super_admin bypasses all checks.
// user role: checks user_permissions table.
// viewer role: read-only (blocks create/update/delete).
function perm(module, action) {
  return async (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role === 'super_admin') return next();
    if (action === 'read') return next();
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Permission denied' });
    const col = `can_${action}`;
    try {
      const r = await db.query(
        `SELECT ${col} FROM user_permissions WHERE user_id=$1 AND module=$2`,
        [req.user.id, module]
      );
      if (r.rows[0]?.[col]) return next();
      res.status(403).json({ error: 'Permission denied' });
    } catch (err) { next(err); }
  };
}

module.exports = { requireAuth, requireRole, perm };
