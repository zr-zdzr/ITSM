const router = require("express").Router();
const db = require("../config/db");
const { logActivity, diffRows } = require("../utils/activity");
const { requireAuth, perm } = require("../middleware/auth");
const { checkAlerts } = require("./inventory");

// Delegates to the shared helper so this route's entries also capture
// user_label (which survives account deletion) and the field-level diff.
async function log(userId, action, id, label, details, changes) {
  await logActivity(
    userId,
    action,
    "inv_assignments",
    id,
    label,
    details,
    null,
    changes,
  );
}

const ASN_DETAIL_SQL = `
  SELECT a.*,
         e.full_name AS assignee_name,
         e.email AS assignee_email,
         e.department, e.designation,
         u.name AS assigned_by_name
  FROM inv_assignments a
  JOIN employees e ON e.id = a.assignee_id
  JOIN users u ON u.id = a.assigned_by`;

const ASN_ITEMS_SQL = `
  SELECT ai.*, i.name AS item_name, i.unit, i.tracking_type,
         c.name AS category_name
  FROM inv_assignment_items ai
  JOIN inv_items i ON i.id = ai.item_id
  LEFT JOIN inv_categories c ON c.id = i.category_id
  WHERE ai.assignment_id = $1
  ORDER BY ai.id`;

// ── LIST ──────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { status, employee_id } = req.query;
    let sql = `${ASN_DETAIL_SQL} WHERE 1=1`;
    const params = [];
    if (status) {
      params.push(status);
      sql += ` AND a.status = $${params.length}`;
    } else {
      sql += ` AND a.status != 'fully_returned'`;
    }
    if (employee_id) {
      params.push(employee_id);
      sql += ` AND a.assignee_id = $${params.length}`;
    }
    sql += " ORDER BY a.created_at DESC";
    const r = await db.query(sql, params);
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

router.get("/employee/:employeeId", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(
      `${ASN_DETAIL_SQL} WHERE a.assignee_id = $1 ORDER BY a.created_at DESC`,
      [req.params.employeeId],
    );
    const assignments = r.rows;
    // Attach items to each assignment
    for (const asn of assignments) {
      const items = await db.query(ASN_ITEMS_SQL, [asn.id]);
      asn.items = items.rows;
    }
    res.json(assignments);
  } catch (e) {
    next(e);
  }
});

router.get("/stats", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')             AS active,
        COUNT(*) FILTER (WHERE status = 'partially_returned') AS partially_returned,
        COUNT(*) FILTER (WHERE status = 'fully_returned')     AS fully_returned,
        COUNT(*)                                              AS total
      FROM inv_assignments`);
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// ── GET SINGLE ────────────────────────────────────────────

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(`${ASN_DETAIL_SQL} WHERE a.id = $1`, [
      req.params.id,
    ]);
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    const items = await db.query(ASN_ITEMS_SQL, [req.params.id]);
    res.json({ ...r.rows[0], items: items.rows });
  } catch (e) {
    next(e);
  }
});

// ── DIRECT ASSIGNMENT (no request) ───────────────────────

router.post(
  "/direct",
  requireAuth,
  perm("inventory", "update"),
  async (req, res, next) => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const { assignee_id, items, expected_return_date, notes } = req.body;
      if (!assignee_id) throw new Error("assignee_id required");
      if (!items?.length) throw new Error("At least one item required");

      for (const item of items) {
        const ir0 = await client.query(
          "SELECT name, tracking_type FROM inv_items WHERE id=$1",
          [item.item_id],
        );
        if (ir0.rows[0]?.tracking_type === "serialized")
          throw new Error(
            `${ir0.rows[0].name} is serialized — units move through repairs or unit status changes, not assignments`,
          );
        const s = await client.query(
          "SELECT * FROM inv_stock WHERE item_id=$1 FOR UPDATE",
          [item.item_id],
        );
        if (!s.rows[0] || s.rows[0].qty_available < item.qty) {
          const ir = await client.query(
            "SELECT name FROM inv_items WHERE id=$1",
            [item.item_id],
          );
          throw new Error(
            `Insufficient stock for: ${ir.rows[0]?.name || item.item_id}`,
          );
        }
        await client.query(
          `UPDATE inv_stock SET qty_available=qty_available-$1, qty_assigned=qty_assigned+$1, updated_at=NOW()
         WHERE item_id=$2`,
          [item.qty, item.item_id],
        );
        await client.query(
          `INSERT INTO inv_adjustments (item_id, type, qty_change, reference_type, notes, performed_by)
         VALUES ($1,'assignment',$2,'direct',$3,$4)`,
          [item.item_id, -item.qty, notes || "Direct assignment", req.user.id],
        );
      }

      const asnNum = await (async () => {
        const r = await client.query("SELECT nextval('inv_asn_seq') AS n");
        return `ASN-${new Date().getFullYear()}-${String(r.rows[0].n).padStart(4, "0")}`;
      })();

      const asnRow = await client.query(
        `INSERT INTO inv_assignments (asn_number, assignee_id, assigned_by, expected_return_date, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          asnNum,
          assignee_id,
          req.user.id,
          expected_return_date || null,
          notes || null,
        ],
      );
      const asn = asnRow.rows[0];

      for (const item of items) {
        await client.query(
          `INSERT INTO inv_assignment_items (assignment_id, item_id, qty) VALUES ($1,$2,$3)`,
          [asn.id, item.item_id, item.qty],
        );
      }

      await client.query("COMMIT");
      for (const item of items) await checkAlerts(item.item_id);
      await log(
        req.user.id,
        "ASSIGN",
        asn.id,
        asnNum,
        `Direct assignment to employee #${assignee_id}`,
      );
      res.json(asn);
    } catch (e) {
      await client.query("ROLLBACK");
      next(e);
    } finally {
      client.release();
    }
  },
);

