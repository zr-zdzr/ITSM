const router = require("express").Router();
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

// Whitelist tables and their updatable columns
const ALLOWED = {
  systems: ["status", "condition", "department", "location", "notes"],
  mobiles: ["status", "condition", "notes"],
  network_devices: ["status", "condition", "notes"],
  sims: ["status", "notes"],
  gws_accounts: ["status", "notes"],
  employees: ["status", "department", "notes"],
  vendors: ["category", "notes"],
};

// PATCH /api/bulk  { table, ids, updates }
router.patch("/", requireAuth, async (req, res, next) => {
  const { table, ids, updates } = req.body;

  if (!ALLOWED[table]) return res.status(400).json({ error: "Invalid table" });
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ error: "No IDs provided" });
  if (!updates || typeof updates !== "object")
    return res.status(400).json({ error: "No updates provided" });

  const allowedCols = ALLOWED[table];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [col, val] of Object.entries(updates)) {
    if (!allowedCols.includes(col)) continue;
    if (val === "" || val === null || val === undefined) continue;
    sets.push(`${col} = $${i++}`);
    vals.push(val);
  }
  if (sets.length === 0)
    return res.status(400).json({ error: "No valid fields to update" });

  // Parameterized id list
  const idPlaceholders = ids.map((_, j) => `$${i + j}`).join(", ");
  vals.push(...ids);

  const sql = `UPDATE ${table} SET ${sets.join(", ")} WHERE id IN (${idPlaceholders})`;

  try {
    await db.query(sql, vals);
    // Activity log — one entry per asset would be too noisy; log a summary
    await db.query(
      "INSERT INTO activity_log (user_id, action, table_name, record_id, record_label, details) VALUES ($1,$2,$3,$4,$5,$6)",
      [
        req.user.id,
        "bulk_update",
        table,
        null,
        `${ids.length} records`,
        JSON.stringify({ updates, ids }),
      ],
    );
    res.json({ updated: ids.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
