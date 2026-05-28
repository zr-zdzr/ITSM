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

const VALID_LICENSES = ["Starter", "Standard", "Vault", "Not Assigned"];

async function log(userId, action, id, label, details) {
  await db.query(
    "INSERT INTO activity_log (user_id,action,table_name,record_id,record_label,details) VALUES ($1,$2,$3,$4,$5,$6)",
    [userId, action, "gws_accounts", id, label, details],
  );
}

const COL_ALIASES = {
  email_address: "email",
  email_address_required: "email",
  e_mail: "email",
  given_name: "first_name",
  first_name_required: "first_name",
  family_name: "last_name",
  last_name_required: "last_name",
  name: "display_name",
  full_name: "display_name",
  display_name: "display_name",
  org_unit_path: "org_unit",
  org_unit_path_required: "org_unit",
  organizational_unit: "org_unit",
  phone: "phone_number",
  mobile: "phone_number",
  mobile_phone: "phone_number",
  contact_phone: "phone_number",
  account_status: "status",
  suspended: "status",
};

function normalizeRow(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const normalized = k
      .trim()
      .toLowerCase()
      .replace(/[\s\-\/\[\]\(\)]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    const key = COL_ALIASES[normalized] || normalized;
    out[key] = typeof v === "string" ? v.trim() : v;
  }
  // fall back: split display_name into first/last if not provided
  if ((!out.first_name || !out.last_name) && out.display_name) {
    const parts = out.display_name.split(/\s+/);
    if (!out.first_name) out.first_name = parts[0] || "";
    if (!out.last_name)
      out.last_name = parts.slice(1).join(" ") || parts[0] || "";
  }
  return out;
}

function pickLicense(val) {
  if (!val) return null;
  return (
    VALID_LICENSES.find((l) => l.toLowerCase() === val.toLowerCase()) || null
  );
}

function pickStatus(val) {
  if (!val) return "active";
  return val.toLowerCase() === "suspended" ? "suspended" : "active";
}

function isValidEmail(val) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}

const LIST_SQL = `
  SELECT g.*,
         COALESCE(e.full_name, '') AS employee_name
  FROM gws_accounts g
  LEFT JOIN employees e
         ON LOWER(e.email) = LOWER(g.email)
         OR LOWER(TRIM(e.full_name)) = LOWER(TRIM(g.first_name || ' ' || g.last_name))
  WHERE 1=1
`;

// ── LIST ─────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { q, status } = req.query;
    let sql = LIST_SQL;
    const params = [];
    let i = 1;
    if (q) {
      sql += ` AND (g.email ILIKE $${i} OR g.first_name ILIKE $${i} OR g.last_name ILIKE $${i} OR g.org_unit ILIKE $${i})`;
      params.push(`%${q}%`);
      i++;
    }
    if (status) {
      sql += ` AND g.status=$${i++}`;
      params.push(status);
    }
    sql += " ORDER BY g.created_at DESC";
    res.json((await db.query(sql, params)).rows);
  } catch (err) {
    next(err);
  }
});

// ── SAMPLE CSV ────────────────────────────────────────────────
router.get("/sample/csv", requireAuth, (req, res) => {
  const rows = [
    {
      employee_name: "Ali Raza",
      first_name: "Ali",
      last_name: "Raza",
      email: "ali.raza@bykea.com",
      org_unit: "/Engineering",
      phone_number: "0321-1000001",
      license: "Standard",
      status: "active",
    },
    {
      employee_name: "Sara Khan",
      first_name: "Sara",
      last_name: "Khan",
      email: "sara.khan@bykea.com",
      org_unit: "/HR",
      phone_number: "0300-2000002",
      license: "Starter",
      status: "active",
    },
    {
      employee_name: "Usman Ahmed",
      first_name: "Usman",
      last_name: "Ahmed",
      email: "usman.ahmed@bykea.com",
      org_unit: "/IT",
      phone_number: "",
      license: "Standard",
      status: "suspended",
    },
    {
      employee_name: "Fatima Sheikh",
      first_name: "Fatima",
      last_name: "Sheikh",
      email: "fatima.sheikh@bykea.com",
      org_unit: "/Finance",
      phone_number: "0312-4000004",
      license: "Vault",
      status: "active",
    },
    {
      employee_name: "",
      first_name: "CI",
      last_name: "Pipeline",
      email: "svc-ci@bykea.com",
      org_unit: "/ServiceAccounts",
      phone_number: "",
      license: "Not Assigned",
      status: "active",
    },
  ];
  const columns = [
    "employee_name",
    "first_name",
    "last_name",
    "email",
    "org_unit",
    "phone_number",
    "license",
    "status",
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=Cloud_IDs_sample.csv",
  );
  res.send(stringify(rows, { header: true, columns, quoted: true }));
});

