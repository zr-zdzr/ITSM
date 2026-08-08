const router = require("express").Router();
const db = require("../config/db");
const { requireAuth, hasPerm } = require("../middleware/auth");
const { ALLOWED_TABLES } = require("../utils/recycle");
const { logActivity, getIP } = require("../utils/activity");

// Restoring and permanently purging are both write actions, but the Recycle Bin
// holds rows from every module, so the module can only be known after the row is
// read. Guarded here rather than at mount time — before this, `requireAuth` was
// the only gate, which let a read-only viewer permanently destroy records.
async function requireDeletePerm(req, res, item) {
  if (await hasPerm(req.user, item.module, "delete")) return true;
  res.status(403).json({ error: "Permission denied" });
  return false;
}

// GET /count – lightweight badge
router.get("/count", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT COUNT(*) n FROM recycle_bin WHERE expires_at > NOW()`,
    );
    res.json({ count: Number(r.rows[0].n) });
  } catch (err) {
    next(err);
  }
});

// GET / – full list with last action from activity_log
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT rb.id, rb.module, rb.table_name, rb.record_id, rb.record_name,
             rb.deleted_at, rb.expires_at,
             u.name  AS deleted_by_name,
             (SELECT a.action     FROM activity_log a WHERE a.table_name=rb.table_name AND a.record_id=rb.record_id AND a.created_at < rb.deleted_at AND a.action NOT IN ('deleted','deleted_all') ORDER BY a.created_at DESC LIMIT 1) AS last_action,
             (SELECT a.created_at FROM activity_log a WHERE a.table_name=rb.table_name AND a.record_id=rb.record_id AND a.created_at < rb.deleted_at AND a.action NOT IN ('deleted','deleted_all') ORDER BY a.created_at DESC LIMIT 1) AS last_action_at,
             (SELECT u2.name FROM activity_log a LEFT JOIN users u2 ON u2.id=a.user_id WHERE a.table_name=rb.table_name AND a.record_id=rb.record_id AND a.created_at < rb.deleted_at AND a.action NOT IN ('deleted','deleted_all') ORDER BY a.created_at DESC LIMIT 1) AS last_action_by
      FROM recycle_bin rb LEFT JOIN users u ON u.id = rb.deleted_by
      WHERE rb.expires_at > NOW()
      ORDER BY rb.deleted_at DESC
    `);
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});

// POST /:id/restore
router.post("/:id/restore", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query("SELECT * FROM recycle_bin WHERE id=$1", [
      req.params.id,
    ]);
    if (!r.rows[0])
      return res.status(404).json({ error: "Not found in recycle bin" });

    const item = r.rows[0];
    if (!ALLOWED_TABLES.has(item.table_name))
      return res.status(400).json({ error: "Invalid table" });
    if (!(await requireDeletePerm(req, res, item))) return;

    const record =
      typeof item.data === "string" ? JSON.parse(item.data) : { ...item.data };
    // Remove auto-managed fields so the DB assigns fresh values
    delete record.id;
    delete record.created_at;
    delete record.updated_at;

    const cols = Object.keys(record);
    const vals = cols.map((k) => record[k]);
    const placeholders = cols.map((_, i) => `$${i + 1}`);

    await db.query(
      `INSERT INTO "${item.table_name}" (${cols.map((c) => `"${c}"`).join(",")})
       VALUES (${placeholders.join(",")})`,
      vals,
    );

    await db.query("DELETE FROM recycle_bin WHERE id=$1", [req.params.id]);
    await logActivity(
      req.user.id,
      "restored",
      item.table_name,
      item.record_id,
      item.record_name,
      `Restored from Recycle Bin (deleted ${new Date(item.deleted_at).toISOString().slice(0, 10)})`,
      getIP(req),
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /:id – permanently purge one item, bypassing the retention window.
// This is the only path in the app that destroys a record on demand, so the
// full row snapshot is copied into the activity log first. The bin entry goes,
// but the data itself stays recoverable from the audit trail.
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query("SELECT * FROM recycle_bin WHERE id=$1", [
      req.params.id,
    ]);
    if (!r.rows[0])
      return res.status(404).json({ error: "Not found in recycle bin" });
    const item = r.rows[0];
    if (!(await requireDeletePerm(req, res, item))) return;

    await logActivity(
      req.user.id,
      "purged",
      item.table_name,
      item.record_id,
      item.record_name,
      "Permanently purged from Recycle Bin before its retention window expired. " +
        "Full record snapshot retained with this entry.",
      getIP(req),
      {
        snapshot:
          typeof item.data === "string" ? JSON.parse(item.data) : item.data,
      },
    );

    await db.query("DELETE FROM recycle_bin WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
