const router = require("express").Router();
const multer = require("multer");
const { saveToRecycleBin } = require("../utils/recycle");
const { logAssetEvent } = require("../utils/assetHistory");
const { parse } = require("csv-parse/sync");
const { stringify } = require("csv-stringify/sync");
const db = require("../config/db");
const { logActivity, diffRows } = require("../utils/activity");
const { requireAuth, perm } = require("../middleware/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Delegates to the shared helper so this route's entries also capture
// user_label (which survives account deletion) and the field-level diff.
async function log(userId, action, id, label, details, changes) {
  await logActivity(
    userId,
    action,
    "mobiles",
    id,
    label,
    details,
    null,
    changes,
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

function pickType(val) {
  if (!val) return null;
  const v = val.toLowerCase();
  if (v.includes("pad") || v.includes("tablet")) return "Pad";
  return "Mobile";
}

function pickPurpose(val) {
  if (!val) return null;
  const v = val.toLowerCase();
  if (v === "official" || v === "office") return "official";
  if (v === "service") return "service";
  if (v === "personal") return "personal";
  if (v.includes("qa") || v.includes("test")) return "qa_testing";
  return null;
}

function pickAssignedType(val) {
  if (!val) return "inventory";
  const v = val.toLowerCase();
  if (v.includes("employee") || v.includes("user")) return "employee";
  if (v.includes("wfh") || v.includes("work from home")) return "wfh";
  if (v.includes("damage") || v.includes("damaged")) return "damaged";
  return "inventory";
}

async function autoTag() {
  const r = await db.query("SELECT nextval('mobile_asset_seq') AS n");
  return `IT-MB-${String(r.rows[0].n).padStart(4, "0")}`;
}

const SELECT_COLS = `
  m.id, m.asset_tag, m.type, m.manufacturer, m.model, m.serial_number,
  m.imei AS imei1, m.imei2, m.os, m.location, m.department,
  m.assigned_type, m.assigned_user_id, m.purpose,
  m.warranty_expiry, m.notes, m.status, m.condition,
  m.color, m.storage_capacity, m.purchase_date, m.created_at, m.updated_at,
  e.full_name AS assigned_user_name
`;

// ── LIST ──────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { q } = req.query;
    let sql = `SELECT ${SELECT_COLS} FROM mobiles m LEFT JOIN employees e ON e.id=m.assigned_user_id WHERE 1=1`;
    const params = [];
    let i = 1;
    if (q) {
      sql += ` AND (m.manufacturer ILIKE $${i} OR m.model ILIKE $${i} OR m.serial_number ILIKE $${i} OR m.imei ILIKE $${i} OR m.asset_tag ILIKE $${i} OR m.department ILIKE $${i} OR m.type ILIKE $${i})`;
      params.push(`%${q}%`);
      i++;
    }
    sql += " ORDER BY m.created_at DESC";
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
        asset_tag: "IT-MB-0001",
        type: "Mobile",
        manufacturer: "Samsung",
        model: "Galaxy S23",
        serial_number: "R3CR1234567",
        imei_1: "351234567890001",
        imei_2: "351234567890002",
        os: "Android",
        location: "Karachi HQ",
        department: "Engineering",
        assigned_to: "Employee",
        purpose: "official",
        warranty_expiry: "2026-12-31",
        notes: "",
      },
      {
        asset_tag: "IT-MB-0002",
        type: "Mobile",
        manufacturer: "Apple",
        model: "iPhone 14",
        serial_number: "F1MN1234567",
        imei_1: "352345678901234",
        imei_2: "",
        os: "iOS",
        location: "Lahore Office",
        department: "IT",
        assigned_to: "Inventory",
        purpose: "",
        warranty_expiry: "2027-06-30",
        notes: "Spare device",
      },
      {
        asset_tag: "IT-MB-0003",
        type: "Pad",
        manufacturer: "Apple",
        model: "iPad Pro 11",
        serial_number: "DMPXYZ12345",
        imei_1: "",
        imei_2: "",
        os: "iOS",
        location: "Karachi HQ",
        department: "Operations",
        assigned_to: "WFH",
        purpose: "official",
        warranty_expiry: "2027-03-15",
        notes: "",
      },
    ],
    { header: true },
  );
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=mobiles_sample.csv",
  );
  res.send(csv);
});

