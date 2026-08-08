const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { requireAuth, perm } = require("../middleware/auth");
const { logActivity } = require("../utils/activity");
const { saveToRecycleBin } = require("../utils/recycle");

// Delegates to the shared helper so these entries also capture user_label,
// which survives deletion of the account that made the change.
async function log(userId, action, table, id, label, details, changes) {
  await logActivity(userId, action, table, id, label, details, null, changes);
}

// item_categories -> heads -> sub_heads is a chain of ON DELETE CASCADE, so
// removing a category used to silently take every head and sub-head under it
// with no record that they had ever existed. Each affected row is copied into
// the Recycle Bin as its own restorable entry before the parent is deleted.
//
// Restoring the parent does NOT pull its children back automatically — they
// are separate entries and must be restored individually. That is deliberate:
// re-inserting children under a parent whose id has changed would silently
// re-parent them to the wrong row.
async function archiveDescendants(table, id, userId) {
  const archived = { heads: [], sub_heads: [] };

  if (table === "item_categories" || table === "heads") {
    const heads =
      table === "heads"
        ? { rows: [] }
        : await db.query("SELECT * FROM heads WHERE category_id=$1", [id]);
    const headIds = table === "heads" ? [id] : heads.rows.map((h) => h.id);

    if (headIds.length) {
      const subs = await db.query(
        "SELECT * FROM sub_heads WHERE head_id = ANY($1::int[])",
        [headIds],
      );
      for (const s of subs.rows) {
        await saveToRecycleBin(
          "masterdata",
          "sub_heads",
          s,
          s.sub_head_name,
          userId,
        );
        archived.sub_heads.push({ id: s.id, name: s.sub_head_name });
      }
    }
    for (const h of heads.rows) {
      await saveToRecycleBin("masterdata", "heads", h, h.head_name, userId);
      archived.heads.push({ id: h.id, name: h.head_name });
    }
  }
  return archived;
}

// ── CATEGORIES ────────────────────────────────────────────

