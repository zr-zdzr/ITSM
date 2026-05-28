const router = require("express").Router();
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logActivity, getIP } = require("../utils/activity");

const adminOnly = requireRole("super_admin");

const MODULES = [
  "systems",
  "network",
  "mobiles",
  "sims",
  "gws",
  "employees",
  "reports",
];

function log(userId, action, id, label, details, ip) {
  return logActivity(userId, action, "users", id, label, details, ip);
}

async function insertDefaultPermissions(userId) {
  for (const mod of MODULES) {
    await db.query(
      `INSERT INTO user_permissions (user_id,module,can_create,can_read,can_update,can_delete)
       VALUES ($1,$2,false,true,false,false) ON CONFLICT DO NOTHING`,
      [userId, mod],
    );
  }
}

// ── LIST ALL USERS ────────────────────────────────────────
router.get("/", requireAuth, adminOnly, async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT u.id,u.email,u.name,u.avatar_url,u.role,u.department,u.designation,u.is_active,u.last_login,u.created_at,
             e.id AS employee_id, e.full_name AS employee_name
      FROM users u LEFT JOIN employees e ON e.portal_user_id=u.id
      ORDER BY u.created_at DESC`);
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});

// ── EMPLOYEES WITHOUT PORTAL ACCOUNTS ────────────────────
router.get("/employees/available", requireAuth, adminOnly, async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT id,full_name,email,designation,department
       FROM employees WHERE portal_user_id IS NULL AND is_active=true
       ORDER BY full_name`,
    );
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});

// ── ACTIVITY LOG ──────────────────────────────────────────
router.get("/activity/log", requireAuth, adminOnly, async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT a.*, u.name AS user_name, u.email AS user_email
      FROM activity_log a LEFT JOIN users u ON u.id=a.user_id
      ORDER BY a.created_at DESC LIMIT 500`);
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});

// ── GET USER PERMISSIONS ──────────────────────────────────
router.get("/:id/permissions", requireAuth, adminOnly, async (req, res, next) => {
  try {
    const r = await db.query(
      "SELECT * FROM user_permissions WHERE user_id=$1 ORDER BY module",
      [req.params.id],
    );
    // Return as object keyed by module for convenience
    const perms = {};
    for (const row of r.rows) {
      perms[row.module] = {
        can_create: row.can_create,
        can_read: row.can_read,
        can_update: row.can_update,
        can_delete: row.can_delete,
      };
    }
    // Fill missing modules with defaults
    for (const mod of MODULES) {
      if (!perms[mod])
        perms[mod] = {
          can_create: false,
          can_read: true,
          can_update: false,
          can_delete: false,
        };
    }
    res.json(perms);
  } catch (err) {
    next(err);
  }
});

// ── SET USER PERMISSIONS ──────────────────────────────────
router.put("/:id/permissions", requireAuth, adminOnly, async (req, res, next) => {
  try {
    const { permissions } = req.body; // { module: { can_create, can_read, can_update, can_delete } }
    if (!permissions)
      return res.status(400).json({ error: "permissions object required" });
    await db.query("DELETE FROM user_permissions WHERE user_id=$1", [
      req.params.id,
    ]);
    for (const [mod, p] of Object.entries(permissions)) {
      if (!MODULES.includes(mod)) continue;
      await db.query(
        `INSERT INTO user_permissions (user_id,module,can_create,can_read,can_update,can_delete)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          req.params.id,
          mod,
          !!p.can_create,
          !!p.can_read,
          !!p.can_update,
          !!p.can_delete,
        ],
      );
    }
    await log(
      req.user.id,
      "updated",
      Number(req.params.id),
      null,
      "Permissions updated",
      getIP(req),
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── CREATE USER FROM EMPLOYEE ─────────────────────────────
router.post("/", requireAuth, adminOnly, async (req, res, next) => {
  const { employee_id, password, role } = req.body;
  if (!employee_id || !password || !role)
    return res
      .status(400)
      .json({ error: "employee_id, password and role are required" });
  if (password.length < 6)
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });
  if (!["super_admin", "user"].includes(role))
    return res.status(400).json({ error: "Role must be super_admin or user" });
  try {
    const empR = await db.query("SELECT * FROM employees WHERE id=$1", [
      employee_id,
    ]);
    const emp = empR.rows[0];
    if (!emp) return res.status(404).json({ error: "Employee not found" });
    if (!emp.email)
      return res
        .status(400)
        .json({ error: "Employee has no email address — add one first" });
    if (emp.portal_user_id)
      return res
        .status(409)
        .json({ error: "This employee already has a portal account" });

    const hash = await bcrypt.hash(password, 10);
    const r = await db.query(
      `INSERT INTO users (email,name,password_hash,role,department,designation,is_active)
       VALUES ($1,$2,$3,$4,$5,$6,true)
       RETURNING id,email,name,role,department,designation,is_active,created_at`,
      [emp.email, emp.full_name, hash, role, emp.department, emp.designation],
    );
    const newUser = r.rows[0];
    await db.query("UPDATE employees SET portal_user_id=$1 WHERE id=$2", [
      newUser.id,
      employee_id,
    ]);
    if (role !== "super_admin") await insertDefaultPermissions(newUser.id);
    await log(
      req.user.id,
      "created",
      newUser.id,
      newUser.email,
      `Role: ${role}`,
      getIP(req),
    );
    res.status(201).json(newUser);
  } catch (err) {
    if (err.code === "23505")
      return res
        .status(409)
        .json({ error: "This email is already a portal user" });
    next(err);
  }
});

// ── GET ONE USER ──────────────────────────────────────────
router.get("/:id", requireAuth, adminOnly, async (req, res, next) => {
  try {
    const r = await db.query(
      "SELECT id,email,name,avatar_url,role,department,designation,is_active,last_login,created_at FROM users WHERE id=$1",
      [req.params.id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── UPDATE ROLE / STATUS ──────────────────────────────────
router.put("/:id", requireAuth, adminOnly, async (req, res, next) => {
  try {
    const { role, is_active } = req.body;
    if (Number(req.params.id) === req.user.id)
      return res
        .status(400)
        .json({ error: "You cannot modify your own account here" });
    const r = await db.query(
      "UPDATE users SET role=$1,is_active=$2 WHERE id=$3 RETURNING id,email,name,role,is_active",
      [role, is_active !== false, req.params.id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    await log(
      req.user.id,
      "updated",
      r.rows[0].id,
      r.rows[0].email,
      `Role: ${role}`,
      getIP(req),
    );
    res.json(r.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── ADMIN RESET PASSWORD ──────────────────────────────────
router.patch("/:id/password", requireAuth, adminOnly, async (req, res, next) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6)
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    const hash = await bcrypt.hash(new_password, 10);
    const r = await db.query(
      "UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING email",
      [hash, req.params.id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    await log(
      req.user.id,
      "password_reset",
      Number(req.params.id),
      r.rows[0].email,
      "Admin reset password",
      getIP(req),
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── DELETE USER ───────────────────────────────────────────
router.delete("/:id", requireAuth, adminOnly, async (req, res, next) => {
  try {
    if (Number(req.params.id) === req.user.id)
      return res
        .status(400)
        .json({ error: "You cannot delete your own account" });
    const r = await db.query("DELETE FROM users WHERE id=$1 RETURNING *", [
      req.params.id,
    ]);
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    await log(
      req.user.id,
      "deleted",
      r.rows[0].id,
      r.rows[0].email,
      "User deleted",
      getIP(req),
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
