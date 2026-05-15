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
    [userId, action, 'systems', id, label, details]
  );
}

function normalizeRow(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw))
    out[k.trim().toLowerCase().replace(/[\s\-]+/g, '_')] = typeof v === 'string' ? v.trim() : v;
  return out;
}

function pickType(val) {
  if (!val) return 'System';
  const v = val.toLowerCase();
  if (v === 'laptop') return 'Laptop';
  if (v === 'server') return 'Server';
  return 'System';
}

function pickCondition(val) {
  if (!val) return null;
  return val.toLowerCase() === 'damaged' ? 'Damaged' : 'Working';
}

function pickAssignedType(val) {
  if (!val) return 'inventory';
  return val.toLowerCase().includes('user') ? 'user' : 'inventory';
}

function pickStatus(val) {
  const map = { in_use:'in_use','in use':'in_use', available:'available', repair:'repair', retired:'retired' };
  if (!val) return 'available';
  return map[val.toLowerCase()] || 'available';
}

async function autoTag() {
  const r = await db.query("SELECT nextval('system_asset_seq') AS n");
  return `IT-SYS-${String(r.rows[0].n).padStart(4,'0')}`;
}

// ── LIST ──────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { q, type, status, assigned_type } = req.query;
    let sql = `
      SELECT s.*, (e.first_name || ' ' || e.last_name) AS assigned_user_name, e.email AS assigned_user_email
      FROM systems s LEFT JOIN employees e ON e.id = s.assigned_user_id WHERE 1=1`;
    const params = []; let i = 1;
    if (q) { sql += ` AND (s.serial_number ILIKE $${i} OR s.manufacturer ILIKE $${i} OR s.model ILIKE $${i} OR s.cpu ILIKE $${i} OR s.asset_tag ILIKE $${i} OR s.department ILIKE $${i})`; params.push(`%${q}%`); i++; }
    if (type)          { sql += ` AND s.type=$${i++}`;          params.push(type); }
    if (status)        { sql += ` AND s.status=$${i++}`;        params.push(status); }
    if (assigned_type) { sql += ` AND s.assigned_type=$${i++}`; params.push(assigned_type); }
    sql += ' ORDER BY s.created_at DESC';
    res.json((await db.query(sql, params)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SAMPLE CSV ────────────────────────────────────────────
router.get('/sample/csv', requireAuth, (req, res) => {
  const csv = stringify([
    { asset_tag:'IT-SYS-0001', type:'Laptop', manufacturer:'Dell',   model:'Latitude 5540',   serial_number:'SN-DELL-001', generation:'12th Gen', assigned_to:'User',         condition:'Working', department:'Engineering',     location:'HQ Floor 2' },
    { asset_tag:'IT-SYS-0002', type:'Laptop', manufacturer:'HP',     model:'ProBook 450 G9',  serial_number:'SN-HP-002',   generation:'12th Gen', assigned_to:'IT Inventory', condition:'Working', department:'IT',              location:'HQ Floor 3' },
    { asset_tag:'IT-SYS-0003', type:'System', manufacturer:'Lenovo', model:'ThinkCentre M70', serial_number:'SN-LNV-003',  generation:'10th Gen', assigned_to:'User',         condition:'Working', department:'Human Resources', location:'HQ Floor 1' },
    { asset_tag:'IT-SYS-0004', type:'Server', manufacturer:'Dell',   model:'PowerEdge R740',  serial_number:'SN-SRV-001',  generation:'2nd Gen',  assigned_to:'IT Inventory', condition:'Working', department:'IT',              location:'Server Room' },
  ], { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=systems_sample.csv');
  res.send(csv);
});

// ── EXPORT CSV ────────────────────────────────────────────
router.get('/export/csv', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT s.asset_tag, s.type, s.manufacturer, s.model, s.serial_number, s.generation,
             CASE WHEN s.assigned_type='user' THEN 'User' ELSE 'IT Inventory' END AS assigned_to,
             s.condition, s.department, s.location, s.cpu, s.purpose,
             s.disk1_size, s.disk1_type, s.disk2_size, s.disk2_type,
             s.disk3_size, s.disk3_type, s.disk4_size, s.disk4_type,
             s.ram1_size, s.ram1_bus, s.ram2_size, s.ram2_bus,
             s.ram3_size, s.ram3_bus, s.ram4_size, s.ram4_bus,
             s.warranty_expiry, s.status, s.purchase_date, s.invoice_number, s.notes,
             (e.first_name || ' ' || e.last_name) AS assigned_user_name
      FROM systems s LEFT JOIN employees e ON e.id=s.assigned_user_id ORDER BY s.created_at DESC`);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=systems.csv');
    res.send(stringify(r.rows, { header: true }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── IMPORT CSV ────────────────────────────────────────────
router.post('/import/csv', requireAuth, perm('systems','create'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
    let inserted = 0, updated = 0, skipped = 0, errors = [];

    for (const raw of records) {
      const d      = normalizeRow(raw);
      const tag    = d.asset_tag || null;
      const serial = d.serial_number || d.serial || d.sn || null;
      const mfr    = d.manufacturer || null;
      const model  = d.model || null;

      try {
        // Locate existing record by asset_tag OR by brand+model+serial
        let existing = null;
        if (tag) {
          const r = await db.query('SELECT id FROM systems WHERE asset_tag=$1', [tag]);
          existing = r.rows[0];
        }
        if (!existing && mfr && model && serial) {
          const r = await db.query(
            'SELECT id FROM systems WHERE manufacturer=$1 AND model=$2 AND serial_number=$3',
            [mfr, model, serial]
          );
          existing = r.rows[0];
        }

        if (existing) {
          // UPDATE — only overwrite with non-null CSV values
          await db.query(`UPDATE systems SET
            type            = COALESCE($1,  type),
            manufacturer    = COALESCE($2,  manufacturer),
            model           = COALESCE($3,  model),
            serial_number   = COALESCE($4,  serial_number),
            generation      = COALESCE($5,  generation),
            assigned_type   = COALESCE($6,  assigned_type),
            condition       = COALESCE($7,  condition),
            department      = COALESCE($8,  department),
            location        = COALESCE($9,  location),
            cpu             = COALESCE($10, cpu),
            purpose         = COALESCE($11, purpose),
            disk1_size      = COALESCE($12, disk1_size),
            disk1_type      = COALESCE($13, disk1_type),
            disk2_size      = COALESCE($14, disk2_size),
            disk2_type      = COALESCE($15, disk2_type),
            disk3_size      = COALESCE($16, disk3_size),
            disk3_type      = COALESCE($17, disk3_type),
            disk4_size      = COALESCE($18, disk4_size),
            disk4_type      = COALESCE($19, disk4_type),
            ram1_size       = COALESCE($20, ram1_size),
            ram1_bus        = COALESCE($21, ram1_bus),
            ram2_size       = COALESCE($22, ram2_size),
            ram2_bus        = COALESCE($23, ram2_bus),
            ram3_size       = COALESCE($24, ram3_size),
            ram3_bus        = COALESCE($25, ram3_bus),
            ram4_size       = COALESCE($26, ram4_size),
            ram4_bus        = COALESCE($27, ram4_bus),
            warranty_expiry = COALESCE($28, warranty_expiry),
            status          = COALESCE($29, status),
            notes           = COALESCE($30, notes)
            WHERE id=$31`,
            [pickType(d.type)||null, mfr, model, serial, d.generation||null,
             pickAssignedType(d.assigned_to||d.assigned_type)||null,
             pickCondition(d.condition)||null, d.department||null, d.location||null,
             d.cpu||null, d.purpose||null,
             d.disk1_size||null, d.disk1_type||null, d.disk2_size||null, d.disk2_type||null,
             d.disk3_size||null, d.disk3_type||null, d.disk4_size||null, d.disk4_type||null,
             d.ram1_size||null, d.ram1_bus||null, d.ram2_size||null, d.ram2_bus||null,
             d.ram3_size||null, d.ram3_bus||null, d.ram4_size||null, d.ram4_bus||null,
             d.warranty_expiry||null, pickStatus(d.status)||null, d.notes||null,
             existing.id]
          );
          updated++;
        } else {
          // INSERT new record
          const newTag = tag || await autoTag();
          await db.query(
            `INSERT INTO systems
               (asset_tag,type,manufacturer,model,serial_number,generation,assigned_type,condition,department,location,
                cpu,purpose,disk1_size,disk1_type,disk2_size,disk2_type,disk3_size,disk3_type,disk4_size,disk4_type,
                ram1_size,ram1_bus,ram2_size,ram2_bus,ram3_size,ram3_bus,ram4_size,ram4_bus,
                warranty_expiry,status,notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
            [newTag, pickType(d.type), mfr, model, serial, d.generation||null,
             pickAssignedType(d.assigned_to||d.assigned_type),
             pickCondition(d.condition), d.department||null, d.location||null,
             d.cpu||null, d.purpose||null,
             d.disk1_size||null, d.disk1_type||null, d.disk2_size||null, d.disk2_type||null,
             d.disk3_size||null, d.disk3_type||null, d.disk4_size||null, d.disk4_type||null,
             d.ram1_size||null, d.ram1_bus||null, d.ram2_size||null, d.ram2_bus||null,
             d.ram3_size||null, d.ram3_bus||null, d.ram4_size||null, d.ram4_bus||null,
             d.warranty_expiry||null, pickStatus(d.status), d.notes||null]
          );
          inserted++;
        }
      } catch (e) { skipped++; errors.push(`${tag || mfr+' '+model}: ${e.message}`); }
    }
    await log(req.user.id, 'imported', null, 'CSV Import', `Imported ${inserted} new, updated ${updated} systems, skipped ${skipped}`);
    res.json({ inserted, updated, skipped, errors });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ALL ────────────────────────────────────────────
router.delete('/all', requireAuth, perm('systems','delete'), async (req, res) => {
  try {
    const all = await db.query('SELECT * FROM systems');
    await Promise.all(all.rows.map(row =>
      saveToRecycleBin('systems', 'systems', row, row.asset_tag || row.serial_number, req.user.id)
    ));
    const r = await db.query('DELETE FROM systems RETURNING id');
    await log(req.user.id, 'deleted_all', null, 'All Systems', `Deleted all ${r.rowCount} systems`);
    res.json({ deleted: r.rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET ONE ───────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT s.*, (e.first_name || ' ' || e.last_name) AS assigned_user_name FROM systems s LEFT JOIN employees e ON e.id=s.assigned_user_id WHERE s.id=$1`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CREATE ────────────────────────────────────────────────
router.post('/', requireAuth, perm('systems','create'), async (req, res) => {
  try {
    const d = req.body;
    if (!d.type || !d.serial_number) return res.status(400).json({ error: 'type and serial_number are required' });
    const tag = await autoTag();
    const r = await db.query(`
      INSERT INTO systems
        (asset_tag,type,manufacturer,model,serial_number,generation,assigned_type,assigned_user_id,
         condition,department,location,cpu,purpose,
         disk1_size,disk1_type,disk2_size,disk2_type,disk3_size,disk3_type,disk4_size,disk4_type,
         ram1_size,ram1_bus,ram2_size,ram2_bus,ram3_size,ram3_bus,ram4_size,ram4_bus,
         warranty_expiry,status,purchase_date,invoice_number,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34)
      RETURNING *`,
      [tag, d.type, d.manufacturer||null, d.model||null, d.serial_number, d.generation||null,
       d.assigned_type||'inventory', d.assigned_user_id||null,
       d.condition||null, d.department||null, d.location||null, d.cpu||null, d.purpose||null,
       d.disk1_size||null, d.disk1_type||null, d.disk2_size||null, d.disk2_type||null,
       d.disk3_size||null, d.disk3_type||null, d.disk4_size||null, d.disk4_type||null,
       d.ram1_size||null, d.ram1_bus||null, d.ram2_size||null, d.ram2_bus||null,
       d.ram3_size||null, d.ram3_bus||null, d.ram4_size||null, d.ram4_bus||null,
       d.warranty_expiry||null, d.status||'available', d.purchase_date||null, d.invoice_number||null, d.notes||null]
    );
    await log(req.user.id, 'created', r.rows[0].id, tag, `Added ${d.type} — ${d.manufacturer||''} ${d.model||''}`);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Serial number already exists' });
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE ────────────────────────────────────────────────
router.put('/:id', requireAuth, perm('systems','update'), async (req, res) => {
  try {
    const d = req.body;
    const r = await db.query(`
      UPDATE systems SET
        type=$1,manufacturer=$2,model=$3,serial_number=$4,generation=$5,
        assigned_type=$6,assigned_user_id=$7,condition=$8,department=$9,location=$10,cpu=$11,purpose=$12,
        disk1_size=$13,disk1_type=$14,disk2_size=$15,disk2_type=$16,
        disk3_size=$17,disk3_type=$18,disk4_size=$19,disk4_type=$20,
        ram1_size=$21,ram1_bus=$22,ram2_size=$23,ram2_bus=$24,
        ram3_size=$25,ram3_bus=$26,ram4_size=$27,ram4_bus=$28,
        warranty_expiry=$29,status=$30,purchase_date=$31,invoice_number=$32,notes=$33
      WHERE id=$34 RETURNING *`,
      [d.type, d.manufacturer||null, d.model||null, d.serial_number, d.generation||null,
       d.assigned_type||'inventory', d.assigned_user_id||null,
       d.condition||null, d.department||null, d.location||null, d.cpu||null, d.purpose||null,
       d.disk1_size||null, d.disk1_type||null, d.disk2_size||null, d.disk2_type||null,
       d.disk3_size||null, d.disk3_type||null, d.disk4_size||null, d.disk4_type||null,
       d.ram1_size||null, d.ram1_bus||null, d.ram2_size||null, d.ram2_bus||null,
       d.ram3_size||null, d.ram3_bus||null, d.ram4_size||null, d.ram4_bus||null,
       d.warranty_expiry||null, d.status||'available', d.purchase_date||null, d.invoice_number||null, d.notes||null,
       req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await log(req.user.id, 'updated', r.rows[0].id, r.rows[0].serial_number, 'Updated system');
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ────────────────────────────────────────────────
router.delete('/:id', requireAuth, perm('systems','delete'), async (req, res) => {
  try {
    const r = await db.query('DELETE FROM systems WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await saveToRecycleBin('systems', 'systems', r.rows[0], r.rows[0].asset_tag||r.rows[0].serial_number, req.user.id);
    await log(req.user.id, 'deleted', r.rows[0].id, r.rows[0].asset_tag||r.rows[0].serial_number, 'Deleted system');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
