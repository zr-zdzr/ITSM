const router = require('express').Router();
const multer = require('multer');
const { saveToRecycleBin } = require('../utils/recycle');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const db = require('../config/db');
const { requireAuth, perm } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function log(userId, action, id, label, details) {
  await db.query(
    'INSERT INTO activity_log (user_id,action,table_name,record_id,record_label,details) VALUES ($1,$2,$3,$4,$5,$6)',
    [userId, action, 'mobiles', id, label, details]
  );
}

function normalizeRow(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw))
    out[k.trim().toLowerCase().replace(/[\s\-]+/g, '_')] = typeof v === 'string' ? v.trim() : v;
  return out;
}

const VALID_OS = ['Android','iOS','Other'];
function pickOS(val) {
  if (!val) return 'Android';
  return VALID_OS.find(o => o.toLowerCase() === val.toLowerCase()) || 'Android';
}

const VALID_PURPOSES = ['personal','qa_testing','service'];
function pickPurpose(val) {
  if (!val) return null;
  const v = val.toLowerCase().replace(/[\s\-]+/g, '_');
  return VALID_PURPOSES.includes(v) ? v : null;
}

function pickAssignedType(val) {
  if (!val) return 'inventory';
  return val.toLowerCase().includes('user') ? 'user' : 'inventory';
}

function pickCondition(val) {
  if (!val) return null;
  return val.toLowerCase() === 'damaged' ? 'Damaged' : 'Working';
}

function pickStatus(val) {
  const map = { in_use:'in_use', 'in use':'in_use', available:'available', repair:'repair', retired:'retired' };
  if (!val) return 'available';
  return map[val.toLowerCase()] || 'available';
}

async function autoTag() {
  const r = await db.query("SELECT nextval('mobile_asset_seq') AS n");
  return `IT-MB-${String(r.rows[0].n).padStart(4,'0')}`;
}

