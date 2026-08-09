const router = require("express").Router();
const db = require("../config/db");
const { logActivity, diffRows } = require("../utils/activity");
const { requireAuth, perm } = require("../middleware/auth");

// Delegates to the shared helper so this route's entries also capture
// user_label (which survives account deletion) and the field-level diff.
async function log(userId, action, id, label, details, changes) {
  await logActivity(
    userId,
    action,
    "inventory",
    id,
    label,
    details,
    null,
    changes,
  );
}

async function checkAlerts(itemId, client) {
  const q = client || db;
  const r = await q.query(
    "SELECT s.qty_available, s.reorder_level, i.name FROM inv_stock s JOIN inv_items i ON i.id=s.item_id WHERE s.item_id=$1",
    [itemId],
  );
  if (!r.rows[0]) return;
  const { qty_available, reorder_level, name } = r.rows[0];
  let alertType = null;
  if (qty_available === 0) alertType = "out_of_stock";
  else if (qty_available <= reorder_level) alertType = "low_stock";

  if (alertType) {
    // The casts are load-bearing: with untyped parameters Postgres deduces
    // $2 as text in the SELECT list but varchar in the WHERE clause and
    // rejects the statement — this INSERT had never succeeded without them.
    await q.query(
      `INSERT INTO inv_alerts (item_id, alert_type, threshold_value, current_value)
       SELECT $1::int, $2::varchar, $3::int, $4::int WHERE NOT EXISTS (
         SELECT 1 FROM inv_alerts WHERE item_id=$1::int AND alert_type=$2::varchar AND is_resolved=false
       )`,
      [itemId, alertType, reorder_level, qty_available],
    );
    // An item can only be in one state: recovering from out_of_stock to
    // low_stock (or vice versa) must retire the alert of the other type,
    // or both banners show at once.
    await q.query(
      `UPDATE inv_alerts SET is_resolved=true, resolved_at=NOW()
       WHERE item_id=$1 AND is_resolved=false AND alert_type <> $2::varchar`,
      [itemId, alertType],
    );
  } else {
    await q.query(
      `UPDATE inv_alerts SET is_resolved=true, resolved_at=NOW()
       WHERE item_id=$1 AND is_resolved=false`,
      [itemId],
    );
  }
}

// ── CATEGORIES ────────────────────────────────────────────

router.get("/categories", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT c.*, p.name AS parent_name
       FROM inv_categories c
       LEFT JOIN inv_categories p ON p.id = c.parent_id
       WHERE c.is_active = true
       ORDER BY c.sort_order, c.name`,
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

router.post(
  "/categories",
  requireAuth,
  perm("inventory", "create"),
  async (req, res, next) => {
    try {
      const { name, parent_id, description, icon, sort_order } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      const r = await db.query(
        `INSERT INTO inv_categories (name, parent_id, description, icon, sort_order)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          name,
          parent_id || null,
          description || null,
          icon || "package",
          sort_order || 0,
        ],
      );
      await log(req.user.id, "CREATE", r.rows[0].id, name, `Category created`);
      res.json(r.rows[0]);
    } catch (e) {
      next(e);
    }
  },
);

