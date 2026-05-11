const router  = require('express').Router();
const { stringify } = require('csv-stringify/sync');
const db      = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// ── DASHBOARD STATS ───────────────────────────────────────
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const [sys, net, mob, sim, simPkg, gws, gwsLic, gwsTyp, usr, warExp, warSoon, act] = await Promise.all([
      db.query('SELECT status, COUNT(*) n FROM systems GROUP BY status'),
      db.query('SELECT device_type, COUNT(*) n FROM network_devices GROUP BY device_type'),
      db.query(`SELECT COUNT(*) total, COUNT(*) FILTER (WHERE assigned_user_id IS NULL) it_inventory, COUNT(*) FILTER (WHERE (imei IS NULL OR imei='') AND assigned_type='user') rogue FROM mobiles`),
      db.query('SELECT status, vendor, COUNT(*) n FROM sims GROUP BY status, vendor'),
      db.query("SELECT COALESCE(package_name,'Unassigned') AS package_name, COUNT(*) n FROM sims GROUP BY package_name ORDER BY n DESC"),
      db.query('SELECT status, COUNT(*) n FROM gws_accounts GROUP BY status'),
      db.query("SELECT COALESCE(license,'Not Assigned') AS license, COUNT(*) n FROM gws_accounts GROUP BY license"),
      db.query('SELECT account_type, COUNT(*) n FROM gws_accounts GROUP BY account_type'),
      db.query('SELECT role, COUNT(*) n FROM users GROUP BY role'),
      db.query("SELECT COUNT(*) n FROM systems WHERE warranty_expiry < NOW()"),
      db.query("SELECT COUNT(*) n FROM systems WHERE warranty_expiry BETWEEN NOW() AND NOW() + INTERVAL '90 days'"),
      db.query(`SELECT a.*, u.name AS user_name FROM activity_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 10`),
    ]);
    res.json({
      systems:         sys.rows,
      networkDevices:  net.rows,
      mobiles:         mob.rows[0],
      sims:            sim.rows,
      simPackages:     simPkg.rows,
      gws:             gws.rows,
      gwsLicense:      gwsLic.rows,
      gwsType:         gwsTyp.rows,
      users:           usr.rows,
      warrantyExpired: Number(warExp.rows[0].n),
      warrantySoon:    Number(warSoon.rows[0].n),
      recentActivity:  act.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── WARRANTY REPORT ───────────────────────────────────────
router.get('/warranty', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT s.*, (e.first_name || ' ' || e.last_name) AS assigned_user_name,
             (s.warranty_expiry::date - CURRENT_DATE) AS days_remaining
      FROM systems s LEFT JOIN employees e ON e.id=s.assigned_user_id
      WHERE s.warranty_expiry IS NOT NULL
      ORDER BY s.warranty_expiry ASC`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ASSIGNMENTS REPORT ────────────────────────────────────
router.get('/assignments', requireAuth, async (req, res) => {
  try {
    const [sys, mob, sim] = await Promise.all([
      db.query(`SELECT (e.first_name||' '||e.last_name) AS name,e.email,e.department, json_agg(json_build_object('type','System','label',s.serial_number,'status',s.status)) AS items FROM systems s JOIN employees e ON e.id=s.assigned_user_id GROUP BY e.id,e.first_name,e.last_name,e.email,e.department`),
      db.query(`SELECT (e.first_name||' '||e.last_name) AS name,e.email,e.department, json_agg(json_build_object('type','Mobile','label',m.asset_tag,'model',m.manufacturer||' '||m.model,'status',m.status)) AS items FROM mobiles m JOIN employees e ON e.id=m.assigned_user_id GROUP BY e.id,e.first_name,e.last_name,e.email,e.department`),
      db.query(`SELECT (e.first_name||' '||e.last_name) AS name,e.email,e.department, json_agg(json_build_object('type','SIM','label',s.phone_number,'vendor',s.vendor)) AS items FROM sims s JOIN employees e ON e.id=s.assigned_user_id GROUP BY e.id,e.first_name,e.last_name,e.email,e.department`),
    ]);
    res.json({ systems: sys.rows, mobiles: mob.rows, sims: sim.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── FULL SUMMARY EXPORT ───────────────────────────────────
router.get('/summary/csv', requireAuth, async (req, res) => {
  try {
    const [sys, net, mob, sim, gws] = await Promise.all([
      db.query('SELECT * FROM systems ORDER BY created_at DESC'),
      db.query('SELECT * FROM network_devices ORDER BY created_at DESC'),
      db.query('SELECT * FROM mobiles ORDER BY created_at DESC'),
      db.query('SELECT * FROM sims ORDER BY created_at DESC'),
      db.query('SELECT * FROM gws_accounts ORDER BY created_at DESC'),
    ]);
    // Return a multi-sheet style CSV with section markers
    const sections = [
      { title: '## SYSTEMS', rows: sys.rows },
      { title: '## NETWORK DEVICES', rows: net.rows },
      { title: '## MOBILE PHONES', rows: mob.rows },
      { title: '## SIM CARDS', rows: sim.rows },
      { title: '## GWS ACCOUNTS', rows: gws.rows },
    ];
    let output = '';
    for (const s of sections) {
      output += s.title + '\n';
      output += (s.rows.length > 0 ? stringify(s.rows, { header: true }) : 'No records\n');
      output += '\n';
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=itms_full_report.csv');
    res.send(output);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GWS REPORT ────────────────────────────────────────────
router.get('/gws', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT *, (storage_used / NULLIF(storage_limit,0) * 100)::int AS storage_pct
      FROM gws_accounts ORDER BY storage_used DESC`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SIM COST REPORT ───────────────────────────────────────
router.get('/sim-costs', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT vendor, COUNT(*) count, SUM(monthly_rate) total_monthly
      FROM sims WHERE status='active' GROUP BY vendor ORDER BY total_monthly DESC`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── BY BRAND / MANUFACTURER ───────────────────────────────
router.get('/by-brand', requireAuth, async (req, res) => {
  try {
    const [sys, mob, net] = await Promise.all([
      db.query(`SELECT manufacturer AS brand, COUNT(*) cnt FROM systems WHERE manufacturer IS NOT NULL GROUP BY manufacturer ORDER BY cnt DESC`),
      db.query(`SELECT manufacturer AS brand, COUNT(*) cnt FROM mobiles WHERE manufacturer IS NOT NULL GROUP BY manufacturer ORDER BY cnt DESC`),
      db.query(`SELECT brand, COUNT(*) cnt FROM network_devices WHERE brand IS NOT NULL GROUP BY brand ORDER BY cnt DESC`),
    ]);
    res.json({ systems: sys.rows, mobiles: mob.rows, network: net.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── BY ASSET TAG ──────────────────────────────────────────
router.get('/by-asset-tag', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    const pattern = q ? `%${q}%` : '%';
    const [sys, mob] = await Promise.all([
      db.query(
        `SELECT s.asset_tag, s.type, s.manufacturer, s.model, s.serial_number, s.status, s.condition,
                s.department, s.location, (e.first_name||' '||e.last_name) AS assigned_user_name
         FROM systems s LEFT JOIN employees e ON e.id=s.assigned_user_id
         WHERE s.asset_tag ILIKE $1 ORDER BY s.asset_tag`, [pattern]
      ),
      db.query(
        `SELECT m.asset_tag, m.manufacturer, m.model, m.serial_number, m.status, m.condition,
                m.department, (e.first_name||' '||e.last_name) AS assigned_user_name
         FROM mobiles m LEFT JOIN employees e ON e.id=m.assigned_user_id
         WHERE m.asset_tag ILIKE $1 ORDER BY m.asset_tag`, [pattern]
      ),
    ]);
    res.json({ systems: sys.rows, mobiles: mob.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ELOG (Activity / Access Log) ──────────────────────────
router.get('/elog', requireAuth, async (req, res) => {
  try {
    const { limit = 500, table_name, action } = req.query;
    let sql = `
      SELECT a.id, a.action, a.table_name, a.record_id, a.record_label,
             a.details, a.ip_address, a.created_at,
             u.name AS user_name, u.email AS user_email, u.role AS user_role
      FROM activity_log a LEFT JOIN users u ON u.id=a.user_id
      WHERE 1=1`;
    const params = [];
    let i = 1;
    if (table_name) { sql += ` AND a.table_name=$${i++}`; params.push(table_name); }
    if (action)     { sql += ` AND a.action ILIKE $${i++}`; params.push(`%${action}%`); }
    sql += ` ORDER BY a.created_at DESC LIMIT $${i++}`;
    params.push(Number(limit));
    const r = await db.query(sql, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
