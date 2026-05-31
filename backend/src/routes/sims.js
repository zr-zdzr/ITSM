const router = require("express").Router();
const multer = require("multer");
const { saveToRecycleBin } = require("../utils/recycle");
const { parse } = require("csv-parse/sync");
const { stringify } = require("csv-stringify/sync");
const db = require("../config/db");
const { requireAuth, perm } = require("../middleware/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

async function log(userId, action, id, label, details) {
  await db.query(
    "INSERT INTO activity_log (user_id,action,table_name,record_id,record_label,details) VALUES ($1,$2,$3,$4,$5,$6)",
    [userId, action, "sims", id, label, details],
  );
}

function normalizeRow(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw))
    out[
      k
        .trim()
        .toLowerCase()
        .replace(/[\s\-\/]+/g, "_")
    ] = typeof v === "string" ? v.trim() : v;
  return out;
}

function pickNamedOn(val) {
  if (!val) return "service";
  const v = val.toLowerCase();
  if (v.includes("employee") || v.includes("user")) return "employee";
  if (v.includes("wfh") || v.includes("work from home")) return "wfh";
  return "service";
}

function pickSimType(val) {
  if (!val) return null;
  const v = val.toLowerCase();
  if (v.includes("data")) return "Data";
  if (v.includes("call")) return "Calling";
  return null;
}

function pickPurpose(val) {
  if (!val) return null;
  const v = val.toLowerCase();
  if (v === "official" || v === "office") return "official";
  if (v === "service") return "service";
  return null;
}

function pickStatus(val) {
  if (!val) return "active";
  const v = val.toLowerCase();
  if (v === "suspended") return "suspended";
  return "active";
}

const SELECT_COLS = `
  s.id, s.phone_number, s.assigned_type, s.assigned_user_id,
  s.sim_holder, s.user_name, s.vendor, s.package_name, s.data_limit,
  s.department, s.sim_type, s.location, s.purpose,
  s.notes, s.status, s.created_at, s.updated_at,
  e.full_name AS assigned_user_name
`;

// ── LIST ──────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { q } = req.query;
    let sql = `SELECT ${SELECT_COLS} FROM sims s LEFT JOIN employees e ON e.id=s.assigned_user_id WHERE 1=1`;
    const params = [];
    let i = 1;
    if (q) {
      sql += ` AND (s.phone_number ILIKE $${i} OR s.sim_holder ILIKE $${i} OR s.sim_type ILIKE $${i} OR s.location ILIKE $${i} OR s.department ILIKE $${i})`;
      params.push(`%${q}%`);
      i++;
    }
    sql += " ORDER BY s.created_at DESC";
    res.json((await db.query(sql, params)).rows);
  } catch (err) {
    next(err);
  }
});

// ── SAMPLE CSV ────────────────────────────────────────────
router.get("/sample/csv", requireAuth, (req, res) => {
  const csv = stringify(
    [
      {
        phone_number: "0321-1000001",
        named_on: "Employee",
        sim_holder: "Ali Raza",
        department: "Engineering",
        sim_type: "Calling",
        status: "active",
        location: "Karachi HQ",
        purpose: "official",
        notes: "",
      },
      {
        phone_number: "0300-2000002",
        named_on: "WFH",
        sim_holder: "Sara Khan",
        department: "HR",
        sim_type: "Data",
        status: "active",
        location: "Lahore Office",
        purpose: "official",
        notes: "Remote worker",
      },
      {
        phone_number: "0345-3000003",
        named_on: "Service",
        sim_holder: "IT Department",
        department: "IT",
        sim_type: "Data",
        status: "active",
        location: "Karachi HQ",
        purpose: "service",
        notes: "Router SIM",
      },
    ],
    { header: true },
  );
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=sims_sample.csv");
  res.send(csv);
});