router.put(
  "/categories/:id",
  requireAuth,
  perm("inventory", "update"),
  async (req, res, next) => {
    try {
      const { name, parent_id, description, icon, sort_order, is_active } =
        req.body;
      const before = await db.query(
        "SELECT * FROM inv_categories WHERE id=$1",
        [req.params.id],
      );
      const r = await db.query(
        `UPDATE inv_categories SET name=$1, parent_id=$2, description=$3, icon=$4, sort_order=$5, is_active=$6
       WHERE id=$7 RETURNING *`,
        [
          name,
          parent_id || null,
          description || null,
          icon || "package",
          sort_order || 0,
          is_active !== false,
          req.params.id,
        ],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      const changes = diffRows(before.rows[0], r.rows[0]);
      await log(
        req.user.id,
        "updated",
        r.rows[0].id,
        r.rows[0].name,
        changes
          ? `Category updated: ${Object.keys(changes).join(", ")}`
          : "Category updated (no field changes)",
        changes,
      );
      res.json(r.rows[0]);
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/categories/:id",
  requireAuth,
  perm("inventory", "delete"),
  async (req, res, next) => {
    try {
      // Deactivates rather than deletes, so nothing is destroyed here.
      const r = await db.query(
        "UPDATE inv_categories SET is_active=false WHERE id=$1 RETURNING *",
        [req.params.id],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      await log(
        req.user.id,
        "deactivated",
        r.rows[0].id,
        r.rows[0].name,
        "Category marked inactive (record retained)",
      );
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);

// ── ITEMS ─────────────────────────────────────────────────

router.get("/items", requireAuth, async (req, res, next) => {
  try {
    const { q, category_id, tracking_type } = req.query;
    let sql = `
      SELECT i.*,
             c.name AS category_name,
             s.qty_available, s.qty_assigned, s.qty_reserved, s.qty_damaged,
             s.reorder_level, s.reorder_qty,
             CASE
               WHEN s.qty_available = 0            THEN 'out_of_stock'
               WHEN s.qty_available <= s.reorder_level THEN 'low_stock'
               ELSE 'in_stock'
             END AS stock_status
      FROM inv_items i
      LEFT JOIN inv_categories c ON c.id = i.category_id
      LEFT JOIN inv_stock s ON s.item_id = i.id
      WHERE i.is_active = true`;
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (i.name ILIKE $${params.length} OR i.model ILIKE $${params.length} OR i.sku ILIKE $${params.length})`;
    }
    if (category_id) {
      params.push(category_id);
      sql += ` AND i.category_id = $${params.length}`;
    }
    if (tracking_type) {
      params.push(tracking_type);
      sql += ` AND i.tracking_type = $${params.length}`;
    }
    sql += " ORDER BY i.name";
    const r = await db.query(sql, params);
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

router.post(
  "/items",
  requireAuth,
  perm("inventory", "create"),
  async (req, res, next) => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const {
        name,
        category_id,
        description,
        model,
        manufacturer,
        sku,
        tracking_type,
        unit,
        initial_qty,
        reorder_level,
        reorder_qty,
      } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      const ir = await client.query(
        `INSERT INTO inv_items (name, category_id, description, model, manufacturer, sku, tracking_type, unit, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          name,
          category_id || null,
          description || null,
          model || null,
          manufacturer || null,
          sku || null,
          tracking_type || "quantity",
          unit || "pcs",
          req.user.id,
        ],
      );
      const item = ir.rows[0];
      const qty = parseInt(initial_qty) || 0;
      await client.query(
        `INSERT INTO inv_stock (item_id, qty_available, reorder_level, reorder_qty)
       VALUES ($1,$2,$3,$4)`,
        [
          item.id,
          qty,
          parseInt(reorder_level) || 5,
          parseInt(reorder_qty) || 10,
        ],
      );
      if (qty > 0) {
        await client.query(
          `INSERT INTO inv_adjustments (item_id, type, qty_change, notes, performed_by)
         VALUES ($1,'purchase',$2,'Initial stock',$3)`,
          [item.id, qty, req.user.id],
        );
      }
      await client.query("COMMIT");
      await checkAlerts(item.id);
      await log(
        req.user.id,
        "CREATE",
        item.id,
        name,
        `Item created, initial qty: ${qty}`,
      );
      res.json(item);
    } catch (e) {
      await client.query("ROLLBACK");
      next(e);
    } finally {
      client.release();
    }
  },
);

router.put(
  "/items/:id",
  requireAuth,
  perm("inventory", "update"),
  async (req, res, next) => {
    try {
      const {
        name,
        category_id,
        description,
        model,
        manufacturer,
        sku,
        tracking_type,
        unit,
        reorder_level,
        reorder_qty,
      } = req.body;
      const before = await db.query("SELECT * FROM inv_items WHERE id=$1", [
        req.params.id,
      ]);
      const r = await db.query(
        `UPDATE inv_items SET name=$1, category_id=$2, description=$3, model=$4, manufacturer=$5,
        sku=$6, tracking_type=$7, unit=$8, updated_at=NOW()
       WHERE id=$9 AND is_active=true RETURNING *`,
        [
          name,
          category_id || null,
          description || null,
          model || null,
          manufacturer || null,
          sku || null,
          tracking_type || "quantity",
          unit || "pcs",
          req.params.id,
        ],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      if (reorder_level !== undefined || reorder_qty !== undefined) {
        await db.query(
          `UPDATE inv_stock SET reorder_level=COALESCE($1,reorder_level), reorder_qty=COALESCE($2,reorder_qty)
         WHERE item_id=$3`,
          [
            reorder_level !== undefined ? parseInt(reorder_level) : null,
            reorder_qty !== undefined ? parseInt(reorder_qty) : null,
            req.params.id,
          ],
        );
      }
      await checkAlerts(parseInt(req.params.id));
      const changes = diffRows(before.rows[0], r.rows[0]);
      await log(
        req.user.id,
        "updated",
        r.rows[0].id,
        r.rows[0].name,
        changes
          ? `Item updated: ${Object.keys(changes).join(", ")}`
          : "Item updated (no field changes)",
        changes,
      );
      res.json(r.rows[0]);
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/items/:id",
  requireAuth,
  perm("inventory", "delete"),
  async (req, res, next) => {
    try {
      const r = await db.query(
        "UPDATE inv_items SET is_active=false WHERE id=$1 RETURNING name",
        [req.params.id],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      await log(
        req.user.id,
        "DELETE",
        parseInt(req.params.id),
        r.rows[0].name,
        "Item deactivated",
      );
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);

// ── STOCK ADJUSTMENT (add/remove stock manually) ──────────

router.post(
  "/items/:id/adjust",
  requireAuth,
  perm("inventory", "update"),
  async (req, res, next) => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const { type, qty_change, notes } = req.body;
      const change = parseInt(qty_change);
      if (!change)
        return res.status(400).json({ error: "qty_change is required" });
      const allowed = [
        "purchase",
        "correction",
        "damaged",
        "lost",
        "retired",
        "write_off",
      ];
      if (!allowed.includes(type))
        return res.status(400).json({ error: "Invalid type" });

      const sr = await client.query(
        "SELECT * FROM inv_stock WHERE item_id=$1 FOR UPDATE",
        [req.params.id],
      );
      if (!sr.rows[0]) return res.status(404).json({ error: "Item not found" });
      const stock = sr.rows[0];

      // Serialized stock is a count of units; a raw quantity bump would
      // desync it from the units table. Move the units instead.
      const trk = await client.query(
        "SELECT tracking_type FROM inv_items WHERE id=$1",
        [req.params.id],
      );
      if (trk.rows[0]?.tracking_type === "serialized") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error:
            "This item is serialized — adjust it by adding units or changing a unit's status",
        });
      }

      let update;
      if (type === "purchase" || (type === "correction" && change > 0)) {
        update = `qty_available = qty_available + ${change}`;
      } else if (type === "damaged") {
        if (stock.qty_available < Math.abs(change)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Not enough available stock" });
        }
        update = `qty_available = qty_available - ${Math.abs(change)}, qty_damaged = qty_damaged + ${Math.abs(change)}`;
      } else if (type === "lost" || type === "retired") {
        if (stock.qty_available < Math.abs(change)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Not enough available stock" });
        }
        update = `qty_available = qty_available - ${Math.abs(change)}`;
      } else if (type === "write_off") {
        // Write off all remaining stock and archive the item
        update = `qty_available = 0, qty_damaged = 0, qty_reserved = 0`;
        await client.query(
          `UPDATE inv_items SET is_active = false WHERE id = $1`,
          [req.params.id],
        );
      } else if (type === "correction" && change < 0) {
        update = `qty_available = GREATEST(0, qty_available + ${change})`;
      }

      await client.query(
        `UPDATE inv_stock SET ${update}, updated_at=NOW() WHERE item_id=$1`,
        [req.params.id],
      );
      await client.query(
        `INSERT INTO inv_adjustments (item_id, type, qty_change, notes, performed_by)
       VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, type, change, notes || null, req.user.id],
      );
      await client.query("COMMIT");
      await checkAlerts(parseInt(req.params.id));
      const item = await db.query("SELECT name FROM inv_items WHERE id=$1", [
        req.params.id,
      ]);
      await log(
        req.user.id,
        "STOCK_ADJUST",
        parseInt(req.params.id),
        item.rows[0]?.name,
        `${type}: ${change > 0 ? "+" : ""}${change}`,
      );
      res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK");
      next(e);
    } finally {
      client.release();
    }
  },
);

// ── ITEM HISTORY ──────────────────────────────────────────

router.get("/items/:id/history", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT a.*, u.name AS performed_by_name
       FROM inv_adjustments a
       LEFT JOIN users u ON u.id = a.performed_by
       WHERE a.item_id = $1
       ORDER BY a.created_at DESC LIMIT 100`,
      [req.params.id],
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

// ── ALERTS ────────────────────────────────────────────────

router.get("/alerts", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT a.*, i.name AS item_name, c.name AS category_name
       FROM inv_alerts a
       JOIN inv_items i ON i.id = a.item_id
       LEFT JOIN inv_categories c ON c.id = i.category_id
       WHERE a.is_resolved = false
       ORDER BY a.alert_type DESC, a.created_at DESC`,
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

router.post(
  "/alerts/:id/resolve",
  requireAuth,
  perm("inventory", "update"),
  async (req, res, next) => {
    try {
      const r = await db.query(
        "UPDATE inv_alerts SET is_resolved=true, resolved_at=NOW() WHERE id=$1 RETURNING *",
        [req.params.id],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      await log(
        req.user.id,
        "resolved",
        r.rows[0].id,
        `Alert #${r.rows[0].id}`,
        "Stock alert marked resolved",
      );
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);

// ── STATS ─────────────────────────────────────────────────

router.get("/stats", requireAuth, async (req, res, next) => {
  try {
    const [items, stock, alerts, pending] = await Promise.all([
      db.query("SELECT COUNT(*) FROM inv_items WHERE is_active=true"),
      db.query(`
        SELECT
          SUM(qty_available) AS total_available,
          SUM(qty_assigned)  AS total_assigned,
          COUNT(*) FILTER (WHERE qty_available = 0)              AS out_of_stock,
          COUNT(*) FILTER (WHERE qty_available > 0 AND qty_available <= reorder_level) AS low_stock
        FROM inv_stock s JOIN inv_items i ON i.id=s.item_id WHERE i.is_active=true`),
      db.query("SELECT COUNT(*) FROM inv_alerts WHERE is_resolved=false"),
      db.query(
        "SELECT COUNT(*) FROM inv_requests WHERE status IN ('submitted','in_review','approved')",
      ),
    ]);
    res.json({
      total_items: parseInt(items.rows[0].count),
      total_available: parseInt(stock.rows[0].total_available) || 0,
      total_assigned: parseInt(stock.rows[0].total_assigned) || 0,
      out_of_stock: parseInt(stock.rows[0].out_of_stock) || 0,
      low_stock: parseInt(stock.rows[0].low_stock) || 0,
      active_alerts: parseInt(alerts.rows[0].count) || 0,
      pending_requests: parseInt(pending.rows[0].count) || 0,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = { router, checkAlerts };
