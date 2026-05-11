const router = require('express').Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const db = require('../config/db');
const { requireAuth, canWrite, canDelete } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const REQUIRED = ['first_name', 'last_name', 'designation', 'department'];

async function log(userId, action, id, label, details) {
  await db.query(
    'INSERT INTO activity_log (user_id,action,table_name,record_id,record_label,details) VALUES ($1,$2,$3,$4,$5,$6)',
    [userId, action, 'employees', id, label, details]
  );
}

// ── LIST ─────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { q, location, employment_type, status } = req.query;
    let sql = 'SELECT * FROM employees WHERE 1=1';
    const params = []; let i = 1;
    if (q) {
      sql += ` AND (first_name ILIKE $${i} OR last_name ILIKE $${i} OR email ILIKE $${i} OR designation ILIKE $${i} OR department ILIKE $${i} OR mobile_number ILIKE $${i})`;
      params.push(`%${q}%`); i++;
    }
    if (location)        { sql += ` AND location=$${i++}`;        params.push(location); }
    if (employment_type) { sql += ` AND employment_type=$${i++}`; params.push(employment_type); }
    if (status === 'active')   sql += ' AND is_active=true';
    if (status === 'inactive') sql += ' AND is_active=false';
    sql += ' ORDER BY first_name, last_name';
    res.json((await db.query(sql, params)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SAMPLE CSV ────────────────────────────────────────────────
router.get('/sample/csv', requireAuth, (req, res) => {
  const csv = stringify([
    { first_name:'Ali', last_name:'Raza', email:'ali.raza@bykea.com', designation:'Software Engineer', department:'Engineering', mobile_number:'0321-1000001', location:'Karachi', employment_type:'Permanent' },
    { first_name:'Sara', last_name:'Khan', email:'sara.khan@bykea.com', designation:'HR Manager', department:'Human Resources', mobile_number:'0300-2000002', location:'Lahore', employment_type:'Contractual' },
    { first_name:'Usman', last_name:'Ahmed', email:'usman.ahmed@bykea.com', designation:'Network Engineer', department:'IT', mobile_number:'0333-3000003', location:'Islamabad', employment_type:'Permanent' },
  ], { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=employees_sample.csv');
  res.send(csv);
});

// ── EXPORT CSV ────────────────────────────────────────────────
router.get('/export/csv', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      'SELECT id,first_name,last_name,email,designation,department,mobile_number,location,employment_type,is_active FROM employees ORDER BY first_name,last_name'
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=employees.csv');
    res.send(stringify(r.rows, { header: true }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const VALID_LOCATIONS = ['Karachi','Lahore','Islamabad','Others'];
const VALID_EMP_TYPES = ['Permanent','Contractual'];

function normalizeRow(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw))
    out[k.trim().toLowerCase().replace(/[\s\-]+/g, '_')] = typeof v === 'string' ? v.trim() : v;
  return out;
}

function pickLocation(val) {
  if (!val) return null;
  return VALID_LOCATIONS.find(l => l.toLowerCase() === val.toLowerCase()) || null;
}

function pickEmpType(val) {
  if (!val) return null;
  return VALID_EMP_TYPES.find(t => t.toLowerCase() === val.toLowerCase()) || null;
}

// ── IMPORT CSV ────────────────────────────────────────────────
router.post('/import/csv', requireAuth, canWrite, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
    let inserted = 0, skipped = 0, errors = [];
    for (const raw of records) {
      const d = normalizeRow(raw);
      if (!d.first_name || !d.last_name || !d.designation || !d.department) {
        skipped++;
        errors.push(`Skipped row: first_name, last_name, designation, department are required (got: ${JSON.stringify(Object.keys(raw))})`);
        continue;
      }
      try {
        await db.query(
          `INSERT INTO employees (first_name,last_name,email,designation,department,mobile_number,location,employment_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [d.first_name, d.last_name, d.email||null, d.designation, d.department,
           d.mobile_number||null, pickLocation(d.location), pickEmpType(d.employment_type)]
        );
        inserted++;
      } catch (e) { skipped++; errors.push(`${d.first_name} ${d.last_name}: ${e.message}`); }
    }
    await log(req.user.id, 'imported', null, 'CSV Import', `Imported ${inserted} employees, skipped ${skipped}`);
    res.json({ inserted, skipped, errors });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── BULK UPDATE CSV ───────────────────────────────────────────
router.post('/update/csv', requireAuth, canWrite, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
    let updated = 0, skipped = 0, errors = [];
    for (const raw of records) {
      const d = normalizeRow(raw);
      // Find existing employee by id or email
      let emp = null;
      if (d.id && !isNaN(parseInt(d.id))) {
        const r = await db.query('SELECT * FROM employees WHERE id=$1', [parseInt(d.id)]);
        emp = r.rows[0];
      }
      if (!emp && d.email) {
        const r = await db.query('SELECT * FROM employees WHERE email=$1', [d.email]);
        emp = r.rows[0];
      }
      if (!emp) {
        skipped++;
        errors.push(`No match: ${d.first_name||''} ${d.last_name||''} — row needs id or email to identify employee`);
        continue;
      }
      const merged = {
        first_name:      d.first_name      || emp.first_name,
        last_name:       d.last_name       || emp.last_name,
        email:           'email'           in d ? (d.email || null) : emp.email,
        designation:     d.designation     || emp.designation,
        department:      d.department      || emp.department,
        mobile_number:   'mobile_number'   in d ? (d.mobile_number || null) : emp.mobile_number,
        location:        'location'        in d ? pickLocation(d.location)  : emp.location,
        employment_type: 'employment_type' in d ? pickEmpType(d.employment_type) : emp.employment_type,
        is_active:       'is_active'       in d ? (d.is_active === 'false' || d.is_active === '0' ? false : true) : emp.is_active,
      };
      try {
        await db.query(
          `UPDATE employees SET first_name=$1,last_name=$2,email=$3,designation=$4,department=$5,
           mobile_number=$6,location=$7,employment_type=$8,is_active=$9 WHERE id=$10`,
          [merged.first_name, merged.last_name, merged.email, merged.designation, merged.department,
           merged.mobile_number, merged.location, merged.employment_type, merged.is_active, emp.id]
        );
        updated++;
      } catch (e) { skipped++; errors.push(`${emp.first_name} ${emp.last_name} (id:${emp.id}): ${e.message}`); }
    }
    await log(req.user.id, 'bulk_updated', null, 'CSV Update', `Updated ${updated} employees, skipped ${skipped}`);
    res.json({ updated, skipped, errors });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET ONE ───────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM employees WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CREATE ────────────────────────────────────────────────────
router.post('/', requireAuth, canWrite, async (req, res) => {
  try {
    const d = req.body;
    for (const f of REQUIRED) if (!d[f]) return res.status(400).json({ error: `${f} is required` });
    const r = await db.query(
      `INSERT INTO employees (first_name,last_name,email,designation,department,mobile_number,location,employment_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [d.first_name, d.last_name, d.email||null, d.designation, d.department,
       d.mobile_number||null, d.location||null, d.employment_type||null]
    );
    await log(req.user.id, 'created', r.rows[0].id, `${d.first_name} ${d.last_name}`, `Dept: ${d.department}`);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── UPDATE ────────────────────────────────────────────────────
router.put('/:id', requireAuth, canWrite, async (req, res) => {
  try {
    const d = req.body;
    for (const f of REQUIRED) if (!d[f]) return res.status(400).json({ error: `${f} is required` });
    const r = await db.query(
      `UPDATE employees SET first_name=$1,last_name=$2,email=$3,designation=$4,department=$5,
       mobile_number=$6,location=$7,employment_type=$8,is_active=$9 WHERE id=$10 RETURNING *`,
      [d.first_name, d.last_name, d.email||null, d.designation, d.department,
       d.mobile_number||null, d.location||null, d.employment_type||null,
       d.is_active !== false, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await log(req.user.id, 'updated', r.rows[0].id, `${d.first_name} ${d.last_name}`, 'Updated employee');
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ALL (password-verified) ───────────────────────────
router.delete('/all', requireAuth, canDelete, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required' });
    const u = await db.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!u.rows[0] || !(await bcrypt.compare(password, u.rows[0].password_hash)))
      return res.status(403).json({ error: 'Incorrect password' });
    const r = await db.query('DELETE FROM employees RETURNING id');
    await log(req.user.id, 'deleted_all', null, 'All Employees', `Deleted all ${r.rowCount} employees`);
    res.json({ deleted: r.rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ONE ────────────────────────────────────────────────
router.delete('/:id', requireAuth, canDelete, async (req, res) => {
  try {
    const r = await db.query('DELETE FROM employees WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await log(req.user.id, 'deleted', r.rows[0].id, `${r.rows[0].first_name} ${r.rows[0].last_name}`, 'Deleted employee');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