// ── EXPORT CSV ────────────────────────────────────────────
router.get("/export/csv", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT s.phone_number,
        CASE WHEN s.assigned_type IN ('employee','user') THEN 'Employee'
             WHEN s.assigned_type='wfh' THEN 'WFH'
             ELSE 'Service' END AS named_on,
        e.full_name AS assigned_user_name,
        s.sim_holder, s.user_name, s.vendor, s.package_name, s.department, s.status,
        e.location, s.purpose, s.notes
      FROM sims s LEFT JOIN employees e ON e.id=s.assigned_user_id ORDER BY s.created_at DESC`);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=sims.csv");
    res.send(stringify(r.rows, { header: true, quoted_string: true }));
  } catch (err) {
    next(err);
  }
});

// ── IMPORT CSV ────────────────────────────────────────────
router.post(
  "/import/csv",
  requireAuth,
  perm("sims", "create"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const records = parse(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
      let inserted = 0,
        updated = 0,
        skipped = 0,
        errors = [];

      for (const raw of records) {
        const d = normalizeRow(raw);
        if (!d.phone_number) {
          skipped++;
          errors.push("Skipped: phone_number (Number) is required");
          continue;
        }
        try {
          const existing = await db.query(
            "SELECT id FROM sims WHERE phone_number=$1",
            [d.phone_number],
          );
          const namedOn = pickNamedOn(
            d.named_on || d.assigned_to || d.assigned_type,
          );
          const simType = pickSimType(d.sim_type || d.type);
          const purpose = pickPurpose(d.purpose);
          const status = pickStatus(d.status);
          const holder = d.sim_holder || null;
          const dept = d.department || null;
          const location = d.location || null;
          const notes = d.notes || null;

          if (existing.rows[0]) {
            await db.query(
              `
            UPDATE sims SET
              assigned_type = COALESCE($1, assigned_type),
              sim_holder    = COALESCE($2, sim_holder),
              department    = COALESCE($3, department),
              sim_type      = COALESCE($4, sim_type),
              status        = $5,
              location      = COALESCE($6, location),
              purpose       = COALESCE($7, purpose),
              notes         = COALESCE($8, notes)
            WHERE id=$9`,
              [
                namedOn,
                holder,
                dept,
                simType,
                status,
                location,
                purpose,
                notes,
                existing.rows[0].id,
              ],
            );
            updated++;
          } else {
            await db.query(
              `INSERT INTO sims (phone_number, assigned_type, sim_holder, department, sim_type,
               status, location, purpose, notes, vendor)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Other')`,
              [
                d.phone_number,
                namedOn,
                holder,
                dept,
                simType,
                status,
                location,
                purpose,
                notes,
              ],
            );
            inserted++;
          }
        } catch (e) {
          skipped++;
          errors.push(`${d.phone_number}: ${e.message}`);
        }
      }
      await log(
        req.user.id,
        "imported",
        null,
        "CSV Import",
        `Imported ${inserted} SIMs, updated ${updated}, skipped ${skipped}`,
      );
      res.json({ inserted, updated, skipped, errors });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE ALL ────────────────────────────────────────────
router.delete(
  "/all",
  requireAuth,
  perm("sims", "delete"),
  async (req, res, next) => {
    try {
      const all = await db.query("SELECT * FROM sims");
      await Promise.all(
        all.rows.map((row) =>
          saveToRecycleBin("sims", "sims", row, row.phone_number, req.user.id),
        ),
      );
      const r = await db.query("DELETE FROM sims RETURNING id");
      await log(
        req.user.id,
        "deleted_all",
        null,
        "All SIMs",
        `Deleted all ${r.rowCount} SIM cards`,
      );
      res.json({ deleted: r.rowCount });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET ONE ───────────────────────────────────────────────
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT ${SELECT_COLS} FROM sims s LEFT JOIN employees e ON e.id=s.assigned_user_id WHERE s.id=$1`,
      [req.params.id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── CREATE ────────────────────────────────────────────────
router.post(
  "/",
  requireAuth,
  perm("sims", "create"),
  async (req, res, next) => {
    try {
      const d = req.body;
      if (!d.phone_number)
        return res.status(400).json({ error: "Number is required" });
      const r = await db.query(
        `INSERT INTO sims
         (phone_number, assigned_type, assigned_user_id, sim_holder, department,
          sim_type, status, location, purpose, notes, vendor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Other') RETURNING *`,
        [
          d.phone_number,
          d.assigned_type || "service",
          d.assigned_user_id || null,
          d.sim_holder || null,
          d.department || null,
          d.sim_type || null,
          d.status || "active",
          d.location || null,
          d.purpose || null,
          d.notes || null,
        ],
      );
      await log(
        req.user.id,
        "created",
        r.rows[0].id,
        d.phone_number,
        `Added SIM ${d.phone_number}`,
      );
      res.status(201).json(r.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ── UPDATE ────────────────────────────────────────────────
router.put(
  "/:id",
  requireAuth,
  perm("sims", "update"),
  async (req, res, next) => {
    try {
      const d = req.body;
      if (!d.phone_number)
        return res.status(400).json({ error: "Number is required" });
      const r = await db.query(
        `UPDATE sims SET
         phone_number=$1, assigned_type=$2, assigned_user_id=$3, sim_holder=$4,
         department=$5, sim_type=$6, status=$7, location=$8, purpose=$9, notes=$10
       WHERE id=$11 RETURNING *`,
        [
          d.phone_number,
          d.assigned_type || "service",
          d.assigned_user_id || null,
          d.sim_holder || null,
          d.department || null,
          d.sim_type || null,
          d.status || "active",
          d.location || null,
          d.purpose || null,
          d.notes || null,
          req.params.id,
        ],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      await log(
        req.user.id,
        "updated",
        r.rows[0].id,
        d.phone_number,
        "Updated SIM card",
      );
      res.json(r.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE ────────────────────────────────────────────────
router.delete(
  "/:id",
  requireAuth,
  perm("sims", "delete"),
  async (req, res, next) => {
    try {
      const r = await db.query("DELETE FROM sims WHERE id=$1 RETURNING *", [
        req.params.id,
      ]);
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      await saveToRecycleBin(
        "sims",
        "sims",
        r.rows[0],
        r.rows[0].phone_number,
        req.user.id,
      );
      await log(
        req.user.id,
        "deleted",
        r.rows[0].id,
        r.rows[0].phone_number,
        "Deleted SIM card",
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