// ── PROCESS RETURN ────────────────────────────────────────

router.post(
  "/:id/return",
  requireAuth,
  perm("inventory", "update"),
  async (req, res, next) => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const { returned_by, items, notes } = req.body;
      // items: [{ assignment_item_id, qty, condition: 'good'|'damaged'|'lost' }]
      if (!returned_by) throw new Error("returned_by (employee id) required");
      if (!items?.length) throw new Error("No items specified for return");

      const asn = await client.query(
        "SELECT * FROM inv_assignments WHERE id=$1 FOR UPDATE",
        [req.params.id],
      );
      if (!asn.rows[0]) throw new Error("Assignment not found");

      const retNum = await (async () => {
        const r = await client.query("SELECT nextval('inv_ret_seq') AS n");
        return `RET-${new Date().getFullYear()}-${String(r.rows[0].n).padStart(4, "0")}`;
      })();

      const retRow = await client.query(
        `INSERT INTO inv_returns (ret_number, assignment_id, returned_by, received_by, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [retNum, req.params.id, returned_by, req.user.id, notes || null],
      );
      const ret = retRow.rows[0];

      for (const item of items) {
        const ai = await client.query(
          "SELECT * FROM inv_assignment_items WHERE id=$1 AND assignment_id=$2 FOR UPDATE",
          [item.assignment_item_id, req.params.id],
        );
        if (!ai.rows[0]) continue;
        const aItem = ai.rows[0];
        const backToStock = item.condition === "good";

        await client.query(
          `INSERT INTO inv_return_items (return_id, assignment_item_id, qty, condition, back_to_stock, notes)
         VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            ret.id,
            aItem.id,
            item.qty || aItem.qty,
            item.condition || "good",
            backToStock,
            item.notes || null,
          ],
        );

        await client.query(
          `UPDATE inv_assignment_items SET status=$1, returned_at=NOW(), return_condition=$2
         WHERE id=$3`,
          [
            item.condition === "good" ? "returned" : item.condition,
            item.condition,
            aItem.id,
          ],
        );

        // Update stock
        await client.query(
          `UPDATE inv_stock SET
           qty_assigned = GREATEST(0, qty_assigned - $1),
           qty_available = qty_available + $2,
           qty_damaged = qty_damaged + $3,
           updated_at = NOW()
         WHERE item_id = $4`,
          [
            item.qty || aItem.qty,
            backToStock ? item.qty || aItem.qty : 0,
            item.condition === "damaged" ? item.qty || aItem.qty : 0,
            aItem.item_id,
          ],
        );

        await client.query(
          `INSERT INTO inv_adjustments (item_id, type, qty_change, reference_type, reference_id, notes, performed_by)
         VALUES ($1,$2,$3,'inv_returns',$4,$5,$6)`,
          [
            aItem.item_id,
            backToStock ? "return_to_stock" : item.condition,
            backToStock ? item.qty || aItem.qty : -(item.qty || aItem.qty),
            ret.id,
            `Return: ${item.condition}`,
            req.user.id,
          ],
        );

        await checkAlerts(aItem.item_id);
      }

      // Update assignment status
      const remaining = await client.query(
        "SELECT COUNT(*) FROM inv_assignment_items WHERE assignment_id=$1 AND status='active'",
        [req.params.id],
      );
      const newStatus =
        parseInt(remaining.rows[0].count) === 0
          ? "fully_returned"
          : "partially_returned";
      await client.query(
        "UPDATE inv_assignments SET status=$1, updated_at=NOW() WHERE id=$2",
        [newStatus, req.params.id],
      );

      await client.query("COMMIT");
      await log(
        req.user.id,
        "RETURN",
        parseInt(req.params.id),
        asn.rows[0].asn_number,
        `Return ${retNum} processed, status → ${newStatus}`,
      );
      res.json({ ok: true, return: ret, assignment_status: newStatus });
    } catch (e) {
      await client.query("ROLLBACK");
      next(e);
    } finally {
      client.release();
    }
  },
);

module.exports = router;