// ── LIST ──────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { q, status, purpose, os } = req.query;
    let sql = `SELECT m.*, (e.first_name || ' ' || e.last_name) AS assigned_user_name
               FROM mobiles m LEFT JOIN employees e ON e.id=m.assigned_user_id WHERE 1=1`;
    const params = []; let i = 1;
    if (q)       { sql += ` AND (m.manufacturer ILIKE $${i} OR m.model ILIKE $${i} OR m.serial_number ILIKE $${i} OR m.imei ILIKE $${i} OR m.asset_tag ILIKE $${i} OR m.department ILIKE $${i})`; params.push(`%${q}%`); i++; }
    if (status)  { sql += ` AND m.status=$${i++}`;  params.push(status); }
    if (purpose) { sql += ` AND m.purpose=$${i++}`; params.push(purpose); }
    if (os)      { sql += ` AND m.os=$${i++}`;      params.push(os); }
    sql += ' ORDER BY m.created_at DESC';
    res.json((await db.query(sql, params)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SAMPLE CSV ────────────────────────────────────────────
router.get('/sample/csv', requireAuth, (req, res) => {
  const csv = stringify([
    { asset_tag:'IT-MB-0001', manufacturer:'Samsung', model:'Galaxy S23',    serial_number:'R3CR1234567',  assigned_to:'User',         department:'Engineering'     },
    { asset_tag:'IT-MB-0002', manufacturer:'Apple',   model:'iPhone 14',     serial_number:'F1MN1234567',  assigned_to:'IT Inventory', department:'IT'              },
    { asset_tag:'IT-MB-0003', manufacturer:'Xiaomi',  model:'Redmi Note 12', serial_number:'XM1234567890', assigned_to:'User',         department:'Human Resources' },
  ], { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=mobiles_sample.csv');
  res.send(csv);
});

// ── EXPORT CSV ────────────────────────────────────────────
router.get('/export/csv', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT m.asset_tag, m.manufacturer, m.model, m.serial_number,
             m.imei AS imei_1, m.imei2 AS imei_2,
             CASE WHEN m.assigned_type='user' THEN 'User' ELSE 'IT Inventory' END AS assigned_to,
             m.department, m.purpose AS assigned_purpose,
             m.warranty_start, m.warranty_expiry AS warranty_end,
             m.condition, m.os, m.os_version, m.color, m.storage_capacity,
             m.status, m.purchase_date, m.invoice_number, m.notes,
             (e.first_name || ' ' || e.last_name) AS assigned_user_name
      FROM mobiles m LEFT JOIN employees e ON e.id=m.assigned_user_id ORDER BY m.created_at DESC`);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=mobiles.csv');
    res.send(stringify(r.rows, { header: true }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── IMPORT CSV ────────────────────────────────────────────
router.post('/import/csv', requireAuth, perm('mobiles','create'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
    let inserted = 0, updated = 0, skipped = 0, errors = [];
    for (const raw of records) {
      const d = normalizeRow(raw);
      const tag   = d.asset_tag || null;
      const mfr   = d.manufacturer || d.make || d.brand || null;
      const model = d.model || d.device || null;
      const serial = d.serial_number || d.serial || d.sn || null;
      try {
        let existing = null;
        if (tag) {
          const r = await db.query('SELECT id FROM mobiles WHERE asset_tag=$1', [tag]);
          existing = r.rows[0];
        }
        if (!existing && mfr && model && serial) {
          const r = await db.query(
            'SELECT id FROM mobiles WHERE manufacturer=$1 AND model=$2 AND serial_number=$3',
            [mfr, model, serial]
          );
          existing = r.rows[0];
        }

        const imei   = d.imei_1||d.imei||null;
        const imei2  = d.imei_2||d.imei2||null;
        const os     = pickOS(d.os);
        const atype  = pickAssignedType(d.assigned_to||d.assigned_type);
        const dept   = d.department||null;
        const purp   = pickPurpose(d.assigned_purpose||d.purpose);
        const wstart = d.warranty_start||null;
        const wend   = d.warranty_end||d.warranty_expiry||null;
        const cond   = pickCondition(d.condition);
        const status = pickStatus(d.status);
        const notes  = d.notes||null;

        if (existing) {
          await db.query(`
            UPDATE mobiles SET
              manufacturer    = COALESCE($1, manufacturer),
              model           = COALESCE($2, model),
              serial_number   = COALESCE($3, serial_number),
              imei            = COALESCE($4, imei),
              imei2           = COALESCE($5, imei2),
              os              = COALESCE($6, os),
              assigned_type   = COALESCE($7, assigned_type),
              department      = COALESCE($8, department),
              purpose         = COALESCE($9, purpose),
              warranty_start  = COALESCE($10, warranty_start),
              warranty_expiry = COALESCE($11, warranty_expiry),
              condition       = COALESCE($12, condition),
              status          = COALESCE($13, status),
              notes           = COALESCE($14, notes)
            WHERE id=$15`,
            [mfr, model, serial, imei, imei2, os, atype, dept, purp,
             wstart, wend, cond, status, notes, existing.id]
          );
          updated++;
        } else {
          const newTag = tag || await autoTag();
          await db.query(
            `INSERT INTO mobiles
               (asset_tag,manufacturer,model,serial_number,imei,imei2,os,assigned_type,department,
                purpose,warranty_start,warranty_expiry,condition,status,notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [newTag, mfr||'Unknown', model||'Unknown', serial,
             imei, imei2, os, atype, dept, purp, wstart, wend, cond, status, notes]
          );
          inserted++;
        }
      } catch (e) { skipped++; errors.push(`${tag||serial||'?'}: ${e.message}`); }
    }
    await log(req.user.id, 'imported', null, 'CSV Import', `Imported ${inserted} mobiles, updated ${updated}, skipped ${skipped}`);
    res.json({ inserted, updated, skipped, errors });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ALL ────────────────────────────────────────────
router.delete('/all', requireAuth, perm('mobiles','delete'), async (req, res) => {
  try {
    const all = await db.query('SELECT * FROM mobiles');
    await Promise.all(all.rows.map(row =>
      saveToRecycleBin('mobiles', 'mobiles', row, row.asset_tag || `${row.manufacturer||''} ${row.model||''}`.trim(), req.user.id)
    ));
    const r = await db.query('DELETE FROM mobiles RETURNING id');
    await log(req.user.id, 'deleted_all', null, 'All Mobiles', `Deleted all ${r.rowCount} mobiles`);
    res.json({ deleted: r.rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET ONE ───────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT m.*, (e.first_name || ' ' || e.last_name) AS assigned_user_name
       FROM mobiles m LEFT JOIN employees e ON e.id=m.assigned_user_id WHERE m.id=$1`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CREATE ────────────────────────────────────────────────
router.post('/', requireAuth, perm('mobiles','create'), async (req, res) => {
  try {
    const d = req.body;
    if (!d.manufacturer || !d.model || !d.serial_number || !d.os)
      return res.status(400).json({ error: 'manufacturer, model, serial_number and os are required' });
    const tag = await autoTag();
    const r = await db.query(
      `INSERT INTO mobiles
         (asset_tag,manufacturer,model,serial_number,imei,imei2,color,storage_capacity,
          os,os_version,assigned_type,assigned_user_id,department,purpose,service_details,
          warranty_start,warranty_expiry,condition,purchase_date,invoice_number,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [tag, d.manufacturer, d.model, d.serial_number, d.imei||null, d.imei2||null,
       d.color||null, d.storage_capacity||null, d.os, d.os_version||null,
       d.assigned_type||'inventory', d.assigned_user_id||null,
       d.department||null, d.purpose||null, d.service_details||null,
       d.warranty_start||null, d.warranty_expiry||null, d.condition||null,
       d.purchase_date||null, d.invoice_number||null, d.status||'available', d.notes||null]
    );
    await log(req.user.id, 'created', r.rows[0].id, tag, `Added ${d.manufacturer} ${d.model}`);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── UPDATE ────────────────────────────────────────────────
router.put('/:id', requireAuth, perm('mobiles','update'), async (req, res) => {
  try {
    const d = req.body;
    if (!d.manufacturer || !d.model || !d.serial_number || !d.os)
      return res.status(400).json({ error: 'manufacturer, model, serial_number and os are required' });
    const r = await db.query(
      `UPDATE mobiles SET manufacturer=$1,model=$2,serial_number=$3,imei=$4,imei2=$5,color=$6,
         storage_capacity=$7,os=$8,os_version=$9,assigned_type=$10,assigned_user_id=$11,
         department=$12,purpose=$13,service_details=$14,warranty_start=$15,warranty_expiry=$16,
         condition=$17,purchase_date=$18,invoice_number=$19,status=$20,notes=$21
       WHERE id=$22 RETURNING *`,
      [d.manufacturer, d.model, d.serial_number, d.imei||null, d.imei2||null, d.color||null,
       d.storage_capacity||null, d.os, d.os_version||null,
       d.assigned_type||'inventory', d.assigned_user_id||null,
       d.department||null, d.purpose||null, d.service_details||null,
       d.warranty_start||null, d.warranty_expiry||null, d.condition||null,
       d.purchase_date||null, d.invoice_number||null, d.status||'available', d.notes||null,
       req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await log(req.user.id, 'updated', r.rows[0].id, `${d.manufacturer} ${d.model}`, 'Updated mobile');
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ────────────────────────────────────────────────
router.delete('/:id', requireAuth, perm('mobiles','delete'), async (req, res) => {
  try {
    const r = await db.query('DELETE FROM mobiles WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await saveToRecycleBin('mobiles', 'mobiles', r.rows[0], r.rows[0].asset_tag || `${r.rows[0].manufacturer||''} ${r.rows[0].model||''}`.trim(), req.user.id);
    await log(req.user.id, 'deleted', r.rows[0].id, r.rows[0].asset_tag, 'Deleted mobile');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
