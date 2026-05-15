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
    [userId, action, 'gws', id, label, details]
  );
}

function normalizeRow(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw))
    out[k.trim().toLowerCase().replace(/[\s\-]+/g, '_')] = typeof v === 'string' ? v.trim() : v;
  return out;
}

const VALID_LICENSES = ['Starter','Standard','Vault'];
function pickLicense(val) {
  if (!val) return null;
  return VALID_LICENSES.find(l => l.toLowerCase() === val.toLowerCase()) || null;
}

const VALID_ACCT_TYPES = ['user','service_account'];
function pickAcctType(val) {
  if (!val) return 'user';
  const v = val.toLowerCase().replace(/[\s\-]+/g, '_');
  return VALID_ACCT_TYPES.includes(v) ? v : 'user';
}

const VALID_ROLES = ['Super Admin','Admin','User'];
function pickRole(val) {
  if (!val) return 'User';
  return VALID_ROLES.find(r => r.toLowerCase() === val.toLowerCase()) || 'User';
}

function pickStatus(val) {
  if (!val) return 'active';
  const v = val.toLowerCase();
  return v === 'suspended' ? 'suspended' : 'active';
}

// ── LIST ──────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { q, account_type, status } = req.query;
    let sql = 'SELECT * FROM gws_accounts WHERE 1=1';
    const params = []; let i = 1;
    if (q)            { sql += ` AND (email ILIKE $${i} OR display_name ILIKE $${i} OR department ILIKE $${i} OR designation ILIKE $${i} OR org_unit ILIKE $${i})`; params.push(`%${q}%`); i++; }
    if (account_type) { sql += ` AND account_type=$${i++}`; params.push(account_type); }
    if (status)       { sql += ` AND status=$${i++}`;       params.push(status); }
    sql += ' ORDER BY created_at DESC';
    res.json((await db.query(sql, params)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SAMPLE CSV ────────────────────────────────────────────
router.get('/sample/csv', requireAuth, (req, res) => {
  const csv = stringify([
    { first_name:'Ali',   last_name:'Raza',     email:'ali.raza@bykea.com',    designation:'Software Engineer', department:'Engineering',     org_unit:'/Engineering',     account_type:'user',            license:'Standard', status:'active'    },
    { first_name:'Sara',  last_name:'Khan',     email:'sara.khan@bykea.com',   designation:'HR Manager',        department:'Human Resources', org_unit:'/HR',              account_type:'user',            license:'Starter',  status:'active'    },
    { first_name:'CI',    last_name:'Pipeline', email:'svc-ci@bykea.com',      designation:'',                  department:'IT',              org_unit:'/ServiceAccounts', account_type:'service_account', license:'Vault',    status:'active'    },
    { first_name:'Usman', last_name:'Ahmed',    email:'usman.ahmed@bykea.com', designation:'Network Engineer',  department:'IT',              org_unit:'/IT',              account_type:'user',            license:'Standard', status:'suspended' },
  ], { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=cloud_ids_sample.csv');
  res.send(csv);
});

// ── EXPORT CSV ────────────────────────────────────────────
router.get('/export/csv', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      'SELECT email,display_name,designation,department,org_unit,account_type,gws_role,license,status,two_fa,notes FROM gws_accounts ORDER BY created_at DESC'
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=cloud_ids.csv');
    res.send(stringify(r.rows, { header: true }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── IMPORT CSV ────────────────────────────────────────────
router.post('/import/csv', requireAuth, perm('gws','create'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
    let inserted = 0, updated = 0, skipped = 0, errors = [];
    for (const raw of records) {
      const d = normalizeRow(raw);
      if (!d.email) { skipped++; errors.push('Skipped: email is required'); continue; }
      const displayName = (d.first_name || d.last_name)
        ? `${d.first_name||''} ${d.last_name||''}`.trim()
        : (d.display_name || d.name || null);
      try {
        const existing = await db.query('SELECT id FROM gws_accounts WHERE email=$1', [d.email]);
        const desig  = d.designation||null;
        const dept   = d.department||null;
        const ou     = d.org_unit||null;
        const atype  = pickAcctType(d.account_type);
        const role   = pickRole(d.gws_role);
        const lic    = pickLicense(d.license);
        const status = pickStatus(d.status);
        const twofa  = d.two_fa==='true'||d.two_fa===true||d.two_fa==='yes'||d.two_fa==='1';
        const notes  = d.notes||null;

        if (existing.rows[0]) {
          await db.query(`
            UPDATE gws_accounts SET
              display_name = COALESCE($1, display_name),
              designation  = COALESCE($2, designation),
              department   = COALESCE($3, department),
              org_unit     = COALESCE($4, org_unit),
              account_type = COALESCE($5, account_type),
              gws_role     = COALESCE($6, gws_role),
              license      = COALESCE($7, license),
              status       = COALESCE($8, status),
              two_fa       = $9,
              notes        = COALESCE($10, notes)
            WHERE id=$11`,
            [displayName, desig, dept, ou, atype||null, role||null, lic,
             status||null, twofa, notes, existing.rows[0].id]
          );
          updated++;
        } else {
          await db.query(
            `INSERT INTO gws_accounts (email,display_name,designation,department,org_unit,account_type,gws_role,license,status,two_fa,notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [d.email, displayName || d.email.split('@')[0], desig, dept, ou,
             atype, role, lic, status, twofa, notes]
          );
          inserted++;
        }
      } catch (e) { skipped++; errors.push(`${d.email}: ${e.message}`); }
    }
    await log(req.user.id, 'imported', null, 'CSV Import', `Imported ${inserted} Cloud IDs, updated ${updated}, skipped ${skipped}`);
    res.json({ inserted, updated, skipped, errors });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ALL ────────────────────────────────────────────
router.delete('/all', requireAuth, perm('gws','delete'), async (req, res) => {
  try {
    const all = await db.query('SELECT * FROM gws_accounts');
    await Promise.all(all.rows.map(row =>
      saveToRecycleBin('gws', 'gws_accounts', row, row.email, req.user.id)
    ));
    const r = await db.query('DELETE FROM gws_accounts RETURNING id');
    await log(req.user.id, 'deleted_all', null, 'All Cloud IDs', `Deleted all ${r.rowCount} Cloud IDs`);
    res.json({ deleted: r.rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET ONE ───────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM gws_accounts WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CREATE ────────────────────────────────────────────────
router.post('/', requireAuth, perm('gws','create'), async (req, res) => {
  try {
    const d = req.body;
    if (!d.email || !d.display_name) return res.status(400).json({ error: 'email and display_name required' });
    const r = await db.query(
      `INSERT INTO gws_accounts (email,display_name,designation,department,org_unit,account_type,gws_role,license,status,two_fa,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [d.email, d.display_name, d.designation||null, d.department||null, d.org_unit||null,
       d.account_type||'user', d.gws_role||'User',
       d.license||null, d.status||'active', d.two_fa||false, d.notes||null]
    );
    await log(req.user.id, 'created', r.rows[0].id, d.email, 'Added Cloud ID');
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE ────────────────────────────────────────────────
router.put('/:id', requireAuth, perm('gws','update'), async (req, res) => {
  try {
    const d = req.body;
    const r = await db.query(
      `UPDATE gws_accounts SET email=$1,display_name=$2,designation=$3,department=$4,org_unit=$5,
         account_type=$6,gws_role=$7,license=$8,status=$9,two_fa=$10,notes=$11
       WHERE id=$12 RETURNING *`,
      [d.email, d.display_name, d.designation||null, d.department||null, d.org_unit||null,
       d.account_type||'user', d.gws_role||'User',
       d.license||null, d.status||'active', d.two_fa||false, d.notes||null,
       req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await log(req.user.id, 'updated', r.rows[0].id, d.email, 'Updated Cloud ID');
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ────────────────────────────────────────────────
router.delete('/:id', requireAuth, perm('gws','delete'), async (req, res) => {
  try {
    const r = await db.query('DELETE FROM gws_accounts WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await saveToRecycleBin('gws', 'gws_accounts', r.rows[0], r.rows[0].email, req.user.id);
    await log(req.user.id, 'deleted', r.rows[0].id, r.rows[0].email, 'Deleted Cloud ID');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