// ── EXPORT CSV ────────────────────────────────────────────────
router.get("/export/csv", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT g.first_name, g.last_name, g.email, g.org_unit, g.phone_number, g.license, g.status,
             COALESCE(e.full_name, '') AS employee_name
      FROM gws_accounts g
      LEFT JOIN employees e
             ON LOWER(e.email) = LOWER(g.email)
             OR LOWER(TRIM(e.full_name)) = LOWER(TRIM(g.first_name || ' ' || g.last_name))
      ORDER BY g.created_at DESC
    `);
    const columns = [
      "employee_name",
      "first_name",
      "last_name",
      "email",
      "org_unit",
      "status",
      "phone_number",
      "license",
    ];
    const rows = r.rows.map((g) => ({
      employee_name: g.employee_name || "",
      first_name: g.first_name || "",
      last_name: g.last_name || "",
      email: g.email || "",
      org_unit: g.org_unit || "",
      status: g.status || "",
      phone_number: g.phone_number || "",
      license: g.license || "",
    }));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=cloud_ids_export.csv",
    );
    res.send(stringify(rows, { header: true, columns, quoted: true }));
  } catch (err) {
    next(err);
  }
});

// ── IMPORT CSV ────────────────────────────────────────────────
router.post(
  "/import/csv",
  requireAuth,
  perm("gws", "create"),
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

      for (let rowIdx = 0; rowIdx < records.length; rowIdx++) {
        const d = normalizeRow(records[rowIdx]);
        const rowNum = rowIdx + 2;
        const rowLabel = d.email || `Row ${rowNum}`;

        const missing = [];
        if (!d.first_name) missing.push("first_name");
        if (!d.last_name) missing.push("last_name");
        if (!d.email) missing.push("email");
        if (!d.license) missing.push("license");

        if (missing.length > 0) {
          skipped++;
          errors.push(
            `Row ${rowNum} (${rowLabel}): missing required field${missing.length > 1 ? "s" : ""} — ${missing.join(", ")}`,
          );
          continue;
        }

        if (!isValidEmail(d.email)) {
          skipped++;
          errors.push(`Row ${rowNum} (${rowLabel}): invalid email format`);
          continue;
        }

        const lic = pickLicense(d.license);
        if (!lic) {
          skipped++;
          errors.push(
            `Row ${rowNum} (${rowLabel}): invalid license "${d.license}" — must be one of: ${VALID_LICENSES.join(", ")}`,
          );
          continue;
        }

        try {
          const existing = await db.query(
            "SELECT id FROM gws_accounts WHERE LOWER(email)=LOWER($1)",
            [d.email],
          );
          const displayName = `${d.first_name} ${d.last_name}`.trim();
          const status = pickStatus(d.status);

          if (existing.rows[0]) {
            await db.query(
              `
            UPDATE gws_accounts SET
              first_name   = $1,
              last_name    = $2,
              display_name = $3,
              org_unit     = COALESCE($4, org_unit),
              phone_number = COALESCE($5, phone_number),
              license      = $6,
              status       = $7
            WHERE id = $8`,
              [
                d.first_name,
                d.last_name,
                displayName,
                d.org_unit || null,
                d.phone_number || null,
                lic,
                status,
                existing.rows[0].id,
              ],
            );
            updated++;
          } else {
            await db.query(
              `
            INSERT INTO gws_accounts
              (first_name, last_name, display_name, email, org_unit, phone_number, license, status, account_type)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'user')`,
              [
                d.first_name,
                d.last_name,
                displayName,
                d.email,
                d.org_unit || null,
                d.phone_number || null,
                lic,
                status,
              ],
            );
            inserted++;
          }
        } catch (e) {
          if (e.code === "23505") {
            skipped++;
            errors.push(`Row ${rowNum} (${rowLabel}): email already exists`);
          } else {
            skipped++;
            errors.push(`Row ${rowNum} (${rowLabel}): ${e.message}`);
          }
        }
      }

      await log(
        req.user.id,
        "imported",
        null,
        "CSV Import",
        `Imported ${inserted} Cloud IDs, updated ${updated}, skipped ${skipped}`,
      );
      res.json({ inserted, updated, skipped, errors });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET ONE ───────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(`${LIST_SQL} AND g.id=$1`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── CREATE ────────────────────────────────────────────────────
router.post("/", requireAuth, perm("gws", "create"), async (req, res, next) => {
  try {
    const d = req.body;
    if (!d.first_name?.trim())
      return res.status(400).json({ error: "First Name is required" });
    if (!d.last_name?.trim())
      return res.status(400).json({ error: "Last Name is required" });
    if (!d.email?.trim())
      return res.status(400).json({ error: "Email is required" });
    if (!isValidEmail(d.email))
      return res.status(400).json({ error: "Invalid email format" });
    if (!d.license)
      return res.status(400).json({ error: "License is required" });
    if (!VALID_LICENSES.includes(d.license))
      return res
        .status(400)
        .json({
          error: `License must be one of: ${VALID_LICENSES.join(", ")}`,
        });

    const displayName = `${d.first_name.trim()} ${d.last_name.trim()}`.trim();
    const r = await db.query(
      `
      INSERT INTO gws_accounts
        (first_name, last_name, display_name, email, org_unit, phone_number, license, status, account_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'user') RETURNING *`,
      [
        d.first_name.trim(),
        d.last_name.trim(),
        displayName,
        d.email.trim(),
        d.org_unit || null,
        d.phone_number || null,
        d.license,
        d.status || "active",
      ],
    );
    await log(req.user.id, "created", r.rows[0].id, d.email, "Added Cloud ID");
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ error: "Email already exists" });
    next(err);
  }
});

// ── UPDATE ────────────────────────────────────────────────────
router.put("/:id", requireAuth, perm("gws", "update"), async (req, res, next) => {
  try {
    const d = req.body;
    if (!d.first_name?.trim())
      return res.status(400).json({ error: "First Name is required" });
    if (!d.last_name?.trim())
      return res.status(400).json({ error: "Last Name is required" });
    if (!d.email?.trim())
      return res.status(400).json({ error: "Email is required" });
    if (!isValidEmail(d.email))
      return res.status(400).json({ error: "Invalid email format" });
    if (!d.license)
      return res.status(400).json({ error: "License is required" });
    if (!VALID_LICENSES.includes(d.license))
      return res
        .status(400)
        .json({
          error: `License must be one of: ${VALID_LICENSES.join(", ")}`,
        });

    const displayName = `${d.first_name.trim()} ${d.last_name.trim()}`.trim();
    const r = await db.query(
      `
      UPDATE gws_accounts SET
        first_name   = $1,
        last_name    = $2,
        display_name = $3,
        email        = $4,
        org_unit     = $5,
        phone_number = $6,
        license      = $7,
        status       = $8
      WHERE id = $9 RETURNING *`,
      [
        d.first_name.trim(),
        d.last_name.trim(),
        displayName,
        d.email.trim(),
        d.org_unit || null,
        d.phone_number || null,
        d.license,
        d.status || "active",
        req.params.id,
      ],
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    await log(
      req.user.id,
      "updated",
      r.rows[0].id,
      d.email,
      "Updated Cloud ID",
    );
    res.json(r.rows[0]);
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ error: "Email already exists" });
    next(err);
  }
});

// ── DELETE ALL ────────────────────────────────────────────────
router.delete("/all", requireAuth, perm("gws", "delete"), async (req, res, next) => {
  try {
    const all = await db.query("SELECT * FROM gws_accounts");
    await Promise.all(
      all.rows.map((row) =>
        saveToRecycleBin("gws", "gws_accounts", row, row.email, req.user.id),
      ),
    );
    const r = await db.query("DELETE FROM gws_accounts RETURNING id");
    await log(
      req.user.id,
      "deleted_all",
      null,
      "All Cloud IDs",
      `Deleted all ${r.rowCount} Cloud IDs`,
    );
    res.json({ deleted: r.rowCount });
  } catch (err) {
    next(err);
  }
});

// ── DELETE ONE ────────────────────────────────────────────────
router.delete("/:id", requireAuth, perm("gws", "delete"), async (req, res, next) => {
  try {
    const r = await db.query(
      "DELETE FROM gws_accounts WHERE id=$1 RETURNING *",
      [req.params.id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    await saveToRecycleBin(
      "gws",
      "gws_accounts",
      r.rows[0],
      r.rows[0].email,
      req.user.id,
    );
    await log(
      req.user.id,
      "deleted",
      r.rows[0].id,
      r.rows[0].email,
      "Deleted Cloud ID",
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
