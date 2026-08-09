/**
 * Bins and serialized units (spare-parts-architecture.md §2b).
 *
 * The invariant this file maintains: for a serialized item,
 * inv_stock.qty_available === count of its 'in_stock' units and
 * inv_stock.qty_damaged === count of its 'faulty' units. Every sync goes
 * through inv_adjustments so the ledger stays the single source of truth.
 */
const router = require("express").Router();
const db = require("../config/db");
const { requireAuth, perm } = require("../middleware/auth");
const { logActivity, getIP } = require("../utils/activity");
const { checkAlerts } = require("./inventory");

const UNIT_STATUSES = new Set([
  "in_stock",
  "reserved",
  "installed",
  "faulty",
  "rma",
  "scrapped",
]);

// Ledger vocabulary for a manual unit transition, keyed by the side that
// changed. Stays within the types the reports already understand.
function ledgerType(from, to) {
  if (to === "faulty") return "damaged";
  if (to === "scrapped") return "retired";
  if (to === "in_stock") return "return_to_stock";
  return "correction";
}

async function log(userId, action, id, label, details) {
  await logActivity(userId, action, "inv_units", id, label, details);
}

// ── BINS ──────────────────────────────────────────────────

router.get("/bins", requireAuth, async (req, res, next) => {
  try {
    const all = req.query.all === "true";
    const r = await db.query(
      `SELECT b.*, (SELECT COUNT(*) FROM inv_units u
                     WHERE u.bin_id = b.id AND u.status = 'in_stock') AS units_in_stock
       FROM inv_bins b ${all ? "" : "WHERE b.is_active"} ORDER BY b.code`,
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

router.post(
  "/bins",
  requireAuth,
  perm("inventory", "create"),
  async (req, res, next) => {
    try {
      const { code, location, description } = req.body;
      if (!code) return res.status(400).json({ error: "code is required" });
      const r = await db.query(
        `INSERT INTO inv_bins (code, location, description) VALUES ($1,$2,$3) RETURNING *`,
        [code.trim(), location || null, description || null],
      );
      await logActivity(
        req.user.id,
        "created",
        "inv_bins",
        r.rows[0].id,
        code.trim(),
        "Bin created",
        getIP(req),
      );
      res.status(201).json(r.rows[0]);
    } catch (e) {
      if (e.code === "23505")
        return res.status(409).json({ error: "Bin code already exists" });
      next(e);
    }
  },
);

router.put(
  "/bins/:id",
  requireAuth,
  perm("inventory", "update"),
  async (req, res, next) => {
    try {
      const { code, location, description, is_active } = req.body;
      const r = await db.query(
        `UPDATE inv_bins SET code = COALESCE($1, code), location = $2,
                description = $3, is_active = COALESCE($4, is_active)
         WHERE id = $5 RETURNING *`,
        [
          code?.trim() || null,
          location || null,
          description || null,
          typeof is_active === "boolean" ? is_active : null,
          req.params.id,
        ],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      await logActivity(
        req.user.id,
        "updated",
        "inv_bins",
        r.rows[0].id,
        r.rows[0].code,
        "Bin updated",
        getIP(req),
      );
      res.json(r.rows[0]);
    } catch (e) {
      if (e.code === "23505")
        return res.status(409).json({ error: "Bin code already exists" });
      next(e);
    }
  },
);

// ── UNITS ─────────────────────────────────────────────────

router.get("/items/:id/units", requireAuth, async (req, res, next) => {
  try {
    const { status } = req.query;
    const params = [req.params.id];
    let sql = `
      SELECT u.*, b.code AS bin_code
      FROM inv_units u LEFT JOIN inv_bins b ON b.id = u.bin_id
      WHERE u.item_id = $1`;
    if (status) {
      params.push(status);
      sql += ` AND u.status = $${params.length}`;
    }
    sql += " ORDER BY u.status, u.serial_no";
    res.json((await db.query(sql, params)).rows);
  } catch (e) {
    next(e);
  }
});

// Bulk-add units for a serialized item. Each unit becomes one 'purchase'
// ledger row referencing the unit, and qty_available rises with the count.
router.post(
  "/items/:id/units",
  requireAuth,
  perm("inventory", "create"),
  async (req, res, next) => {
    const { serials, bin_id, cost_pkr } = req.body;
    const list = (Array.isArray(serials) ? serials : [])
      .map((s) => String(s).trim())
      .filter(Boolean);
    if (!list.length)
      return res.status(400).json({ error: "serials[] is required" });
    const dupInBatch = list.length !== new Set(list).size;
    if (dupInBatch)
      return res.status(400).json({ error: "Duplicate serials in the batch" });

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const ir = await client.query(
        "SELECT id, name, tracking_type FROM inv_items WHERE id=$1 AND is_active",
        [req.params.id],
      );
      const item = ir.rows[0];
      if (!item)
        throw Object.assign(new Error("Item not found"), { status: 404 });
      if (item.tracking_type !== "serialized")
        throw Object.assign(
          new Error("Units can only be added to serialized items"),
          { status: 400 },
        );

      const created = [];
      for (const serial of list) {
        const ur = await client.query(
          `INSERT INTO inv_units (item_id, serial_no, bin_id, cost_pkr)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [item.id, serial, bin_id || null, cost_pkr || null],
        );
        created.push(ur.rows[0]);
        await client.query(
          `INSERT INTO inv_adjustments (item_id, type, qty_change, reference_type, reference_id, notes, performed_by)
           VALUES ($1,'purchase',1,'inv_units',$2,$3,$4)`,
          [item.id, ur.rows[0].id, `Unit ${serial} added`, req.user.id],
        );
      }
      await client.query(
        `UPDATE inv_stock SET qty_available = qty_available + $1, updated_at = NOW()
         WHERE item_id = $2`,
        [created.length, item.id],
      );
      await client.query("COMMIT");
      await checkAlerts(item.id);
      await log(
        req.user.id,
        "created",
        item.id,
        item.name,
        `${created.length} unit(s) added: ${list.join(", ")}`,
      );
      res.status(201).json(created);
    } catch (e) {
      await client.query("ROLLBACK");
      if (e.code === "23505")
        return res
          .status(409)
          .json({ error: "One of these serials already exists for this item" });
      if (e.status) return res.status(e.status).json({ error: e.message });
      next(e);
    } finally {
      client.release();
    }
  },
);

// Unit detail — the target of a scanned QR label.
router.get("/units/:id", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT u.*, i.name AS item_name, i.sku, i.manufacturer, i.model,
              b.code AS bin_code, b.location AS bin_location
       FROM inv_units u
       JOIN inv_items i ON i.id = u.item_id
       LEFT JOIN inv_bins b ON b.id = u.bin_id
       WHERE u.id = $1`,
      [req.params.id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// Manual status / bin transition. 'installed' is refused here on purpose —
// installation only happens through a repair consuming the unit, so the
// asset link is never fabricated by hand.
router.put(
  "/units/:id",
  requireAuth,
  perm("inventory", "update"),
  async (req, res, next) => {
    const { status, bin_id, notes } = req.body;
    if (status !== undefined) {
      if (!UNIT_STATUSES.has(status))
        return res.status(400).json({ error: "Invalid status" });
      if (status === "installed")
        return res.status(400).json({
          error: "Units become installed by a repair consuming them",
        });
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const ur = await client.query(
        "SELECT * FROM inv_units WHERE id=$1 FOR UPDATE",
        [req.params.id],
      );
      const unit = ur.rows[0];
      if (!unit) throw Object.assign(new Error("Not found"), { status: 404 });

      const newStatus = status ?? unit.status;
      const availDelta =
        (newStatus === "in_stock" ? 1 : 0) -
        (unit.status === "in_stock" ? 1 : 0);
      const damagedDelta =
        (newStatus === "faulty" ? 1 : 0) - (unit.status === "faulty" ? 1 : 0);

      const r = await client.query(
        `UPDATE inv_units SET status=$1::varchar, bin_id=$2, notes=COALESCE($3::text, notes),
                installed_asset_type = CASE WHEN $1::varchar <> 'installed' THEN NULL ELSE installed_asset_type END,
                installed_asset_id   = CASE WHEN $1::varchar <> 'installed' THEN NULL ELSE installed_asset_id END,
                updated_at=NOW()
         WHERE id=$4 RETURNING *`,
        [
          newStatus,
          bin_id !== undefined ? bin_id || null : unit.bin_id,
          notes ?? null,
          unit.id,
        ],
      );
      if (availDelta !== 0 || damagedDelta !== 0) {
        await client.query(
          `UPDATE inv_stock SET
             qty_available = GREATEST(0, qty_available + $1),
             qty_damaged   = GREATEST(0, qty_damaged + $2),
             updated_at = NOW()
           WHERE item_id = $3`,
          [availDelta, damagedDelta, unit.item_id],
        );
      }
      if (availDelta !== 0) {
        await client.query(
          `INSERT INTO inv_adjustments (item_id, type, qty_change, reference_type, reference_id, notes, performed_by)
           VALUES ($1,$2,$3,'inv_units',$4,$5,$6)`,
          [
            unit.item_id,
            ledgerType(unit.status, newStatus),
            availDelta,
            unit.id,
            `Unit ${unit.serial_no}: ${unit.status} → ${newStatus}`,
            req.user.id,
          ],
        );
      }
      await client.query("COMMIT");
      if (availDelta !== 0) await checkAlerts(unit.item_id);
      if (newStatus !== unit.status)
        await log(
          req.user.id,
          "updated",
          unit.id,
          unit.serial_no,
          `Unit ${unit.serial_no}: ${unit.status} → ${newStatus}`,
        );
      res.json(r.rows[0]);
    } catch (e) {
      await client.query("ROLLBACK");
      if (e.status) return res.status(e.status).json({ error: e.message });
      next(e);
    } finally {
      client.release();
    }
  },
);

module.exports = router;
