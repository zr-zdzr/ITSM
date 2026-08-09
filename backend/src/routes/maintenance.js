const router = require("express").Router();
const db = require("../config/db");
const { requireAuth, perm } = require("../middleware/auth");
const { logActivity, getIP } = require("../utils/activity");
const { saveToRecycleBin } = require("../utils/recycle");
const { checkAlerts } = require("./inventory");

// Maintenance entries belong to an asset, so they inherit that module's
// permissions. Before this, both write routes were guarded by requireAuth
// alone, which let a read-only viewer add entries and permanently delete them.
const PERM_MODULE = {
  system: "systems",
  mobile: "mobiles",
  network: "network",
};

const permForType = (action) => (req, res, next) =>
  perm(PERM_MODULE[req.params.type] || "systems", action)(req, res, next);

// Per-entry parts with the item name resolved and the parts bill totalled.
// COALESCEs keep pre-Phase-1 entries (no parts) rendering as empty arrays.
const PARTS_LATERAL = `
  LEFT JOIN vendors v ON v.id = m.vendor_id
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object(
             'id', mp.id, 'item_id', mp.item_id, 'item_name', i.name,
             'qty', mp.qty, 'unit_cost_pkr', mp.unit_cost_pkr,
             'serial_no', mp.serial_no, 'notes', mp.notes
           ) ORDER BY mp.id)                        AS parts,
           SUM(mp.qty * COALESCE(mp.unit_cost_pkr, 0)) AS parts_cost
    FROM maintenance_parts mp
    JOIN inv_items i ON i.id = mp.item_id
    WHERE mp.maintenance_log_id = m.id
  ) p ON true`;

const ENTRY_SELECT = `
  SELECT m.*, u.name AS logged_by_name, v.name AS vendor_name,
         COALESCE(p.parts, '[]'::json) AS parts,
         COALESCE(p.parts_cost, 0)     AS parts_cost_pkr
  FROM maintenance_log m
  LEFT JOIN users u ON u.id = m.logged_by
  ${PARTS_LATERAL}`;

