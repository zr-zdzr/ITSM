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
  if (v === 'pc') return 'PC';
  if (v === 'workstation') return 'Workstation';
  if (v === 'other device') return 'Other Device';
  return 'System';
}

function pickCondition(val) {
  if (!val) return null;
  return val.toLowerCase() === 'damaged' ? 'Damaged' : 'Working';
}

function pickAssignedType(val) {
  if (!val) return 'inventory';
  const v = val.toLowerCase();
  if (v === 'employee') return 'employee';
  if (v === 'wfh' || v === 'work from home') return 'wfh';
  if (v === 'damaged') return 'damaged';
  if (v.includes('user')) return 'user';
  return 'inventory';
}

function pickStatus(val) {
  const map = {
    in_use: 'in_use', 'in use': 'in_use',
    available: 'available',
    assigned: 'assigned',
    repair: 'repair',
    retired: 'retired',
    lost: 'lost',
  };
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
      SELECT s.*, e.full_name AS assigned_user_name, e.email AS assigned_user_email
      FROM systems s LEFT JOIN employees e ON e.id = s.assigned_user_id WHERE 1=1`;
    const params = []; let i = 1;
    if (q) {
      sql += ` AND (s.serial_number ILIKE $${i} OR s.manufacturer ILIKE $${i} OR s.model ILIKE $${i} OR s.cpu ILIKE $${i} OR s.asset_tag ILIKE $${i} OR s.department ILIKE $${i} OR s.brand_type ILIKE $${i})`;
      params.push(`%${q}%`); i++;
    }
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
    {
      asset_tag: 'IT-SYS-0001', type: 'Laptop', brand_type: 'Branded',
      manufacturer: 'Dell', model: 'Latitude 5540', serial_number: 'SN-DELL-001',
      generation: '12th Gen', assigned_type: 'employee', department: 'Engineering',
      location: 'HQ Floor 2', purpose: 'Daily use', notes: '',
      cpu: 'Intel Core i7-1255U', cpu_cores: '10', cpu2: '', cpu2_cores: '',
      ram1_size: '16', ram1_bus: '3200MHz', ram1_slot: 'A1', ram1_serial: '',
      ram2_size: '16', ram2_bus: '3200MHz', ram2_slot: 'A2', ram2_serial: '',
      ram3_size: '', ram3_bus: '', ram3_slot: '', ram3_serial: '',
      ram4_size: '', ram4_bus: '', ram4_slot: '', ram4_serial: '',
      disk1_size: '512GB', disk1_type: 'NVMe',
      disk2_size: '', disk2_type: '',
      disk3_size: '', disk3_type: '',
      status: 'assigned', warranty_expiry: '2027-01-01',
    },
    {
      asset_tag: 'IT-SYS-0002', type: 'PC', brand_type: 'Unbranded',
      manufacturer: 'Custom', model: 'Desktop Build', serial_number: 'SN-CST-002',
      generation: '10th Gen', assigned_type: 'inventory', department: 'IT',
      location: 'HQ Floor 3', purpose: 'Dev workstation', notes: '',
      cpu: 'Intel Core i5-10400', cpu_cores: '6', cpu2: '', cpu2_cores: '',
      ram1_size: '8', ram1_bus: '2666MHz', ram1_slot: 'A1', ram1_serial: '',
      ram2_size: '8', ram2_bus: '2666MHz', ram2_slot: 'B1', ram2_serial: '',
      ram3_size: '', ram3_bus: '', ram3_slot: '', ram3_serial: '',
      ram4_size: '', ram4_bus: '', ram4_slot: '', ram4_serial: '',
      disk1_size: '256GB', disk1_type: 'SSD',
      disk2_size: '1TB', disk2_type: 'SATA',
      disk3_size: '', disk3_type: '',
      status: 'available', warranty_expiry: '',
    },
    {
      asset_tag: 'IT-SYS-0003', type: 'Server', brand_type: 'Branded',
      manufacturer: 'Dell', model: 'PowerEdge R740', serial_number: 'SN-SRV-001',
      generation: '2nd Gen', assigned_type: 'inventory', department: 'IT',
      location: 'Server Room', purpose: 'Production', notes: 'Rack unit 3',
      cpu: 'Intel Xeon Gold 6230', cpu_cores: '20', cpu2: 'Intel Xeon Gold 6230', cpu2_cores: '20',
      ram1_size: '32', ram1_bus: '2933MHz', ram1_slot: 'A1', ram1_serial: 'SN-RAM-001',
      ram2_size: '32', ram2_bus: '2933MHz', ram2_slot: 'A2', ram2_serial: 'SN-RAM-002',
      ram3_size: '32', ram3_bus: '2933MHz', ram3_slot: 'B1', ram3_serial: '',
      ram4_size: '32', ram4_bus: '2933MHz', ram4_slot: 'B2', ram4_serial: '',
      disk1_size: '1.2TB', disk1_type: 'SATA',
      disk2_size: '1.2TB', disk2_type: 'SATA',
      disk3_size: '480GB', disk3_type: 'SSD',
      status: 'in_use', warranty_expiry: '2026-06-30',
    },
  ], { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=systems_sample.csv');
  res.send(csv);
});

// ── EXPORT CSV ────────────────────────────────────────────
router.get('/export/csv', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT s.asset_tag, s.type, s.brand_type, s.manufacturer, s.model, s.serial_number, s.generation,
             s.assigned_type,
             CASE
               WHEN s.assigned_type IN ('employee','user','wfh') THEN e.full_name
               WHEN s.assigned_type = 'damaged' THEN 'Damaged'
               ELSE 'Inventory'
             END AS assigned_to,
             s.condition, s.department, s.location, s.purpose,
             s.cpu, s.cpu_cores, s.cpu2, s.cpu2_cores,
             s.ram1_size, s.ram1_bus, s.ram1_slot, s.ram1_serial,
             s.ram2_size, s.ram2_bus, s.ram2_slot, s.ram2_serial,
             s.ram3_size, s.ram3_bus, s.ram3_slot, s.ram3_serial,
             s.ram4_size, s.ram4_bus, s.ram4_slot, s.ram4_serial,
             s.disk1_size, s.disk1_type, s.disk2_size, s.disk2_type,
             s.disk3_size, s.disk3_type, s.disk4_size, s.disk4_type,
             s.warranty_expiry, s.status, s.purchase_date, s.invoice_number, s.notes,
             e.full_name AS assigned_user_name
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
      const serial = (d.serial_number || d.serial || d.sn || '').toUpperCase() || null;
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
            brand_type      = COALESCE($2,  brand_type),
            manufacturer    = COALESCE($3,  manufacturer),
            model           = COALESCE($4,  model),
            serial_number   = COALESCE($5,  serial_number),
            generation      = COALESCE($6,  generation),
            assigned_type   = COALESCE($7,  assigned_type),
            condition       = COALESCE($8,  condition),
            department      = COALESCE($9,  department),
            location        = COALESCE($10, location),
            cpu             = COALESCE($11, cpu),
            cpu_cores       = COALESCE($12, cpu_cores),
            cpu2            = COALESCE($13, cpu2),
            cpu2_cores      = COALESCE($14, cpu2_cores),
            purpose         = COALESCE($15, purpose),
            disk1_size      = COALESCE($16, disk1_size),
            disk1_type      = COALESCE($17, disk1_type),
            disk2_size      = COALESCE($18, disk2_size),
            disk2_type      = COALESCE($19, disk2_type),
            disk3_size      = COALESCE($20, disk3_size),
            disk3_type      = COALESCE($21, disk3_type),
            disk4_size      = COALESCE($22, disk4_size),
            disk4_type      = COALESCE($23, disk4_type),
            ram1_size       = COALESCE($24, ram1_size),
            ram1_bus        = COALESCE($25, ram1_bus),
            ram1_slot       = COALESCE($26, ram1_slot),
            ram1_serial     = COALESCE($27, ram1_serial),
            ram2_size       = COALESCE($28, ram2_size),
            ram2_bus        = COALESCE($29, ram2_bus),
            ram2_slot       = COALESCE($30, ram2_slot),
            ram2_serial     = COALESCE($31, ram2_serial),
            ram3_size       = COALESCE($32, ram3_size),
            ram3_bus        = COALESCE($33, ram3_bus),
            ram3_slot       = COALESCE($34, ram3_slot),
            ram3_serial     = COALESCE($35, ram3_serial),
            ram4_size       = COALESCE($36, ram4_size),
            ram4_bus        = COALESCE($37, ram4_bus),
            ram4_slot       = COALESCE($38, ram4_slot),
            ram4_serial     = COALESCE($39, ram4_serial),
            warranty_expiry = COALESCE($40, warranty_expiry),
            status          = COALESCE($41, status),
            notes           = COALESCE($42, notes)
            WHERE id=$43`,
            [
              pickType(d.type)||null, d.brand_type||null, mfr, model, serial,
              d.generation||null, pickAssignedType(d.assigned_to||d.assigned_type)||null,
              pickCondition(d.condition)||null, d.department||null, d.location||null,
              d.cpu||null, d.cpu_cores||null, d.cpu2||null, d.cpu2_cores||null,
              d.purpose||null,
              d.disk1_size||null, d.disk1_type||null, d.disk2_size||null, d.disk2_type||null,
              d.disk3_size||null, d.disk3_type||null, d.disk4_size||null, d.disk4_type||null,
              d.ram1_size||null, d.ram1_bus||null, d.ram1_slot||null, d.ram1_serial||null,
              d.ram2_size||null, d.ram2_bus||null, d.ram2_slot||null, d.ram2_serial||null,
              d.ram3_size||null, d.ram3_bus||null, d.ram3_slot||null, d.ram3_serial||null,
              d.ram4_size||null, d.ram4_bus||null, d.ram4_slot||null, d.ram4_serial||null,
              d.warranty_expiry||null, pickStatus(d.status)||null, d.notes||null,
              existing.id,
            ]
          );
          updated++;
        } else {
          // INSERT new record
          const newTag = tag || await autoTag();
          await db.query(
            `INSERT INTO systems
               (asset_tag,type,brand_type,manufacturer,model,serial_number,generation,assigned_type,condition,department,location,
                cpu,cpu_cores,cpu2,cpu2_cores,purpose,
                disk1_size,disk1_type,disk2_size,disk2_type,disk3_size,disk3_type,disk4_size,disk4_type,
                ram1_size,ram1_bus,ram1_slot,ram1_serial,
                ram2_size,ram2_bus,ram2_slot,ram2_serial,
                ram3_size,ram3_bus,ram3_slot,ram3_serial,
                ram4_size,ram4_bus,ram4_slot,ram4_serial,
                warranty_expiry,status,notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43)`,
            [
              newTag, pickType(d.type), d.brand_type||null, mfr, model, serial,
              d.generation||null, pickAssignedType(d.assigned_to||d.assigned_type),
              pickCondition(d.condition), d.department||null, d.location||null,
              d.cpu||null, d.cpu_cores||null, d.cpu2||null, d.cpu2_cores||null,
              d.purpose||null,
              d.disk1_size||null, d.disk1_type||null, d.disk2_size||null, d.disk2_type||null,
              d.disk3_size||null, d.disk3_type||null, d.disk4_size||null, d.disk4_type||null,
              d.ram1_size||null, d.ram1_bus||null, d.ram1_slot||null, d.ram1_serial||null,
              d.ram2_size||null, d.ram2_bus||null, d.ram2_slot||null, d.ram2_serial||null,
              d.ram3_size||null, d.ram3_bus||null, d.ram3_slot||null, d.ram3_serial||null,
              d.ram4_size||null, d.ram4_bus||null, d.ram4_slot||null, d.ram4_serial||null,
              d.warranty_expiry||null, pickStatus(d.status), d.notes||null,
            ]
          );
          inserted++;
        }
      } catch (e) { skipped++; errors.push(`${tag || (mfr+' '+model)}: ${e.message}`); }
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
      `SELECT s.*, e.full_name AS assigned_user_name FROM systems s LEFT JOIN employees e ON e.id=s.assigned_user_id WHERE s.id=$1`,
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
    if (!d.asset_tag) return res.status(400).json({ error: 'asset_tag is required' });
    if (!d.type) return res.status(400).json({ error: 'type is required' });
    if (!d.manufacturer) return res.status(400).json({ error: 'manufacturer is required' });
    if (!d.model) return res.status(400).json({ error: 'model is required' });
    if (!d.serial_number) return res.status(400).json({ error: 'serial_number is required' });

    const tag = d.asset_tag || await autoTag();
    const r = await db.query(`
      INSERT INTO systems
        (asset_tag,type,brand_type,manufacturer,model,serial_number,generation,
         assigned_type,assigned_user_id,condition,department,location,
         cpu,cpu_cores,cpu2,cpu2_cores,purpose,
         disk1_size,disk1_type,disk2_size,disk2_type,disk3_size,disk3_type,disk4_size,disk4_type,
         ram1_size,ram1_bus,ram1_slot,ram1_serial,
         ram2_size,ram2_bus,ram2_slot,ram2_serial,
         ram3_size,ram3_bus,ram3_slot,ram3_serial,
         ram4_size,ram4_bus,ram4_slot,ram4_serial,
         warranty_expiry,status,purchase_date,invoice_number,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46)
      RETURNING *`,
      [
        tag, d.type, d.brand_type||null, d.manufacturer||null, d.model||null,
        (d.serial_number||'').toUpperCase(), d.generation||null,
        d.assigned_type||'inventory', d.assigned_user_id||null,
        d.condition||null, d.department||null, d.location||null,
        d.cpu||null, d.cpu_cores||null, d.cpu2||null, d.cpu2_cores||null,
        d.purpose||null,
        d.disk1_size||null, d.disk1_type||null, d.disk2_size||null, d.disk2_type||null,
        d.disk3_size||null, d.disk3_type||null, d.disk4_size||null, d.disk4_type||null,
        d.ram1_size||null, d.ram1_bus||null, d.ram1_slot||null, d.ram1_serial||null,
        d.ram2_size||null, d.ram2_bus||null, d.ram2_slot||null, d.ram2_serial||null,
        d.ram3_size||null, d.ram3_bus||null, d.ram3_slot||null, d.ram3_serial||null,
        d.ram4_size||null, d.ram4_bus||null, d.ram4_slot||null, d.ram4_serial||null,
        d.warranty_expiry||null, d.status||'available',
        d.purchase_date||null, d.invoice_number||null, d.notes||null,
      ]
    );
    await log(req.user.id, 'created', r.rows[0].id, tag, `Added ${d.type} — ${d.manufacturer||''} ${d.model||''}`);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Asset tag or serial number already exists' });
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE ────────────────────────────────────────────────
router.put('/:id', requireAuth, perm('systems','update'), async (req, res) => {
  try {
    const d = req.body;
    const r = await db.query(`
      UPDATE systems SET
        type=$1,brand_type=$2,manufacturer=$3,model=$4,serial_number=$5,generation=$6,
        assigned_type=$7,assigned_user_id=$8,condition=$9,department=$10,location=$11,
        cpu=$12,cpu_cores=$13,cpu2=$14,cpu2_cores=$15,purpose=$16,
        disk1_size=$17,disk1_type=$18,disk2_size=$19,disk2_type=$20,
        disk3_size=$21,disk3_type=$22,disk4_size=$23,disk4_type=$24,
        ram1_size=$25,ram1_bus=$26,ram1_slot=$27,ram1_serial=$28,
        ram2_size=$29,ram2_bus=$30,ram2_slot=$31,ram2_serial=$32,
        ram3_size=$33,ram3_bus=$34,ram3_slot=$35,ram3_serial=$36,
        ram4_size=$37,ram4_bus=$38,ram4_slot=$39,ram4_serial=$40,
        warranty_expiry=$41,status=$42,purchase_date=$43,invoice_number=$44,notes=$45
      WHERE id=$46 RETURNING *`,
      [
        d.type, d.brand_type||null, d.manufacturer||null, d.model||null,
        (d.serial_number||'').toUpperCase(), d.generation||null,
        d.assigned_type||'inventory', d.assigned_user_id||null,
        d.condition||null, d.department||null, d.location||null,
        d.cpu||null, d.cpu_cores||null, d.cpu2||null, d.cpu2_cores||null,
        d.purpose||null,
        d.disk1_size||null, d.disk1_type||null, d.disk2_size||null, d.disk2_type||null,
        d.disk3_size||null, d.disk3_type||null, d.disk4_size||null, d.disk4_type||null,
        d.ram1_size||null, d.ram1_bus||null, d.ram1_slot||null, d.ram1_serial||null,
        d.ram2_size||null, d.ram2_bus||null, d.ram2_slot||null, d.ram2_serial||null,
        d.ram3_size||null, d.ram3_bus||null, d.ram3_slot||null, d.ram3_serial||null,
        d.ram4_size||null, d.ram4_bus||null, d.ram4_slot||null, d.ram4_serial||null,
        d.warranty_expiry||null, d.status||'available',
        d.purchase_date||null, d.invoice_number||null, d.notes||null,
        req.params.id,
      ]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await log(req.user.id, 'updated', r.rows[0].id, r.rows[0].asset_tag||r.rows[0].serial_number, 'Updated system');
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
