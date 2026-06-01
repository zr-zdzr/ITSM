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

const VALID_LOCATIONS = [
  "Karachi",
  "Lahore",
  "Islamabad",
  "Multan",
  "Peshawar",
  "Other",
];
const VALID_EMP_TYPES = ["Permanent", "Contractual"];

async function log(userId, action, id, label, details) {
  await db.query(
    "INSERT INTO activity_log (user_id,action,table_name,record_id,record_label,details) VALUES ($1,$2,$3,$4,$5,$6)",
    [userId, action, "employees", id, label, details],
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

function pickLocation(val) {
  if (!val) return null;
  return (
    VALID_LOCATIONS.find((l) => l.toLowerCase() === val.toLowerCase()) || val
  );
}

function pickEmpType(val) {
  if (!val) return null;
  const v = val.toLowerCase();
  if (v.includes("permanent") || v.includes("full")) return "Permanent";
  if (v.includes("contract")) return "Contractual";
  return VALID_EMP_TYPES.find((t) => t.toLowerCase() === v) || null;
}

// ── LIST ─────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { q, location, employment_type, status } = req.query;
    let sql = "SELECT * FROM employees WHERE 1=1";
    const params = [];
    let i = 1;
    if (q) {
      sql += ` AND (full_name ILIKE $${i} OR email ILIKE $${i} OR designation ILIKE $${i} OR department ILIKE $${i} OR business_unit ILIKE $${i} OR mobile_number ILIKE $${i})`;
      params.push(`%${q}%`);
      i++;
    }
    if (location) {
      sql += ` AND location=$${i++}`;
      params.push(location);
    }
    if (employment_type) {
      sql += ` AND employment_type=$${i++}`;
      params.push(employment_type);
    }
    if (status === "active") sql += " AND is_active=true";
    if (status === "inactive") sql += " AND is_active=false";
    sql += " ORDER BY full_name";
    res.json((await db.query(sql, params)).rows);
  } catch (err) {
    next(err);
  }
});

// ── SAMPLE CSV ────────────────────────────────────────────────
// Mandatory: employee_name*, designation*, department*, location*
// Optional:  business_unit, employment_type, joining_date, email, mobile_number
router.get("/sample/csv", requireAuth, (req, res) => {
  const rows = [
    {
      employee_name: "Ali Raza",
      business_unit: "Technology",
      department: "Engineering",
      designation: "Software Engineer",
      location: "Karachi",
      employment_type: "Permanent",
      joining_date: "2022-03-15",
      email: "ali.raza@bykea.com",
      mobile_number: "0321-1000001",
    },
    {
      employee_name: "Sara Khan",
      business_unit: "Corporate",
      department: "Human Resources",
      designation: "HR Manager",
      location: "Lahore",
      employment_type: "Contractual",
      joining_date: "2023-07-01",
      email: "sara.khan@bykea.com",
      mobile_number: "0300-2000002",
    },
    {
      employee_name: "Usman Ahmed",
      business_unit: "Technology",
      department: "IT",
      designation: "Network Engineer",
      location: "Islamabad",
      employment_type: "Permanent",
      joining_date: "2021-11-10",
      email: "usman.ahmed@bykea.com",
      mobile_number: "0333-3000003",
    },
    {
      employee_name: "Fatima Sheikh",
      business_unit: "Corporate",
      department: "Finance",
      designation: "Finance Analyst",
      location: "Karachi",
      employment_type: "Permanent",
      joining_date: "2020-05-20",
      email: "fatima.sheikh@bykea.com",
      mobile_number: "0312-4000004",
    },
    {
      employee_name: "Muhammad Hassan Raza",
      business_unit: "",
      department: "Operations",
      designation: "Rider Operations Executive",
      location: "Multan",
      employment_type: "Contractual",
      joining_date: "",
      email: "",
      mobile_number: "0345-5000005",
    },
  ];
  const columns = [
    "employee_name",
    "business_unit",
    "department",
    "designation",
    "location",
    "employment_type",
    "joining_date",
    "email",
    "mobile_number",
  ];
  const csv = stringify(rows, { header: true, columns, quoted_string: true });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=employees_sample.csv",
  );
  res.send(csv);
});

