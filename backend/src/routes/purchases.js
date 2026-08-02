const router = require("express").Router();
const db = require("../config/db");
const { requireAuth, perm } = require("../middleware/auth");
const { logActivity, getIP } = require("../utils/activity");

// Asset types that support buyout. permModule maps to user_permissions.module;
// hasAssignee marks tables that carry assigned_user_id (cleared on sale).
// historyType is the SINGULAR asset_type used everywhere in asset_history
// (matches systems.js/mobiles.js/network.js and AssetHistoryTimeline), so the
// buyout event shows up in the asset's timeline.
const BUYABLE = {
  systems: {
    table: "systems",
    permModule: "systems",
    hasAssignee: true,
    historyType: "system",
  },
  mobiles: {
    table: "mobiles",
    permModule: "mobiles",
    hasAssignee: true,
    historyType: "mobile",
  },
  network_devices: {
    table: "network_devices",
    permModule: "network",
    hasAssignee: false,
    historyType: "network",
  },
};

function assetLabel(row) {
  return (
    row.asset_tag ||
    row.serial_number ||
    `${row.manufacturer || ""} ${row.model || ""}`.trim() ||
    null
  );
}

// Update permission for a specific asset module (buyout is cross-module,
// so it can't use the static perm() middleware).
async function canUpdate(user, module) {
  if (user.role === "super_admin") return true;
  if (user.role === "viewer") return false;
  const r = await db.query(
    "SELECT can_update FROM user_permissions WHERE user_id=$1 AND module=$2",
    [user.id, module],
  );
  return !!r.rows[0]?.can_update;
}

const PURCHASE_SELECT = `
  SELECT ap.*,
         be.full_name AS buyer_name,
         u.name       AS performed_by_name
  FROM asset_purchases ap
  LEFT JOIN employees be ON be.id = ap.buyer_employee_id
  LEFT JOIN users     u  ON u.id  = ap.performed_by`;

// ── LIST all buyouts ──────────────────────────────────────
router.get(
  "/",
  requireAuth,
  perm("systems", "read"),
  async (req, res, next) => {
    try {
      const { asset_type, employee_id } = req.query;
      let where = "WHERE 1=1";
      const params = [];
      if (asset_type) {
        params.push(asset_type);
        where += ` AND ap.asset_type=$${params.length}`;
      }
      if (employee_id) {
        params.push(employee_id);
        where += ` AND ap.buyer_employee_id=$${params.length}`;
      }
      const r = await db.query(
        `${PURCHASE_SELECT} ${where} ORDER BY ap.sale_date DESC, ap.id DESC`,
        params,
      );
      res.json(r.rows);
    } catch (e) {
      next(e);
    }
  },
);

// ── Buyouts by a specific employee ────────────────────────
router.get(
  "/employee/:employeeId",
  requireAuth,
  perm("systems", "read"),
  async (req, res, next) => {
    try {
      const r = await db.query(
        `${PURCHASE_SELECT} WHERE ap.buyer_employee_id=$1 ORDER BY ap.sale_date ASC`,
        [req.params.employeeId],
      );
      res.json(r.rows);
    } catch (e) {
      next(e);
    }
  },
);

// ── Buyout record for a single asset (or null) ────────────
router.get(
  "/:assetType/:assetId",
  requireAuth,
  perm("systems", "read"),
  async (req, res, next) => {
    try {
      const r = await db.query(
        `${PURCHASE_SELECT} WHERE ap.asset_type=$1 AND ap.asset_id=$2`,
        [req.params.assetType, req.params.assetId],
      );
      res.json(r.rows[0] || null);
    } catch (e) {
      next(e);
    }
  },
);

// ── Record a buyout ───────────────────────────────────────
router.post("/", requireAuth, async (req, res, next) => {
  const {
    asset_type,
    asset_id,
    buyer_employee_id,
    sale_price_pkr,
    book_value_pkr,
    sale_date,
    invoice_number,
    payment_reference,
    notes,
  } = req.body;

  const cfg = BUYABLE[asset_type];
  if (!cfg)
    return res
      .status(400)
      .json({ error: `Unsupported asset_type for buyout: ${asset_type}` });
  if (!asset_id) return res.status(400).json({ error: "asset_id is required" });
  if (!buyer_employee_id)
    return res.status(400).json({ error: "buyer_employee_id is required" });
  if (sale_price_pkr == null || Number(sale_price_pkr) < 0) {
    return res
      .status(400)
      .json({ error: "sale_price_pkr must be a non-negative number" });
  }
  if (!(await canUpdate(req.user, cfg.permModule))) {
    return res.status(403).json({ error: "Permission denied" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Lock the asset row so two buyouts can't race.
    const a = await client.query(
      `SELECT * FROM ${cfg.table} WHERE id=$1 FOR UPDATE`,
      [asset_id],
    );
    const asset = a.rows[0];
    if (!asset) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Asset not found" });
    }
    if (asset.status === "sold") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Asset is already sold" });
    }

    const buyer = await client.query(
      "SELECT full_name FROM employees WHERE id=$1",
      [buyer_employee_id],
    );
    if (!buyer.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Buyer employee not found" });
    }

    const label = assetLabel(asset);
    const fromEmployeeId = cfg.hasAssignee
      ? asset.assigned_user_id || null
      : null;

    // 1) Append-only purchase ledger row (unique index blocks a double sale).
    const purchase = await client.query(
      `INSERT INTO asset_purchases
         (asset_type, asset_id, asset_label, buyer_employee_id, buyer_name_snapshot,
          sale_price_pkr, book_value_pkr, sale_date, invoice_number, payment_reference,
          notes, performed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, CURRENT_DATE),$9,$10,$11,$12)
       RETURNING *`,
      [
        asset_type,
        asset_id,
        label,
        buyer_employee_id,
        buyer.rows[0].full_name,
        sale_price_pkr,
        book_value_pkr ?? asset.purchase_price_pkr ?? null,
        sale_date || null,
        invoice_number || null,
        payment_reference || null,
        notes || null,
        req.user.id,
      ],
    );

    // 2) Append an immutable asset_history 'purchased' event.
    await client.query(
      `INSERT INTO asset_history
         (asset_type, asset_id, asset_label, event_type,
          from_employee_id, to_employee_id, from_status, to_status,
          reason, notes, performed_by)
       VALUES ($1,$2,$3,'purchased',$4,NULL,$5,'sold','buyout',$6,$7)`,
      [
        cfg.historyType,
        asset_id,
        label,
        fromEmployeeId,
        asset.status || null,
        notes || null,
        req.user.id,
      ],
    );

    // 3) Terminal state on the asset; ownership left the company.
    if (cfg.hasAssignee) {
      await client.query(
        `UPDATE ${cfg.table} SET status='sold', assigned_type='inventory', assigned_user_id=NULL, updated_at=NOW() WHERE id=$1`,
        [asset_id],
      );
    } else {
      await client.query(
        `UPDATE ${cfg.table} SET status='sold', updated_at=NOW() WHERE id=$1`,
        [asset_id],
      );
    }

    await client.query("COMMIT");

    await logActivity(
      req.user.id,
      "BUYOUT",
      asset_type,
      asset_id,
      label,
      `Sold to ${buyer.rows[0].full_name} for PKR ${sale_price_pkr}`,
      getIP(req),
    );
    res.status(201).json(purchase.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    // Unique-index violation => asset already has a buyout row.
    if (e.code === "23505")
      return res.status(409).json({ error: "Asset is already sold" });
    next(e);
  } finally {
    client.release();
  }
});

module.exports = router;
