const router  = require('express').Router();
const bcrypt   = require('bcryptjs');
const db       = require('../config/db');

function getIP(req) {
  const fwd = req.headers['x-forwarded-for'];
  return fwd ? fwd.split(',')[0].trim() : (req.socket?.remoteAddress || req.ip || null);
}

async function logEvent(userId, action, label, details, ip) {
  await db.query(
    'INSERT INTO activity_log (user_id,action,table_name,record_label,details,ip_address) VALUES ($1,$2,$3,$4,$5,$6)',
    [userId, action, 'auth', label, details, ip]
  );
}

// ── LOGIN ─────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  const ip = getIP(req);
  try {
    const result = await db.query(
      'SELECT * FROM users WHERE email=$1 AND password_hash IS NOT NULL', [username]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      await logEvent(null, 'login_failed', username, 'Invalid credentials', ip);
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (!user.is_active) {
      await logEvent(user.id, 'login_blocked', user.email, 'Account deactivated', ip);
      return res.status(403).json({ error: 'Account is deactivated' });
    }
    req.login(user, async err => {
      if (err) return next(err);
      await db.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id]);
      await logEvent(user.id, 'login', user.email, 'Login successful', ip);
      res.json({ ok: true });
    });
  } catch (err) { next(err); }
});

// ── LOGOUT ────────────────────────────────────────────────
router.post('/logout', async (req, res, next) => {
  if (req.isAuthenticated()) {
    const ip = getIP(req);
    const userId = req.user.id, email = req.user.email;
    req.logout(async err => {
      if (err) return next(err);
      req.session.destroy(async () => {
        await logEvent(userId, 'logout', email, 'Logout', ip).catch(() => {});
        res.json({ ok: true });
      });
    });
  } else {
    res.json({ ok: true });
  }
});

// ── ME (includes per-module permissions for non-super_admin) ──
router.get('/me', async (req, res) => {
  if (!req.isAuthenticated())
    return res.status(401).json({ error: 'Not authenticated' });
  const { id, email, name, avatar_url, role, department, designation } = req.user;
  let permissions = null;
  if (role !== 'super_admin') {
    try {
      const r = await db.query('SELECT * FROM user_permissions WHERE user_id=$1', [id]);
      permissions = {};
      for (const row of r.rows) {
        permissions[row.module] = {
          can_create: row.can_create,
          can_read:   row.can_read,
          can_update: row.can_update,
          can_delete: row.can_delete,
        };
      }
    } catch (_) { permissions = {}; }
  }
  res.json({ id, email, name, avatar_url, role, department, designation, permissions });
});

// ── CHANGE OWN PASSWORD ───────────────────────────────────
router.post('/change-password', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'current_password and new_password are required' });
  if (new_password.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  try {
    const r = await db.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    const user = r.rows[0];
    if (!user || !(await bcrypt.compare(current_password, user.password_hash)))
      return res.status(401).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
    await logEvent(req.user.id, 'password_changed', req.user.email, 'Password changed', getIP(req));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
