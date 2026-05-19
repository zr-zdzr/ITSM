const router = require('express').Router();
const multer = require('multer');
const { saveToRecycleBin } = require('../utils/recycle');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const db = require('../config/db');
const { requireAuth, canWrite, canDelete } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const REQUIRED = ['first_name', 'designation', 'department', 'location'];
const REQUIRED_LABELS = {
  first_name:  'Employee Name (First Name)',
  designation: 'Designation',
  department:  'Department',
  location:    'Location',
};

const VALID_LOCATIONS    = ['Karachi','Lahore','Islamabad','Multan','Peshawar','Other'];
const VALID_EMP_TYPES    = ['Permanent','Contractual'];

async function log(userId, action, id, label, details) {
  await db.query(
    'INSERT INTO activity_log (user_id,action,table_name,record_id,record_label,details) VALUES ($1,$2,$3,$4,$5,$6)',
    [userId, action, 'employees', id, label, details]
  );
}

function normalizeRow(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw))
    out[k.trim().toLowerCase().replace(/[\s\-\/]+/g, '_')] = typeof v === 'string' ? v.trim() : v;
  return out;
}

function pickLocation(val) {
  if (!val) return null;
  return VALID_LOCATIONS.find(l => l.toLowerCase() === val.toLowerCase()) || val;
}

function pickEmpType(val) {
  if (!val) return null;
  const v = val.toLowerCase();
  if (v.includes('permanent') || v.includes('full')) return 'Permanent';
  if (v.includes('contract')) return 'Contractual';
  return VALID_EMP_TYPES.find(t => t.toLowerCase() === v) || null;
}