router.get("/categories", requireAuth, async (req, res, next) => {
  try {
    const { q } = req.query;
    const params = [];
    let where = "WHERE 1=1";
    if (q) {
      params.push(`%${q}%`);
      where += ` AND c.category_name ILIKE $${params.length}`;
    }
    const r = await db.query(
      `SELECT c.id, c.category_name, c.description, c.status, c.created_at, c.updated_at,
              COUNT(h.id)::int AS head_count
       FROM item_categories c
       LEFT JOIN heads h ON h.category_id = c.id
       ${where}
       GROUP BY c.id ORDER BY c.category_name`,
      params,
    );
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});

router.post(
  "/categories",
  requireAuth,
  perm("masterdata", "create"),
  async (req, res, next) => {
    try {
      const { category_name, description } = req.body;
      if (!category_name?.trim())
        return res.status(400).json({ error: "Category name is required" });
      const dup = await db.query(
        "SELECT id FROM item_categories WHERE LOWER(category_name)=LOWER($1)",
        [category_name.trim()],
      );
      if (dup.rows.length)
        return res.status(409).json({ error: "Category already exists" });
      const r = await db.query(
        "INSERT INTO item_categories (category_name, description) VALUES ($1,$2) RETURNING *",
        [category_name.trim(), description?.trim() || null],
      );
      await log(
        req.user.id,
        "create",
        "item_categories",
        r.rows[0].id,
        category_name.trim(),
      );
      res.status(201).json(r.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/categories/:id",
  requireAuth,
  perm("masterdata", "update"),
  async (req, res, next) => {
    try {
      const { category_name, description } = req.body;
      if (!category_name?.trim())
        return res.status(400).json({ error: "Category name is required" });
      const dup = await db.query(
        "SELECT id FROM item_categories WHERE LOWER(category_name)=LOWER($1) AND id!=$2",
        [category_name.trim(), req.params.id],
      );
      if (dup.rows.length)
        return res.status(409).json({ error: "Category name already in use" });
      const r = await db.query(
        `UPDATE item_categories SET category_name=$1, description=$2, updated_at=NOW()
         WHERE id=$3 RETURNING *`,
        [category_name.trim(), description?.trim() || null, req.params.id],
      );
      if (!r.rows.length) return res.status(404).json({ error: "Not found" });
      await log(
        req.user.id,
        "update",
        "item_categories",
        req.params.id,
        category_name.trim(),
      );
      res.json(r.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/categories/:id/toggle",
  requireAuth,
  perm("masterdata", "update"),
  async (req, res, next) => {
    try {
      const r = await db.query(
        `UPDATE item_categories
         SET status = CASE WHEN status='active' THEN 'inactive' ELSE 'active' END, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [req.params.id],
      );
      if (!r.rows.length) return res.status(404).json({ error: "Not found" });
      await log(
        req.user.id,
        "update",
        "item_categories",
        req.params.id,
        r.rows[0].category_name,
      );
      res.json(r.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/categories/:id",
  requireAuth,
  perm("masterdata", "delete"),
  async (req, res, next) => {
    try {
      const existing = await db.query(
        "SELECT * FROM item_categories WHERE id=$1",
        [req.params.id],
      );
      if (!existing.rows.length)
        return res.status(404).json({ error: "Not found" });
      const row = existing.rows[0];

      const archived = await archiveDescendants(
        "item_categories",
        Number(req.params.id),
        req.user.id,
      );
      await saveToRecycleBin(
        "masterdata",
        "item_categories",
        row,
        row.category_name,
        req.user.id,
      );
      const r = await db.query(
        "DELETE FROM item_categories WHERE id=$1 RETURNING *",
        [req.params.id],
      );
      await log(
        req.user.id,
        "delete",
        "item_categories",
        req.params.id,
        r.rows[0].category_name,
        `Moved to Recycle Bin with ${archived.heads.length} head(s) and ${archived.sub_heads.length} sub-head(s) that would otherwise have been cascade-deleted`,
        archived.heads.length || archived.sub_heads.length
          ? { cascaded: archived }
          : null,
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── HEADS ────────────────────────────────────────────────

router.get("/heads", requireAuth, async (req, res, next) => {
  try {
    const { q, category_id } = req.query;
    const params = [];
    let where = "WHERE 1=1";
    if (category_id) {
      params.push(category_id);
      where += ` AND h.category_id=$${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (h.head_name ILIKE $${params.length} OR c.category_name ILIKE $${params.length})`;
    }
    const r = await db.query(
      `SELECT h.id, h.category_id, h.head_name, h.description, h.status, h.created_at, h.updated_at,
              c.category_name, COUNT(sh.id)::int AS sub_head_count
       FROM heads h
       JOIN item_categories c ON c.id=h.category_id
       LEFT JOIN sub_heads sh ON sh.head_id=h.id
       ${where}
       GROUP BY h.id, c.category_name ORDER BY c.category_name, h.head_name`,
      params,
    );
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});

router.post(
  "/heads",
  requireAuth,
  perm("masterdata", "create"),
  async (req, res, next) => {
    try {
      const { category_id, head_name, description } = req.body;
      if (!category_id)
        return res.status(400).json({ error: "Category is required" });
      if (!head_name?.trim())
        return res.status(400).json({ error: "Head name is required" });
      const dup = await db.query(
        "SELECT id FROM heads WHERE category_id=$1 AND LOWER(head_name)=LOWER($2)",
        [category_id, head_name.trim()],
      );
      if (dup.rows.length)
        return res
          .status(409)
          .json({ error: "Head already exists in this category" });
      const r = await db.query(
        "INSERT INTO heads (category_id, head_name, description) VALUES ($1,$2,$3) RETURNING *",
        [category_id, head_name.trim(), description?.trim() || null],
      );
      await log(req.user.id, "create", "heads", r.rows[0].id, head_name.trim());
      res.status(201).json(r.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/heads/:id",
  requireAuth,
  perm("masterdata", "update"),
  async (req, res, next) => {
    try {
      const { category_id, head_name, description } = req.body;
      if (!category_id)
        return res.status(400).json({ error: "Category is required" });
      if (!head_name?.trim())
        return res.status(400).json({ error: "Head name is required" });
      const dup = await db.query(
        "SELECT id FROM heads WHERE category_id=$1 AND LOWER(head_name)=LOWER($2) AND id!=$3",
        [category_id, head_name.trim(), req.params.id],
      );
      if (dup.rows.length)
        return res
          .status(409)
          .json({ error: "Head already exists in this category" });
      const r = await db.query(
        `UPDATE heads SET category_id=$1, head_name=$2, description=$3, updated_at=NOW()
         WHERE id=$4 RETURNING *`,
        [
          category_id,
          head_name.trim(),
          description?.trim() || null,
          req.params.id,
        ],
      );
      if (!r.rows.length) return res.status(404).json({ error: "Not found" });
      await log(
        req.user.id,
        "update",
        "heads",
        req.params.id,
        head_name.trim(),
      );
      res.json(r.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/heads/:id/toggle",
  requireAuth,
  perm("masterdata", "update"),
  async (req, res, next) => {
    try {
      const r = await db.query(
        `UPDATE heads
         SET status = CASE WHEN status='active' THEN 'inactive' ELSE 'active' END, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [req.params.id],
      );
      if (!r.rows.length) return res.status(404).json({ error: "Not found" });
      await log(
        req.user.id,
        "update",
        "heads",
        req.params.id,
        r.rows[0].head_name,
      );
      res.json(r.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/heads/:id",
  requireAuth,
  perm("masterdata", "delete"),
  async (req, res, next) => {
    try {
      const existing = await db.query("SELECT * FROM heads WHERE id=$1", [
        req.params.id,
      ]);
      if (!existing.rows.length)
        return res.status(404).json({ error: "Not found" });

      const archived = await archiveDescendants(
        "heads",
        Number(req.params.id),
        req.user.id,
      );
      await saveToRecycleBin(
        "masterdata",
        "heads",
        existing.rows[0],
        existing.rows[0].head_name,
        req.user.id,
      );
      const r = await db.query("DELETE FROM heads WHERE id=$1 RETURNING *", [
        req.params.id,
      ]);
      await log(
        req.user.id,
        "delete",
        "heads",
        req.params.id,
        r.rows[0].head_name,
        `Moved to Recycle Bin with ${archived.sub_heads.length} sub-head(s) that would otherwise have been cascade-deleted`,
        archived.sub_heads.length ? { cascaded: archived } : null,
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── SUB-HEADS ────────────────────────────────────────────

router.get("/subheads", requireAuth, async (req, res, next) => {
  try {
    const { q, head_id, category_id } = req.query;
    const params = [];
    let where = "WHERE 1=1";
    if (head_id) {
      params.push(head_id);
      where += ` AND sh.head_id=$${params.length}`;
    }
    if (category_id) {
      params.push(category_id);
      where += ` AND h.category_id=$${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (sh.sub_head_name ILIKE $${params.length} OR h.head_name ILIKE $${params.length} OR c.category_name ILIKE $${params.length})`;
    }
    const r = await db.query(
      `SELECT sh.id, sh.head_id, sh.sub_head_name, sh.description, sh.status, sh.created_at, sh.updated_at,
              h.head_name, h.category_id, c.category_name
       FROM sub_heads sh
       JOIN heads h ON h.id=sh.head_id
       JOIN item_categories c ON c.id=h.category_id
       ${where}
       ORDER BY c.category_name, h.head_name, sh.sub_head_name`,
      params,
    );
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});

router.post(
  "/subheads",
  requireAuth,
  perm("masterdata", "create"),
  async (req, res, next) => {
    try {
      const { head_id, sub_head_name, description } = req.body;
      if (!head_id) return res.status(400).json({ error: "Head is required" });
      if (!sub_head_name?.trim())
        return res.status(400).json({ error: "Sub-Head name is required" });
      const dup = await db.query(
        "SELECT id FROM sub_heads WHERE head_id=$1 AND LOWER(sub_head_name)=LOWER($2)",
        [head_id, sub_head_name.trim()],
      );
      if (dup.rows.length)
        return res
          .status(409)
          .json({ error: "Sub-Head already exists under this Head" });
      const r = await db.query(
        "INSERT INTO sub_heads (head_id, sub_head_name, description) VALUES ($1,$2,$3) RETURNING *",
        [head_id, sub_head_name.trim(), description?.trim() || null],
      );
      await log(
        req.user.id,
        "create",
        "sub_heads",
        r.rows[0].id,
        sub_head_name.trim(),
      );
      res.status(201).json(r.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/subheads/:id",
  requireAuth,
  perm("masterdata", "update"),
  async (req, res, next) => {
    try {
      const { head_id, sub_head_name, description } = req.body;
      if (!head_id) return res.status(400).json({ error: "Head is required" });
      if (!sub_head_name?.trim())
        return res.status(400).json({ error: "Sub-Head name is required" });
      const dup = await db.query(
        "SELECT id FROM sub_heads WHERE head_id=$1 AND LOWER(sub_head_name)=LOWER($2) AND id!=$3",
        [head_id, sub_head_name.trim(), req.params.id],
      );
      if (dup.rows.length)
        return res
          .status(409)
          .json({ error: "Sub-Head already exists under this Head" });
      const r = await db.query(
        `UPDATE sub_heads SET head_id=$1, sub_head_name=$2, description=$3, updated_at=NOW()
         WHERE id=$4 RETURNING *`,
        [
          head_id,
          sub_head_name.trim(),
          description?.trim() || null,
          req.params.id,
        ],
      );
      if (!r.rows.length) return res.status(404).json({ error: "Not found" });
      await log(
        req.user.id,
        "update",
        "sub_heads",
        req.params.id,
        sub_head_name.trim(),
      );
      res.json(r.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/subheads/:id/toggle",
  requireAuth,
  perm("masterdata", "update"),
  async (req, res, next) => {
    try {
      const r = await db.query(
        `UPDATE sub_heads
         SET status = CASE WHEN status='active' THEN 'inactive' ELSE 'active' END, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [req.params.id],
      );
      if (!r.rows.length) return res.status(404).json({ error: "Not found" });
      await log(
        req.user.id,
        "update",
        "sub_heads",
        req.params.id,
        r.rows[0].sub_head_name,
      );
      res.json(r.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/subheads/:id",
  requireAuth,
  perm("masterdata", "delete"),
  async (req, res, next) => {
    try {
      const existing = await db.query("SELECT * FROM sub_heads WHERE id=$1", [
        req.params.id,
      ]);
      if (!existing.rows.length)
        return res.status(404).json({ error: "Not found" });
      await saveToRecycleBin(
        "masterdata",
        "sub_heads",
        existing.rows[0],
        existing.rows[0].sub_head_name,
        req.user.id,
      );
      const r = await db.query(
        "DELETE FROM sub_heads WHERE id=$1 RETURNING *",
        [req.params.id],
      );
      await log(
        req.user.id,
        "delete",
        "sub_heads",
        req.params.id,
        r.rows[0].sub_head_name,
        "Moved to Recycle Bin",
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