// ── EXPORT CSV ────────────────────────────────────────────────
router.get("/export/csv", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT full_name, business_unit, department, designation, location,
              employment_type, joining_date, email, mobile_number, is_active
       FROM employees ORDER BY full_name`,
    );
    const columns = [
      "employee_name",
      "business_unit",
      "department",
      "designation",
      "location",
      "employment_type",
      "joining_date",
      "email",
      "mobile_number",
      "status",
    ];
    const rows = r.rows.map((e) => ({
      employee_name: e.full_name || "",
      business_unit: e.business_unit || "",
      department: e.department || "",
      designation: e.designation || "",
      location: e.location || "",
      employment_type: e.employment_type || "",
      joining_date: e.joining_date
        ? new Date(e.joining_date).toISOString().split("T")[0]
        : "",
      email: e.email || "",
      mobile_number: e.mobile_number || "",
      status: e.is_active ? "Active" : "Inactive",
    }));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=employees-export.csv",
    );
    res.send(stringify(rows, { header: true, columns, quoted_string: true }));
  } catch (err) {
    next(err);
  }
});

// ── IMPORT CSV ────────────────────────────────────────────────
router.post(
  "/import/csv",
  requireAuth,
  perm("employees", "create"),
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
        // Accept employee_name (canonical) or full_name (alias)
        const fullName = (d.employee_name || d.full_name || "")
          .trim()
          .slice(0, 50);
        const rowLabel = fullName || `Row ${rowIdx + 2}`;

        const missing = [];
        if (!fullName) missing.push("employee_name");
        if (!d.designation) missing.push("designation");
        if (!d.department) missing.push("department");
        if (!d.location) missing.push("location");

        if (missing.length > 0) {
          skipped++;
          errors.push(
            `Row ${rowIdx + 2} (${rowLabel}): missing required field${missing.length > 1 ? "s" : ""} — ${missing.join(", ")}`,
          );
          continue;
        }

        try {
          let existing = null;
          if (d.email) {
            const r = await db.query(
              "SELECT id FROM employees WHERE email=$1",
              [d.email],
            );
            existing = r.rows[0];
          }
          if (!existing) {
            const r = await db.query(
              "SELECT id FROM employees WHERE LOWER(full_name)=LOWER($1)",
              [fullName],
            );
            existing = r.rows[0];
          }

          const loc = pickLocation(d.location);
          const empType = pickEmpType(d.employment_type);
          const joining = d.joining_date || null;
          const bunit = d.business_unit || null;

          if (existing) {
            await db.query(
              `
            UPDATE employees SET
              full_name       = $1,
              email           = COALESCE($2,  email),
              designation     = $3,
              department      = $4,
              business_unit   = COALESCE($5,  business_unit),
              mobile_number   = COALESCE($6,  mobile_number),
              location        = $7,
              employment_type = COALESCE($8,  employment_type),
              joining_date    = COALESCE($9,  joining_date)
            WHERE id=$10`,
              [
                fullName,
                d.email || null,
                d.designation,
                d.department,
                bunit,
                d.mobile_number || null,
                loc,
                empType,
                joining,
                existing.id,
              ],
            );
            updated++;
          } else {
            await db.query(
              `INSERT INTO employees
               (full_name, email, designation, department, business_unit,
                mobile_number, location, employment_type, joining_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [
                fullName,
                d.email || null,
                d.designation,
                d.department,
                bunit,
                d.mobile_number || null,
                loc,
                empType,
                joining,
              ],
            );
            inserted++;
          }
        } catch (e) {
          skipped++;
          errors.push(`Row ${rowIdx + 2} (${rowLabel}): ${e.message}`);
        }
      }

      await log(
        req.user.id,
        "imported",
        null,
        "CSV Import",
        `Imported ${inserted} employees, updated ${updated}, skipped ${skipped}`,
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
    const r = await db.query("SELECT * FROM employees WHERE id=$1", [
      req.params.id,
    ]);
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── CREATE ────────────────────────────────────────────────────
router.post(
  "/",
  requireAuth,
  perm("employees", "create"),
  async (req, res, next) => {
    try {
      const d = req.body;
      const fullName = (d.full_name || "").trim().slice(0, 50);
      if (!fullName)
        return res.status(400).json({ error: "Employee Name is required" });
      if (!d.designation)
        return res.status(400).json({ error: "Designation is required" });
      if (!d.department)
        return res.status(400).json({ error: "Department is required" });
      if (!d.location)
        return res.status(400).json({ error: "Location is required" });
      const r = await db.query(
        `INSERT INTO employees
         (full_name, email, designation, department, business_unit,
          mobile_number, location, employment_type, joining_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          fullName,
          d.email || null,
          d.designation,
          d.department,
          d.business_unit || null,
          d.mobile_number || null,
          d.location || null,
          d.employment_type || null,
          d.joining_date || null,
        ],
      );
      await log(
        req.user.id,
        "created",
        r.rows[0].id,
        fullName,
        `Dept: ${d.department}`,
      );
      res.status(201).json(r.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ── UPDATE ────────────────────────────────────────────────────
router.put(
  "/:id",
  requireAuth,
  perm("employees", "update"),
  async (req, res, next) => {
    try {
      const d = req.body;
      const fullName = (d.full_name || "").trim().slice(0, 50);
      if (!fullName)
        return res.status(400).json({ error: "Employee Name is required" });
      if (!d.designation)
        return res.status(400).json({ error: "Designation is required" });
      if (!d.department)
        return res.status(400).json({ error: "Department is required" });
      if (!d.location)
        return res.status(400).json({ error: "Location is required" });
      const r = await db.query(
        `UPDATE employees SET
         full_name=$1, email=$2, designation=$3, department=$4,
         business_unit=$5, mobile_number=$6, location=$7, employment_type=$8,
         joining_date=$9, is_active=$10, leaving_date=$11
       WHERE id=$12 RETURNING *`,
        [
          fullName,
          d.email || null,
          d.designation,
          d.department,
          d.business_unit || null,
          d.mobile_number || null,
          d.location || null,
          d.employment_type || null,
          d.joining_date || null,
          d.is_active !== false,
          d.leaving_date || null,
          req.params.id,
        ],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      await log(
        req.user.id,
        "updated",
        r.rows[0].id,
        fullName,
        "Updated employee",
      );
      res.json(r.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE ALL ────────────────────────────────────────────────
router.delete(
  "/all",
  requireAuth,
  perm("employees", "delete"),
  async (req, res, next) => {
    try {
      const all = await db.query("SELECT * FROM employees");
      await Promise.all(
        all.rows.map((row) =>
          saveToRecycleBin(
            "employees",
            "employees",
            row,
            row.full_name,
            req.user.id,
          ),
        ),
      );
      const r = await db.query("DELETE FROM employees RETURNING id");
      await log(
        req.user.id,
        "deleted_all",
        null,
        "All Employees",
        `Deleted all ${r.rowCount} employees`,
      );
      res.json({ deleted: r.rowCount });
    } catch (err) {
      next(err);
    }
  },
);

// ── REACTIVATE ────────────────────────────────────────────────
router.patch(
  "/:id/reactivate",
  requireAuth,
  perm("employees", "update"),
  async (req, res, next) => {
    try {
      const r = await db.query(
        `UPDATE employees SET is_active=true, leaving_date=NULL WHERE id=$1 RETURNING *`,
        [req.params.id],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      await log(
        req.user.id,
        "reactivated",
        r.rows[0].id,
        r.rows[0].full_name,
        "Reactivated employee",
      );
      res.json(r.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE ONE → soft-delete as Ex-Employee ───────────────────
router.delete(
  "/:id",
  requireAuth,
  perm("employees", "delete"),
  async (req, res, next) => {
    try {
      const r = await db.query(
        `UPDATE employees
         SET is_active = false,
             leaving_date = COALESCE(leaving_date, CURRENT_DATE)
         WHERE id = $1 RETURNING *`,
        [req.params.id],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      await log(
        req.user.id,
        "deactivated",
        r.rows[0].id,
        r.rows[0].full_name,
        "Moved to Ex-Employee",
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── FULL PROFILE (all assigned assets) ───────────────────────
router.get("/:id/profile", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [emp, systems, mobiles, sims, gws, inventory] = await Promise.all([
      db.query("SELECT * FROM employees WHERE id=$1", [id]),
      db.query(
        `SELECT id, asset_tag, type, manufacturer, model, serial_number,
                status, condition, location
         FROM systems WHERE assigned_user_id=$1 ORDER BY manufacturer, model`,
        [id],
      ),
      db.query(
        `SELECT id, asset_tag, manufacturer, model, serial_number, imei,
                status, condition
         FROM mobiles WHERE assigned_user_id=$1 ORDER BY manufacturer, model`,
        [id],
      ),
      db.query(
        `SELECT id, phone_number, vendor, package_name, status, purpose
         FROM sims WHERE assigned_user_id=$1 ORDER BY phone_number`,
        [id],
      ),
      db.query(
        `SELECT g.id, g.display_name, g.email, g.account_type, g.gws_role,
                g.license, g.two_fa, g.status, g.storage_used, g.storage_limit
         FROM gws_accounts g
         JOIN employees e ON LOWER(e.email) = LOWER(g.email)
         WHERE e.id=$1`,
        [id],
      ),
      db.query(
        `SELECT ia.asn_number, ia.assigned_date, i.name AS item_name,
                i.unit, iai.qty, c.name AS category_name
         FROM inv_assignments ia
         JOIN inv_assignment_items iai ON iai.assignment_id = ia.id
         JOIN inv_items i ON i.id = iai.item_id
         LEFT JOIN inv_categories c ON c.id = i.category_id
         WHERE ia.assignee_id=$1 AND iai.status='active'
         ORDER BY ia.assigned_date DESC, i.name`,
        [id],
      ),
    ]);
    if (!emp.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json({
      employee: emp.rows[0],
      systems: systems.rows,
      mobiles: mobiles.rows,
      sims: sims.rows,
      gws: gws.rows,
      inventory: inventory.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ── CLEARANCE REPORT ─────────────────────────────────────────
router.get("/:id/clearance", requireAuth, async (req, res, next) => {
  try {
    const id = req.params.id;

    const [emp, hardware, invItems, history] = await Promise.all([
      // Employee details
      db.query("SELECT * FROM employees WHERE id=$1", [id]),

      // All hardware currently assigned
      db.query(
        `SELECT 'system' AS asset_type, s.asset_tag, s.type AS device_type,
                s.manufacturer, s.model, s.serial_number, s.status, s.condition,
                s.purchase_date, s.warranty_expiry
         FROM systems s WHERE s.assigned_user_id=$1
         UNION ALL
         SELECT 'mobile', m.asset_tag, m.os,
                m.manufacturer, m.model, m.serial_number, m.status, m.condition,
                m.purchase_date, m.warranty_expiry
         FROM mobiles m WHERE m.assigned_user_id=$1
         UNION ALL
         SELECT 'sim', si.phone_number, 'SIM Card',
                si.vendor, si.package_name, si.phone_number, si.status, NULL,
                NULL, NULL
         FROM sims si WHERE si.assigned_user_id=$1
         ORDER BY asset_type, asset_tag`,
        [id, id, id],
      ),

      // Outstanding inventory assignments (items not returned)
      db.query(
        `SELECT ia.asn_number, ia.assigned_date, i.name AS item_name,
                i.unit, iai.qty, iai.status AS item_status
         FROM inv_assignments ia
         JOIN inv_assignment_items iai ON iai.assignment_id = ia.id
         JOIN inv_items i ON i.id = iai.item_id
         WHERE ia.assignee_id=$1 AND iai.status='active'
         ORDER BY ia.assigned_date DESC`,
        [id],
      ),

      // Full asset history (given and received)
      db.query(
        `SELECT ah.*, fe.full_name AS from_name, te.full_name AS to_name
         FROM asset_history ah
         LEFT JOIN employees fe ON fe.id = ah.from_employee_id
         LEFT JOIN employees te ON te.id = ah.to_employee_id
         WHERE ah.from_employee_id=$1 OR ah.to_employee_id=$1
         ORDER BY ah.created_at DESC`,
        [id, id],
      ),
    ]);

    if (!emp.rows[0]) return res.status(404).json({ error: "Not found" });

    res.json({
      employee: emp.rows[0],
      hardware: hardware.rows,
      inventoryItems: invItems.rows,
      assetHistory: history.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