// ── EXPORT CSV ────────────────────────────────────────────
router.get("/export/csv", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT m.asset_tag,
        CASE WHEN m.assigned_type IN ('employee','user') THEN 'Employee'
             WHEN m.assigned_type='wfh' THEN 'WFH'
             WHEN m.assigned_type='damaged' THEN 'Damaged'
             ELSE 'Inventory' END AS assigned_to,
        e.full_name AS assigned_user_name,
        m.department, m.type, m.manufacturer, m.model, m.serial_number,
        m.imei AS imei_1, m.imei2 AS imei_2, m.os, e.location,
        m.purpose, m.warranty_expiry, m.notes
      FROM mobiles m LEFT JOIN employees e ON e.id=m.assigned_user_id ORDER BY m.created_at DESC`);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=mobiles.csv");
    res.send(stringify(r.rows, { header: true, quoted_string: true }));
  } catch (err) {
    next(err);
  }
});

// ── IMPORT CSV ────────────────────────────────────────────
router.post(
  "/import/csv",
  requireAuth,
  perm("mobiles", "create"),
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
        const tag = d.asset_tag || null;
        const mfr = d.manufacturer || d.make || d.brand || null;
        const model = d.model || d.device || null;
        const serial =
          (d.serial_number || d.serial || d.sn || "").toUpperCase() || null;

        if (!mfr || !model || !serial) {
          skipped++;
          errors.push(
            `Row missing mandatory fields (manufacturer, model, serial_number): ${JSON.stringify(d)}`,
          );
          continue;
        }

        try {
          let existing = null;
          if (tag) {
            const r = await db.query(
              "SELECT id FROM mobiles WHERE asset_tag=$1",
              [tag],
            );
            existing = r.rows[0];
          }
          if (!existing) {
            const r = await db.query(
              "SELECT id FROM mobiles WHERE manufacturer=$1 AND model=$2 AND serial_number=$3",
              [mfr, model, serial],
            );
            existing = r.rows[0];
          }

          const devType = pickType(d.type || d.device_type);
          const imei1 = (d.imei_1 || d.imei || "").toUpperCase() || null;
          const imei2 = (d.imei_2 || d.imei2 || "").toUpperCase() || null;
          const os = d.os || null;
          const location = d.location || null;
          const dept = d.department || null;
          const atype = pickAssignedType(d.assigned_to || d.assigned_type);
          const purpose = pickPurpose(d.purpose);
          const warranty = d.warranty_expiry || d.warranty || null;
          const notes = d.notes || null;

          if (existing) {
            await db.query(
              `
            UPDATE mobiles SET
              type            = COALESCE($1, type),
              manufacturer    = COALESCE($2, manufacturer),
              model           = COALESCE($3, model),
              serial_number   = COALESCE($4, serial_number),
              imei            = COALESCE($5, imei),
              imei2           = COALESCE($6, imei2),
              os              = COALESCE($7, os),
              location        = COALESCE($8, location),
              department      = COALESCE($9, department),
              assigned_type   = COALESCE($10, assigned_type),
              purpose         = COALESCE($11, purpose),
              warranty_expiry = COALESCE($12, warranty_expiry),
              notes           = COALESCE($13, notes)
            WHERE id=$14`,
              [
                devType,
                mfr,
                model,
                serial,
                imei1,
                imei2,
                os,
                location,
                dept,
                atype,
                purpose,
                warranty,
                notes,
                existing.id,
              ],
            );
            updated++;
          } else {
            const newTag = tag || (await autoTag());
            await db.query(
              `INSERT INTO mobiles
               (asset_tag, type, manufacturer, model, serial_number, imei, imei2,
                os, location, department, assigned_type, purpose, warranty_expiry, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
              [
                newTag,
                devType,
                mfr,
                model,
                serial,
                imei1,
                imei2,
                os,
                location,
                dept,
                atype,
                purpose,
                warranty,
                notes,
              ],
            );
            inserted++;
          }
        } catch (e) {
          skipped++;
          errors.push(`${tag || serial || "?"}: ${e.message}`);
        }
      }
      await log(
        req.user.id,
        "imported",
        null,
        "CSV Import",
        `Imported ${inserted} mobiles, updated ${updated}, skipped ${skipped}`,
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
  perm("mobiles", "delete"),
  async (req, res, next) => {
    try {
      const all = await db.query("SELECT * FROM mobiles");
      await Promise.all(
        all.rows.map((row) =>
          saveToRecycleBin(
            "mobiles",
            "mobiles",
            row,
            row.asset_tag ||
              `${row.manufacturer || ""} ${row.model || ""}`.trim(),
            req.user.id,
          ),
        ),
      );
      const r = await db.query("DELETE FROM mobiles RETURNING id");
      await log(
        req.user.id,
        "deleted_all",
        null,
        "All Mobiles",
        `Deleted all ${r.rowCount} mobiles`,
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
      `SELECT ${SELECT_COLS} FROM mobiles m LEFT JOIN employees e ON e.id=m.assigned_user_id WHERE m.id=$1`,
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
  perm("mobiles", "create"),
  async (req, res, next) => {
    try {
      const d = req.body;
      if (!d.asset_tag)
        return res.status(400).json({ error: "Asset Tag is required" });
      if (!d.type) return res.status(400).json({ error: "Type is required" });
      if (!d.manufacturer)
        return res.status(400).json({ error: "Manufacturer is required" });
      if (!d.model) return res.status(400).json({ error: "Model is required" });
      if (!d.serial_number)
        return res.status(400).json({ error: "Serial Number is required" });

      const r = await db.query(
        `INSERT INTO mobiles
         (asset_tag, type, manufacturer, model, serial_number, imei, imei2,
          os, location, department, assigned_type, assigned_user_id,
          purpose, warranty_expiry, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [
          d.asset_tag,
          d.type,
          d.manufacturer,
          d.model,
          (d.serial_number || "").toUpperCase(),
          (d.imei1 || "").toUpperCase() || null,
          (d.imei2 || "").toUpperCase() || null,
          d.os || null,
          d.location || null,
          d.department || null,
          d.assigned_type || "inventory",
          d.assigned_user_id || null,
          d.purpose || null,
          d.warranty_expiry || null,
          d.notes || null,
          "available",
        ],
      );
      await log(
        req.user.id,
        "created",
        r.rows[0].id,
        d.asset_tag,
        `Added ${d.manufacturer} ${d.model}`,
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
  perm("mobiles", "update"),
  async (req, res, next) => {
    try {
      const d = req.body;
      if (!d.asset_tag)
        return res.status(400).json({ error: "Asset Tag is required" });
      if (!d.type) return res.status(400).json({ error: "Type is required" });
      if (!d.manufacturer)
        return res.status(400).json({ error: "Manufacturer is required" });
      if (!d.model) return res.status(400).json({ error: "Model is required" });
      if (!d.serial_number)
        return res.status(400).json({ error: "Serial Number is required" });

      // Full row, not a column subset: diffRows() compares every column of the
      // updated row, so a partial "before" makes untouched fields look changed.
      const prev = await db.query("SELECT * FROM mobiles WHERE id=$1", [
        req.params.id,
      ]);
      const old = prev.rows[0];
      const r = await db.query(
        `UPDATE mobiles SET
         asset_tag=$1, type=$2, manufacturer=$3, model=$4, serial_number=$5,
         imei=$6, imei2=$7, os=$8, location=$9, department=$10,
         assigned_type=$11, assigned_user_id=$12, purpose=$13,
         warranty_expiry=$14, notes=$15
       WHERE id=$16 RETURNING *`,
        [
          d.asset_tag,
          d.type,
          d.manufacturer,
          d.model,
          (d.serial_number || "").toUpperCase(),
          (d.imei1 || "").toUpperCase() || null,
          (d.imei2 || "").toUpperCase() || null,
          d.os || null,
          d.location || null,
          d.department || null,
          d.assigned_type || "inventory",
          d.assigned_user_id || null,
          d.purpose || null,
          d.warranty_expiry || null,
          d.notes || null,
          req.params.id,
        ],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      const upd = r.rows[0];
      const changes = diffRows(old, upd);
      await log(
        req.user.id,
        "updated",
        upd.id,
        d.asset_tag,
        changes
          ? `Updated mobile device: ${Object.keys(changes).join(", ")}`
          : "Updated mobile device (no field changes)",
        changes,
      );
      if (old) {
        const newEmp = d.assigned_user_id ? Number(d.assigned_user_id) : null;
        const oldEmp = old.assigned_user_id
          ? Number(old.assigned_user_id)
          : null;
        const newType = d.assigned_type || "inventory";
        if (oldEmp !== newEmp || old.assigned_type !== newType) {
          let eventType = "status_change";
          if (!oldEmp && newEmp) eventType = "assigned";
          else if (oldEmp && !newEmp) eventType = "unassigned";
          else if (oldEmp && newEmp && oldEmp !== newEmp)
            eventType = "transferred";
          else if (newType === "damaged") eventType = "replaced";
          await logAssetEvent({
            assetType: "mobile",
            assetId: upd.id,
            assetLabel: upd.asset_tag,
            eventType,
            fromEmployeeId: oldEmp,
            toEmployeeId: newEmp,
            fromStatus: old.status,
            toStatus: upd.status,
            reason: newType === "damaged" ? "damage" : d.reason || null,
            notes: d.notes || null,
            performedBy: req.user.id,
          });
        }
      }
      res.json(upd);
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE ────────────────────────────────────────────────
router.delete(
  "/:id",
  requireAuth,
  perm("mobiles", "delete"),
  async (req, res, next) => {
    try {
      const r = await db.query("DELETE FROM mobiles WHERE id=$1 RETURNING *", [
        req.params.id,
      ]);
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      await saveToRecycleBin(
        "mobiles",
        "mobiles",
        r.rows[0],
        r.rows[0].asset_tag ||
          `${r.rows[0].manufacturer || ""} ${r.rows[0].model || ""}`.trim(),
        req.user.id,
      );
      await log(
        req.user.id,
        "deleted",
        r.rows[0].id,
        r.rows[0].asset_tag,
        "Deleted mobile",
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