router.get("/:type/:id", requireAuth, async (req, res, next) => {
  const { type, id } = req.params;
  if (!PERM_MODULE[type])
    return res.status(400).json({ error: "Invalid type" });
  try {
    const r = await db.query(
      `${ENTRY_SELECT}
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
    if (!PERM_MODULE[type])
      return res.status(400).json({ error: "Invalid type" });
    const { event_type, event_date, performed_by, vendor_id, cost_pkr, notes } =
      req.body;
    if (!event_type)
      return res.status(400).json({ error: "event_type is required" });

    const parts = Array.isArray(req.body.parts) ? req.body.parts : [];
    for (const part of parts) {
      const qty = Number(part.qty);
      if (!part.item_id || !Number.isInteger(qty) || qty <= 0)
        return res
          .status(400)
          .json({ error: "Each part needs an item_id and a positive qty" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        `INSERT INTO maintenance_log
           (asset_type, asset_id, event_type, event_date, performed_by, vendor_id, cost_pkr, notes, logged_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          type,
          id,
          event_type,
          event_date || new Date().toISOString().slice(0, 10),
          performed_by || null,
          vendor_id || null,
          cost_pkr || null,
          notes || null,
          req.user.id,
        ],
      );
      const entry = r.rows[0];

      for (const part of parts) {
        const qty = Number(part.qty);
        const ir0 = await client.query(
          "SELECT name, tracking_type FROM inv_items WHERE id=$1",
          [part.item_id],
        );
        const itemInfo = ir0.rows[0];
        // A serialized part is a specific unit: it must be named by serial,
        // consumed one at a time, and exist in stock right now.
        let unit = null;
        if (itemInfo?.tracking_type === "serialized") {
          if (!part.serial_no)
            throw Object.assign(
              new Error(
                `${itemInfo.name} is serialized — pick a serial number`,
              ),
              { status: 400 },
            );
          if (qty !== 1)
            throw Object.assign(
              new Error(`Serialized parts are consumed one unit per line`),
              { status: 400 },
            );
          const ur = await client.query(
            `SELECT * FROM inv_units
             WHERE item_id=$1 AND serial_no=$2 AND status='in_stock' FOR UPDATE`,
            [part.item_id, part.serial_no],
          );
          unit = ur.rows[0];
          if (!unit)
            throw Object.assign(
              new Error(
                `No in-stock unit ${part.serial_no} of ${itemInfo.name}`,
              ),
              { status: 400 },
            );
        }
        const s = await client.query(
          "SELECT * FROM inv_stock WHERE item_id=$1 FOR UPDATE",
          [part.item_id],
        );
        if (!s.rows[0] || s.rows[0].qty_available < qty) {
          throw new Error(
            `Insufficient stock for: ${itemInfo?.name || part.item_id}`,
          );
        }
        // Consumed, not on loan: the part now lives inside the repaired asset,
        // so it leaves qty_available without ever entering qty_assigned.
        await client.query(
          `UPDATE inv_stock SET qty_available = qty_available - $1, updated_at = NOW()
           WHERE item_id = $2`,
          [qty, part.item_id],
        );
        await client.query(
          `INSERT INTO inv_adjustments
             (item_id, type, qty_change, reference_type, reference_id, notes, performed_by)
           VALUES ($1, 'repair_consumption', $2, 'maintenance_log', $3, $4, $5)`,
          [
            part.item_id,
            -qty,
            entry.id,
            `Consumed by ${type} #${id} — ${event_type}`,
            req.user.id,
          ],
        );
        const partRow = await client.query(
          `INSERT INTO maintenance_parts
             (maintenance_log_id, item_id, qty, unit_cost_pkr, serial_no, notes)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [
            entry.id,
            part.item_id,
            qty,
            part.unit_cost_pkr || unit?.cost_pkr || null,
            part.serial_no || null,
            part.notes || null,
          ],
        );
        if (unit) {
          await client.query(
            `UPDATE inv_units SET status='installed', installed_asset_type=$1,
                    installed_asset_id=$2, maintenance_part_id=$3, updated_at=NOW()
             WHERE id=$4`,
            [type, id, partRow.rows[0].id, unit.id],
          );
        }
      }
      await client.query("COMMIT");

      for (const itemId of new Set(parts.map((part) => part.item_id)))
        await checkAlerts(itemId);

      // Re-select so the response carries parts + totals — the frontend
      // renders this row optimistically and must not show a bare entry.
      const full = await db.query(`${ENTRY_SELECT} WHERE m.id = $1`, [
        entry.id,
      ]);
      const saved = full.rows[0];

      const partsCost = Number(saved.parts_cost_pkr) || 0;
      const details =
        `Maintenance entry logged` +
        (parts.length
          ? `, ${parts.length} part(s) consumed (parts PKR ${partsCost})`
          : "") +
        (cost_pkr ? ` (labor PKR ${cost_pkr})` : "");
      await logActivity(
        req.user.id,
        "created",
        "maintenance_log",
        entry.id,
        `${type} #${id} — ${event_type}`,
        details,
        getIP(req),
      );
      res.json(saved);
    } catch (e) {
      await client.query("ROLLBACK");
      next(e);
    } finally {
      client.release();
    }
  },
);

// Deleting an entry used to destroy it outright with no record. It now goes
// through the Recycle Bin like every other delete, so a maintenance history
// cannot be quietly rewritten.
//
// Consumed parts are NOT returned to stock unless ?restock=true: the part is
// physically inside the repaired asset, so deleting the log entry is normally
// a bookkeeping correction, not a return. Restocking writes a compensating
// ledger row — the original consumption rows are never deleted.
router.delete("/:entryId", requireAuth, async (req, res, next) => {
  try {
    const existing = await db.query(
      "SELECT * FROM maintenance_log WHERE id = $1",
      [req.params.entryId],
    );
    const row = existing.rows[0];
    if (!row) return res.status(404).json({ error: "Not found" });
    const restock = req.query.restock === "true";

    const mod = PERM_MODULE[row.asset_type] || "systems";
    return perm(mod, "delete")(req, res, async () => {
      const client = await db.connect();
      try {
        const partsRes = await db.query(
          `SELECT mp.*, i.name AS item_name FROM maintenance_parts mp
           JOIN inv_items i ON i.id = mp.item_id
           WHERE mp.maintenance_log_id = $1`,
          [row.id],
        );
        const parts = partsRes.rows;
        const label = `${row.asset_type} #${row.asset_id} — ${row.event_type}`;

        await client.query("BEGIN");
        if (restock) {
          for (const part of parts) {
            await client.query(
              `UPDATE inv_stock SET qty_available = qty_available + $1, updated_at = NOW()
               WHERE item_id = $2`,
              [part.qty, part.item_id],
            );
            await client.query(
              `INSERT INTO inv_adjustments
                 (item_id, type, qty_change, reference_type, reference_id, notes, performed_by)
               VALUES ($1, 'repair_restock', $2, 'maintenance_log', $3, $4, $5)`,
              [
                part.item_id,
                part.qty,
                row.id,
                `Restocked on deletion of ${label}`,
                req.user.id,
              ],
            );
            // A unit installed by this repair goes back on the shelf.
            await client.query(
              `UPDATE inv_units SET status='in_stock', installed_asset_type=NULL,
                      installed_asset_id=NULL, maintenance_part_id=NULL, updated_at=NOW()
               WHERE maintenance_part_id = $1`,
              [part.id],
            );
          }
        }
        // The recycle payload stays the bare maintenance_log row — restore
        // re-inserts every JSON key as a column, so parts cannot ride along.
        // Their snapshot lives in the activity log entry below instead.
        await saveToRecycleBin(
          "maintenance",
          "maintenance_log",
          row,
          label,
          req.user.id,
          client,
        );
        await client.query("DELETE FROM maintenance_log WHERE id = $1", [
          row.id,
        ]);
        await client.query("COMMIT");

        if (restock)
          for (const itemId of new Set(parts.map((part) => part.item_id)))
            await checkAlerts(itemId);

        await logActivity(
          req.user.id,
          "deleted",
          "maintenance_log",
          row.id,
          label,
          `Maintenance entry moved to Recycle Bin${
            parts.length
              ? ` (${parts.length} part(s) ${restock ? "returned to stock" : "kept consumed"})`
              : ""
          }`,
          getIP(req),
          parts.length
            ? {
                parts: parts.map((part) => ({
                  item_id: part.item_id,
                  item_name: part.item_name,
                  qty: part.qty,
                  unit_cost_pkr: part.unit_cost_pkr,
                })),
                restocked: restock,
              }
            : null,
        );
        res.json({ ok: true });
      } catch (e) {
        await client.query("ROLLBACK");
        next(e);
      } finally {
        client.release();
      }
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
