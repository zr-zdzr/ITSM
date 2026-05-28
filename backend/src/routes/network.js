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
    [userId, action, 'network_devices', id, label, details]
  );
}

function normalizeRow(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw))
    out[k.trim().toLowerCase().replace(/[\s\-]+/g, '_')] = typeof v === 'string' ? v.trim() : v;
  return out;
}

const MONTH_LETTER = ['J','F','M','A','M','J','J','A','S','O','N','D'];
async function genNetTag(purchase_date) {
  if (purchase_date) {
    const d = new Date(purchase_date);
    const base = `${d.getDate()}${MONTH_LETTER[d.getMonth()]}${String(d.getFullYear()).slice(-2)}ID`;
    const { rows } = await db.query(
      "SELECT COUNT(*) n FROM network_devices WHERE asset_tag LIKE $1", [`${base}%`]
    );
    const n = Number(rows[0].n);
    return n === 0 ? base : `${base}-${n + 1}`;
  }
  const r = await db.query("SELECT nextval('network_asset_seq') AS n");
  return `IT-NET-${String(r.rows[0].n).padStart(4,'0')}`;
}

// ── LIST ──────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { q, device_type, status } = req.query;
    let sql = 'SELECT * FROM network_devices WHERE 1=1';
    const params = []; let i = 1;
    if (q)           { sql += ` AND (brand ILIKE $${i} OR model ILIKE $${i} OR serial_number ILIKE $${i} OR ip_address ILIKE $${i} OR location ILIKE $${i})`; params.push(`%${q}%`); i++; }
    if (device_type) { sql += ` AND device_type=$${i++}`; params.push(device_type); }
    if (status)      { sql += ` AND status=$${i++}`;      params.push(status); }
    sql += ' ORDER BY created_at DESC';
    res.json((await db.query(sql, params)).rows);
  } catch (err) { next(err); }
});

