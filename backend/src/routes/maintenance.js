const router = require("express").Router();
const db = require("../config/db");
const { requireAuth, perm } = require("../middleware/auth");
const { logActivity, getIP } = require("../utils/activity");
const { saveToRecycleBin } = require("../utils/recycle");

const ALLOWED = new Set(["system", "mobile"]);

// Maintenance entries belong to an asset, so they inherit that module's
// permissions. Before this, both write routes were guarded by requireAuth
// alone, which let a read-only viewer add entries and permanently delete them.
const permForType = (action) => (req, res, next) =>
  perm(req.params.type === "mobile" ? "mobiles" : "systems", action)(
    req,
    res,
    next,
  );

router.get("/:type/:id", requireAuth, async (req, res, next) => {
  const { type, id } = req.params;
  if (!ALLOWED.has(type)) return res.status(400).json({ error: "Invalid type" });
  try {
    const r = await db.query(
      `SELECT m.*, u.name AS logged_by_name
       FROM maintenance_log m LEFT JOIN users u ON u.id = m.logged_by
       WHERE m.asset_type = $1 AND m.asset_id = $2
       ORDER BY m.event_date DESC, m.created_at DESC`,
      [type, id],
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

router.post(
  "/:type/:id",
  requireAuth,
  permForType("create"),
  async (req, res, next) => {
    const { type, id } = req.params;
    if (!ALLOWED.has(type))
      return res.status(400).json({ error: "Invalid type" });
    const { event_type, event_date, performed_by, cost_pkr, notes } = req.body;
    if (!event_type)
      return res.status(400).json({ error: "event_type is required" });
    try {
      const r = await db.query(
        `INSERT INTO maintenance_log (asset_type, asset_id, event_type, event_date, performed_by, cost_pkr, notes, logged_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          type,
          id,
          event_type,
          event_date || new Date().toISOString().slice(0, 10),
          performed_by || null,
          cost_pkr || null,
          notes || null,
          req.user.id,
        ],
      );
      await logActivity(
        req.user.id,
        "created",
        "maintenance_log",
        r.rows[0].id,
        `${type} #${id} — ${event_type}`,
        `Maintenance entry logged${cost_pkr ? ` (cost PKR ${cost_pkr})` : ""}`,
        getIP(req),
      );
      res.json(r.rows[0]);
    } catch (e) {
      next(e);
    }
  },
);

// Deleting an entry used to destroy it outright with no record. It now goes
// through the Recycle Bin like every other delete, so a maintenance history
// cannot be quietly rewritten.
router.delete("/:entryId", requireAuth, async (req, res, next) => {
  try {
    const existing = await db.query(
      "SELECT * FROM maintenance_log WHERE id = $1",
      [req.params.entryId],
    );
    const row = existing.rows[0];
    if (!row) return res.status(404).json({ error: "Not found" });

    // Permission follows the asset the entry is attached to.
    const mod = row.asset_type === "mobile" ? "mobiles" : "systems";
    return perm(mod, "delete")(req, res, async () => {
      try {
        const label = `${row.asset_type} #${row.asset_id} — ${row.event_type}`;
        await saveToRecycleBin(
          "maintenance",
          "maintenance_log",
          row,
          label,
          req.user.id,
        );
        await db.query("DELETE FROM maintenance_log WHERE id = $1", [
          req.params.entryId,
        ]);
        await logActivity(
          req.user.id,
          "deleted",
          "maintenance_log",
          row.id,
          label,
          "Maintenance entry moved to Recycle Bin",
          getIP(req),
        );
        res.json({ ok: true });
      } catch (e) {
        next(e);
      }
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
