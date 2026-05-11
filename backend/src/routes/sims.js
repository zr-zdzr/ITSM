const router = require('express').Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const db = require('../config/db');
const { requireAuth, perm } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function log(userId, action, id, label, details) {
  await db.query(
    'INSERT INTO activity_log (user_id,action,table_name,record_id,record_label,details) VALUES ($1,$2,$3,$4,$5,$6)',
    [userId, action, 'sims', id, label, details]
  );
}

function normalizeRow(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw))
    out[k.trim().toLowerCase().replace(/[\s\-]+/g, '_')] = typeof v === 'string' ? v.trim() : v;
  return out;
}

const VALID_VENDORS = ['Jazz','Telenor','Ufone','Zong','Other'];
function pickVendor(val) {
  if (!val) return 'Other';
  return VALID_VENDORS.find(v => v.toLowerCase() === val.toLowerCase()) || 'Other';
}

// ── LIST ──────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { q, vendor, status } = req.query;
    let sql = `SELECT s.*, (e.first_name || ' ' || e.last_name) AS assigned_user_name FROM sims s LEFT JOIN employees e ON e.id=s.assigned_user_id WHERE 1=1`;
    const params = []; let i = 1;
    if (q)      { sql += ` AND (s.phone_number ILIKE $${i} OR s.user_name ILIKE $${i} OR s.sim_holder ILIKE $${i} OR s.package_name ILIKE $${i} OR s.data_limit ILIKE $${i})`; params.push(`%${q}%`); i++; }
    if (vendor) { sql += ` AND s.vendor=$${i++}`; params.push(vendor); }
    if (status) { sql += ` AND s.status=$${i++}`; params.push(status); }
    sql += ' ORDER BY s.created_at DESC';
    res.json((await db.query(sql, params)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SAMPLE CSV ────────────────────────────────────────────
router.get('/sample/csv', requireAuth, (req, res) => {
  const csv = stringify([
    { phone_number:'0321-1000001', vendor:'Jazz',    user_name:'Ali Raza',   calling_package:'Jazz Business Voice', data_package:'50GB Monthly', sim_holder:'Ali Raza'  },
    { phone_number:'0300-2000002', vendor:'Telenor', user_name:'Sara Khan',  calling_package:'Telenor Corporate',  data_package:'30GB Monthly', sim_holder:'Sara Khan' },
    { phone_number:'0345-3000003', vendor:'Zong',    user_name:'IT Dept',    calling_package:'Zong Data SIM',      data_package:'',             sim_holder:'IT Dept'   },
  ], { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=sims_sample.csv');
  res.send(csv);
});

// ── EXPORT CSV ────────────────────────────────────────────
router.get('/export/csv', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT s.phone_number, s.vendor, s.user_name, s.package_name AS calling_package, s.data_limit AS data_package,
              s.sim_holder, s.monthly_rate, s.status, s.notes
       FROM sims s ORDER BY s.created_at DESC`
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=sims.csv');
    res.send(stringify(r.rows, { header: true }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── IMPORT CSV ────────────────────────────────────────────
router.post('/import/csv', requireAuth, perm('sims','create'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
    let inserted = 0, skipped = 0, errors = [];
    for (const raw of records) {
      const d = normalizeRow(raw);
      if (!d.phone_number) { skipped++; errors.push('Skipped: phone_number required'); continue; }
      try {
        await db.query(
          `INSERT INTO sims (phone_number,vendor,user_name,package_name,data_limit,sim_holder,monthly_rate,status,notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
          [d.phone_number, pickVendor(d.vendor),
           d.user_name||null,
           d.calling_package||d.package_name||null,
           d.data_package||d.data_limit||null,
           d.sim_holder||null,
           d.monthly_rate||null,
           (d.status||'active').toLowerCase() === 'suspended' ? 'suspended' :
           (d.status||'active').toLowerCase() === 'inactive'  ? 'inactive'  : 'active',
           d.notes||null]
        );
        inserted++;
      } catch (e) { skipped++; errors.push(`${d.phone_number}: ${e.message}`); }
    }
    await log(req.user.id, 'imported', null, 'CSV Import', `Imported ${inserted} SIMs, skipped ${skipped}`);
    res.json({ inserted, skipped, errors });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ALL (password-verified) ───────────────────────
router.delete('/all', requireAuth, perm('sims','delete'), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required' });
    const u = await db.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!u.rows[0] || !(await bcrypt.compare(password, u.rows[0].password_hash)))
      return res.status(403).json({ error: 'Incorrect password' });
    const r = await db.query('DELETE FROM sims RETURNING id');
    await log(req.user.id, 'deleted_all', null, 'All SIMs', `Deleted all ${r.rowCount} SIM cards`);
    res.json({ deleted: r.rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET ONE ───────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT s.*, (e.first_name || ' ' || e.last_name) AS assigned_user_name FROM sims s LEFT JOIN employees e ON e.id=s.assigned_user_id WHERE s.id=$1`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CREATE ────────────────────────────────────────────────
router.post('/', requireAuth, perm('sims','create'), async (req, res) => {
  try {
    const d = req.body;
    if (!d.phone_number || !d.vendor || !d.user_name || !d.package_name || !d.sim_holder)
      return res.status(400).json({ error: 'phone_number, vendor, user_name, calling_package and sim_holder are required' });
    const r = await db.query(
      `INSERT INTO sims (phone_number,vendor,user_name,package_name,data_limit,sim_holder,monthly_rate,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [d.phone_number, d.vendor, d.user_name, d.package_name,
       d.data_limit||null, d.sim_holder, d.monthly_rate||null, d.status||'active', d.notes||null]
    );
    await log(req.user.id, 'created', r.rows[0].id, d.phone_number, `Added ${d.vendor} SIM`);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── UPDATE ────────────────────────────────────────────────
router.put('/:id', requireAuth, perm('sims','update'), async (req, res) => {
  try {
    const d = req.body;
    if (!d.phone_number || !d.vendor || !d.user_name || !d.package_name || !d.sim_holder)
      return res.status(400).json({ error: 'phone_number, vendor, user_name, calling_package and sim_holder are required' });
    const r = await db.query(
      `UPDATE sims SET phone_number=$1,vendor=$2,user_name=$3,package_name=$4,data_limit=$5,
         sim_holder=$6,monthly_rate=$7,status=$8,notes=$9
       WHERE id=$10 RETURNING *`,
      [d.phone_number, d.vendor, d.user_name, d.package_name,
       d.data_limit||null, d.sim_holder, d.monthly_rate||null, d.status||'active', d.notes||null,
       req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await log(req.user.id, 'updated', r.rows[0].id, d.phone_number, 'Updated SIM');
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ────────────────────────────────────────────────
router.delete('/:id', requireAuth, perm('sims','delete'), async (req, res) => {
  try {
    const r = await db.query('DELETE FROM sims WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await log(req.user.id, 'deleted', r.rows[0].id, r.rows[0].phone_number, 'Deleted SIM');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