// ── SAMPLE CSV ────────────────────────────────────────────
router.get('/sample/csv', requireAuth, (req, res) => {
  const csv = stringify([
    { device_type:'Switch',   brand:'Cisco',   model:'SG300-28',     serial_number:'FOC1234X001', ip_address:'192.168.1.1',  location:'Server Room',  status:'in_use'    },
    { device_type:'Router',   brand:'Juniper', model:'MX204',        serial_number:'JN1234X002',  ip_address:'10.0.0.1',     location:'Server Room',  status:'in_use'    },
    { device_type:'Firewall', brand:'Fortinet',model:'FortiGate 60F',serial_number:'FGT1234X003', ip_address:'192.168.1.254',location:'Server Room',  status:'in_use'    },
    { device_type:'Access Point',brand:'Ubiquiti',model:'UniFi AP AC','serial_number':'UAP1234X004',ip_address:'192.168.1.50',location:'HQ Floor 2', status:'in_use'    },
  ], { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=network_sample.csv');
  res.send(csv);
});

// ── EXPORT CSV ────────────────────────────────────────────
router.get('/export/csv', requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT asset_tag, device_type, brand, model, serial_number, ip_address, mac_address,
             vlan, firmware_version, rack_location, location, status,
             warranty_expiry, purchase_date, vendor, notes
      FROM network_devices ORDER BY created_at DESC`);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=network_devices.csv');
    res.send(stringify(r.rows, { header: true }));
  } catch (err) { next(err); }
});

// ── IMPORT CSV ────────────────────────────────────────────
router.post('/import/csv', requireAuth, perm('network','create'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
    let inserted = 0, skipped = 0, errors = [];
    for (const raw of records) {
      const d = normalizeRow(raw);
      try {
        const tag = d.asset_tag || await genNetTag(d.purchase_date);
        await db.query(
          `INSERT INTO network_devices (asset_tag,device_type,brand,model,serial_number,ip_address,mac_address,vlan,firmware_version,rack_location,location,status,warranty_expiry,purchase_date,vendor,notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT DO NOTHING`,
          [tag, d.device_type||'Switch', d.brand||null, d.model||null, d.serial_number||null,
           d.ip_address||null, d.mac_address||null, d.vlan||null, d.firmware_version||null,
           d.rack_location||null, d.location||null, d.status||'in_use',
           d.warranty_expiry||null, d.purchase_date||null, d.vendor||null, d.notes||null]
        );
        inserted++;
      } catch (e) { skipped++; errors.push(e.message); }
    }
    await log(req.user.id, 'imported', null, 'CSV Import', `Imported ${inserted} network devices, skipped ${skipped}`);
    res.json({ inserted, skipped, errors });
  } catch (err) { next(err); }
});

// ── DELETE ALL ────────────────────────────────────────────
router.delete('/all', requireAuth, perm('network','delete'), async (req, res, next) => {
  try {
    const all = await db.query('SELECT * FROM network_devices');
    await Promise.all(all.rows.map(row =>
      saveToRecycleBin('network', 'network_devices', row, `${row.brand||''} ${row.model||''}`.trim(), req.user.id)
    ));
    const r = await db.query('DELETE FROM network_devices RETURNING id');
    await log(req.user.id, 'deleted_all', null, 'All Network Devices', `Deleted all ${r.rowCount} devices`);
    res.json({ deleted: r.rowCount });
  } catch (err) { next(err); }
});

// ── GET ONE ───────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const r = await db.query('SELECT * FROM network_devices WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ── CREATE ────────────────────────────────────────────────
router.post('/', requireAuth, perm('network','create'), async (req, res, next) => {
  try {
    const d = req.body;
    const tag = d.asset_tag || await genNetTag(d.purchase_date);
    const r = await db.query(`
      INSERT INTO network_devices (asset_tag,device_type,brand,model,serial_number,ip_address,mac_address,vlan,firmware_version,rack_location,location,status,warranty_expiry,purchase_date,vendor,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [tag, d.device_type, d.brand||null, d.model||null, d.serial_number||null, d.ip_address||null,
       d.mac_address||null, d.vlan||null, d.firmware_version||null, d.rack_location||null,
       d.location||null, d.status||'in_use', d.warranty_expiry||null, d.purchase_date||null,
       d.vendor||null, d.notes||null]
    );
    await log(req.user.id, 'created', r.rows[0].id, tag, `Created ${d.device_type}`);
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

// ── UPDATE ────────────────────────────────────────────────
router.put('/:id', requireAuth, perm('network','update'), async (req, res, next) => {
  try {
    const d = req.body;
    const r = await db.query(`
      UPDATE network_devices SET asset_tag=$1,device_type=$2,brand=$3,model=$4,serial_number=$5,ip_address=$6,
        mac_address=$7,vlan=$8,firmware_version=$9,rack_location=$10,location=$11,
        status=$12,warranty_expiry=$13,purchase_date=$14,vendor=$15,notes=$16
      WHERE id=$17 RETURNING *`,
      [d.asset_tag||null, d.device_type, d.brand||null, d.model||null, d.serial_number||null, d.ip_address||null,
       d.mac_address||null, d.vlan||null, d.firmware_version||null, d.rack_location||null,
       d.location||null, d.status||'in_use', d.warranty_expiry||null, d.purchase_date||null,
       d.vendor||null, d.notes||null, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await log(req.user.id, 'updated', r.rows[0].id, d.asset_tag || `${d.brand} ${d.model}`, 'Updated network device');
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ── DELETE ────────────────────────────────────────────────
router.delete('/:id', requireAuth, perm('network','delete'), async (req, res, next) => {
  try {
    const r = await db.query('DELETE FROM network_devices WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await saveToRecycleBin('network', 'network_devices', r.rows[0], `${r.rows[0].brand||''} ${r.rows[0].model||''}`.trim(), req.user.id);
    await log(req.user.id, 'deleted', r.rows[0].id, `${r.rows[0].brand} ${r.rows[0].model}`, 'Deleted');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