// ── LIST ─────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { q, location, employment_type, status } = req.query;
    let sql = 'SELECT * FROM employees WHERE 1=1';
    const params = []; let i = 1;
    if (q) {
      sql += ` AND (first_name ILIKE $${i} OR last_name ILIKE $${i} OR email ILIKE $${i} OR designation ILIKE $${i} OR department ILIKE $${i} OR business_unit ILIKE $${i} OR mobile_number ILIKE $${i})`;
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
// Mandatory: employee_name, designation, department, location
// Optional:  business_unit, employment_type, joining_date, email, mobile_number
router.get('/sample/csv', requireAuth, (req, res) => {
  const rows = [
    { employee_name: 'Ali Raza',      business_unit: 'Technology', department: 'Engineering',     designation: 'Software Engineer',          location: 'Karachi',   employment_type: 'Permanent',   joining_date: '2022-03-15', email: 'ali.raza@bykea.com',      mobile_number: '0321-1000001' },
    { employee_name: 'Sara Khan',     business_unit: 'Corporate',  department: 'Human Resources', designation: 'HR Manager',                 location: 'Lahore',    employment_type: 'Contractual', joining_date: '2023-07-01', email: 'sara.khan@bykea.com',     mobile_number: '0300-2000002' },
    { employee_name: 'Usman Ahmed',   business_unit: 'Technology', department: 'IT',              designation: 'Network Engineer',           location: 'Islamabad', employment_type: 'Permanent',   joining_date: '2021-11-10', email: 'usman.ahmed@bykea.com',   mobile_number: '0333-3000003' },
    { employee_name: 'Fatima Sheikh', business_unit: 'Corporate',  department: 'Finance',         designation: 'Finance Analyst',            location: 'Karachi',   employment_type: 'Permanent',   joining_date: '2020-05-20', email: 'fatima.sheikh@bykea.com', mobile_number: '0312-4000004' },
    { employee_name: 'Hassan',        business_unit: '',            department: 'Operations',      designation: 'Rider Operations Executive', location: 'Multan',    employment_type: 'Contractual', joining_date: '',           email: '',                        mobile_number: '0345-5000005' },
  ];
  const columns = ['employee_name','business_unit','department','designation','location','employment_type','joining_date','email','mobile_number'];
  const csv = stringify(rows, { header: true, columns });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=employees_sample.csv');
  res.send(csv);
});

// ── EXPORT CSV ────────────────────────────────────────────────
router.get('/export/csv', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT first_name, last_name, email, designation, department, business_unit,
              mobile_number, location, employment_type, joining_date, is_active
       FROM employees ORDER BY first_name, last_name`
    );
    const columns = ['employee_name','business_unit','department','designation','location','employment_type','joining_date','email','mobile_number','status'];
    const rows = r.rows.map(e => ({
      employee_name:   `${e.first_name || ''} ${e.last_name || ''}`.trim(),
      business_unit:   e.business_unit   || '',
      department:      e.department      || '',
      designation:     e.designation     || '',
      location:        e.location        || '',
      employment_type: e.employment_type || '',
      joining_date:    e.joining_date    ? new Date(e.joining_date).toISOString().split('T')[0] : '',
      email:           e.email           || '',
      mobile_number:   e.mobile_number   || '',
      status:          e.is_active       ? 'Active' : 'Inactive',
    }));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=employees-export.csv');
    res.send(stringify(rows, { header: true, columns }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── IMPORT CSV ────────────────────────────────────────────────
router.post('/import/csv', requireAuth, canWrite, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
    let inserted = 0, updated = 0, skipped = 0, errors = [];

    for (let rowIdx = 0; rowIdx < records.length; rowIdx++) {
      const raw = records[rowIdx];
      const d = normalizeRow(raw);
      // Support both employee_name (CSV format) and first_name/last_name (legacy)
      if (d.employee_name && !d.first_name) {
        const parts = d.employee_name.trim().split(/\s+/);
        d.first_name = parts[0] || '';
        d.last_name  = parts.slice(1).join(' ') || '';
      }
      const firstName = d.first_name || null;
      const lastName  = d.last_name  || null;
      const rowLabel  = firstName ? `${firstName} ${lastName || ''}`.trim() : `Row ${rowIdx + 2}`;

      const missing = [];
      if (!firstName)      missing.push('employee_name');
      if (!d.designation)  missing.push('designation');
      if (!d.department)   missing.push('department');
      if (!d.location)     missing.push('location');

      if (missing.length > 0) {
        skipped++;
        errors.push(`Row ${rowIdx + 2} (${rowLabel}): missing required field${missing.length > 1 ? 's' : ''} — ${missing.join(', ')}`);
        continue;
      }

      try {
        let existing = null;
        if (d.email) {
          const r = await db.query('SELECT id FROM employees WHERE email=$1', [d.email]);
          existing = r.rows[0];
        }
        if (!existing && firstName && lastName) {
          const r = await db.query(
            'SELECT id FROM employees WHERE LOWER(first_name)=LOWER($1) AND LOWER(last_name)=LOWER($2)',
            [firstName, lastName]
          );
          existing = r.rows[0];
        }

        const loc     = pickLocation(d.location);
        const empType = pickEmpType(d.employment_type);
        const joining = d.joining_date || null;
        const bunit   = d.business_unit || null;

        if (existing) {
          await db.query(`
            UPDATE employees SET
              first_name      = COALESCE($1,  first_name),
              last_name       = COALESCE($2,  last_name),
              email           = COALESCE($3,  email),
              designation     = COALESCE($4,  designation),
              department      = COALESCE($5,  department),
              business_unit   = COALESCE($6,  business_unit),
              mobile_number   = COALESCE($7,  mobile_number),
              location        = COALESCE($8,  location),
              employment_type = COALESCE($9,  employment_type),
              joining_date    = COALESCE($10, joining_date)
            WHERE id=$11`,
            [firstName, lastName||null, d.email||null, d.designation, d.department,
             bunit, d.mobile_number||null, loc, empType, joining, existing.id]
          );
          updated++;
        } else {
          await db.query(
            `INSERT INTO employees
               (first_name, last_name, email, designation, department, business_unit,
                mobile_number, location, employment_type, joining_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [firstName, lastName||'', d.email||null, d.designation, d.department,
             bunit, d.mobile_number||null, loc, empType, joining]
          );
          inserted++;
        }
      } catch (e) { skipped++; errors.push(`Row ${rowIdx + 2} (${rowLabel}): ${e.message}`); }
    }

    await log(req.user.id, 'imported', null, 'CSV Import', `Imported ${inserted} employees, updated ${updated}, skipped ${skipped}`);
    res.json({ inserted, updated, skipped, errors });
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
    for (const f of REQUIRED) if (!d[f]) return res.status(400).json({ error: `${REQUIRED_LABELS[f] || f} is required` });
    const r = await db.query(
      `INSERT INTO employees
         (first_name, last_name, email, designation, department, business_unit,
          mobile_number, location, employment_type, joining_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [d.first_name, d.last_name||'', d.email||null, d.designation, d.department,
       d.business_unit||null, d.mobile_number||null, d.location||null,
       d.employment_type||null, d.joining_date||null]
    );
    await log(req.user.id, 'created', r.rows[0].id, `${d.first_name} ${d.last_name||''}`, `Dept: ${d.department}`);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── UPDATE ────────────────────────────────────────────────────
router.put('/:id', requireAuth, canWrite, async (req, res) => {
  try {
    const d = req.body;
    for (const f of REQUIRED) if (!d[f]) return res.status(400).json({ error: `${REQUIRED_LABELS[f] || f} is required` });
    const r = await db.query(
      `UPDATE employees SET
         first_name=$1, last_name=$2, email=$3, designation=$4, department=$5,
         business_unit=$6, mobile_number=$7, location=$8, employment_type=$9,
         joining_date=$10, is_active=$11
       WHERE id=$12 RETURNING *`,
      [d.first_name, d.last_name||'', d.email||null, d.designation, d.department,
       d.business_unit||null, d.mobile_number||null, d.location||null,
       d.employment_type||null, d.joining_date||null,
       d.is_active !== false, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await log(req.user.id, 'updated', r.rows[0].id, `${d.first_name} ${d.last_name||''}`, 'Updated employee');
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ALL ────────────────────────────────────────────────
router.delete('/all', requireAuth, canDelete, async (req, res) => {
  try {
    const all = await db.query('SELECT * FROM employees');
    await Promise.all(all.rows.map(row =>
      saveToRecycleBin('employees', 'employees', row, `${row.first_name} ${row.last_name||''}`, req.user.id)
    ));
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
    await saveToRecycleBin('employees', 'employees', r.rows[0], `${r.rows[0].first_name} ${r.rows[0].last_name||''}`, req.user.id);
    await log(req.user.id, 'deleted', r.rows[0].id, `${r.rows[0].first_name} ${r.rows[0].last_name||''}`, 'Deleted employee');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
