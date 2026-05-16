const router  = require('express').Router();
const { stringify } = require('csv-stringify/sync');
const db      = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// ── DASHBOARD STATS ───────────────────────────────────────
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const [
      net, gws, gwsLic, gwsTyp, usr, warExp, warSoon, act24h,
      sysAssignment, sysLocation, sysGeneration, sysType,
      mobAssignment, mobLocation, mobOS, mobPurpose,
      simAssignment, simLocation, simPackage, simVendor,
      empTotal, empByLocation, empByDept,
    ] = await Promise.all([
      db.query('SELECT device_type, COUNT(*) n FROM network_devices GROUP BY device_type'),
      db.query('SELECT status, COUNT(*) n FROM gws_accounts GROUP BY status'),
      db.query("SELECT COALESCE(license,'Not Assigned') AS license, COUNT(*) n FROM gws_accounts GROUP BY license"),
      db.query('SELECT account_type, COUNT(*) n FROM gws_accounts GROUP BY account_type'),
      db.query('SELECT role, COUNT(*) n FROM users GROUP BY role'),
      db.query("SELECT COUNT(*) n FROM systems WHERE warranty_expiry < NOW() UNION ALL SELECT COUNT(*) n FROM mobiles WHERE warranty_expiry < NOW() UNION ALL SELECT COUNT(*) n FROM network_devices WHERE warranty_expiry < NOW()"),
      db.query("SELECT COUNT(*) n FROM systems WHERE warranty_expiry BETWEEN NOW() AND NOW() + INTERVAL '90 days' UNION ALL SELECT COUNT(*) n FROM mobiles WHERE warranty_expiry BETWEEN NOW() AND NOW() + INTERVAL '90 days' UNION ALL SELECT COUNT(*) n FROM network_devices WHERE warranty_expiry BETWEEN NOW() AND NOW() + INTERVAL '90 days'"),
      db.query(`SELECT a.id, a.action, a.table_name, a.record_label, a.details, a.ip_address, a.created_at, u.name AS user_name, u.email AS user_email FROM activity_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.created_at >= NOW() - INTERVAL '24 hours' ORDER BY a.created_at DESC LIMIT 100`),
      // Systems
      db.query(`SELECT
        COUNT(*) FILTER (WHERE assigned_type='user') AS assigned_users,
        COUNT(*) FILTER (WHERE assigned_type='inventory') AS in_inventory,
        COUNT(*) FILTER (WHERE condition='Damaged') AS damaged,
        COUNT(*) AS total
        FROM systems`),
      db.query(`SELECT COALESCE(location,'Unknown') AS location, COUNT(*) n FROM systems GROUP BY location ORDER BY n DESC`),
      db.query(`SELECT COALESCE(generation,'Unknown') AS generation, COUNT(*) n FROM systems GROUP BY generation ORDER BY n DESC`),
      db.query(`SELECT type, COUNT(*) n FROM systems GROUP BY type ORDER BY n DESC`),
      // Mobiles
      db.query(`SELECT
        COUNT(*) FILTER (WHERE assigned_type='user') AS assigned_users,
        COUNT(*) FILTER (WHERE assigned_type='inventory') AS in_inventory,
        COUNT(*) FILTER (WHERE condition='Damaged') AS damaged,
        COUNT(*) AS total
        FROM mobiles`),
      db.query(`SELECT COALESCE(e.location,'Unknown') AS location, COUNT(*) n
        FROM mobiles m LEFT JOIN employees e ON e.id=m.assigned_user_id
        GROUP BY e.location ORDER BY n DESC`),
      db.query(`SELECT COALESCE(os,'Unknown') AS os, COUNT(*) n FROM mobiles GROUP BY os ORDER BY n DESC`),
      db.query(`SELECT COALESCE(purpose,'Unknown') AS purpose, COUNT(*) n FROM mobiles GROUP BY purpose ORDER BY n DESC`),
      // SIMs
      db.query(`SELECT
        COUNT(*) FILTER (WHERE assigned_type='user') AS for_users,
        COUNT(*) FILTER (WHERE assigned_type='service') AS for_services,
        COUNT(*) FILTER (WHERE assigned_type='inventory') AS in_inventory,
        COUNT(*) AS total
        FROM sims`),
      db.query(`SELECT COALESCE(e.location,'Unknown') AS location, COUNT(*) n
        FROM sims s LEFT JOIN employees e ON e.id=s.assigned_user_id
        GROUP BY e.location ORDER BY n DESC`),
      db.query(`SELECT COALESCE(package_name,'Unassigned') AS package_name, COUNT(*) n FROM sims GROUP BY package_name ORDER BY n DESC`),
      db.query(`SELECT vendor, COUNT(*) n FROM sims GROUP BY vendor ORDER BY n DESC`),
      // Employees
      db.query(`SELECT COUNT(*) total, COUNT(*) FILTER (WHERE is_active=true) active FROM employees`),
      db.query(`SELECT COALESCE(location,'Unknown') AS location, COUNT(*) n FROM employees WHERE is_active=true GROUP BY location ORDER BY n DESC`),
      db.query(`SELECT COALESCE(department,'Unknown') AS department, COUNT(*) n FROM employees WHERE is_active=true GROUP BY department ORDER BY n DESC`),
    ]);
    res.json({
      networkDevices:  net.rows,
      gws:             gws.rows,
      gwsLicense:      gwsLic.rows,
      gwsType:         gwsTyp.rows,
      users:           usr.rows,
      warrantyExpired: warExp.rows.reduce((s, r) => s + Number(r.n), 0),
      warrantySoon:    warSoon.rows.reduce((s, r) => s + Number(r.n), 0),
      activity24h:     act24h.rows,
      systems: {
        assignment: sysAssignment.rows[0],
        byLocation: sysLocation.rows,
        byGeneration: sysGeneration.rows,
        byType: sysType.rows,
      },
      mobiles: {
        assignment: mobAssignment.rows[0],
        byLocation: mobLocation.rows,
        byOS: mobOS.rows,
        byPurpose: mobPurpose.rows,
      },
      sims: {
        assignment: simAssignment.rows[0],
        byLocation: simLocation.rows,
        byPackage: simPackage.rows,
        byVendor: simVendor.rows,
      },
      employees: {
        total: Number(empTotal.rows[0]?.total || 0),
        active: Number(empTotal.rows[0]?.active || 0),
        byLocation: empByLocation.rows,
        byDepartment: empByDept.rows,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── EMPLOYEE ASSETS REPORT ───────────────────────────────
router.get('/employee-assets', requireAuth, async (req, res) => {
  try {
    const { department, location } = req.query;
    const params = [];
    let i = 1;
    let where = 'WHERE e.is_active = true';
    if (department) { where += ` AND e.department = $${i++}`; params.push(department); }
    if (location)   { where += ` AND e.location   = $${i++}`; params.push(location); }

    const r = await db.query(`
      SELECT
        e.id, e.first_name, e.last_name, e.email,
        e.department, e.designation, e.location, e.employment_type,
        COALESCE((
          SELECT json_agg(json_build_object(
            'asset_tag',s.asset_tag,'type',s.type,'manufacturer',s.manufacturer,
            'model',s.model,'serial_number',s.serial_number,'generation',s.generation,
            'status',s.status,'condition',s.condition,'location',s.location
          ) ORDER BY s.asset_tag)
          FROM systems s WHERE s.assigned_user_id=e.id AND s.assigned_type='user'
        ), '[]'::json) AS systems,
        COALESCE((
          SELECT json_agg(json_build_object(
            'asset_tag',m.asset_tag,'manufacturer',m.manufacturer,'model',m.model,
            'os',m.os,'storage_capacity',m.storage_capacity,
            'status',m.status,'condition',m.condition
          ) ORDER BY m.asset_tag)
          FROM mobiles m WHERE m.assigned_user_id=e.id AND m.assigned_type='user'
        ), '[]'::json) AS mobiles,
        COALESCE((
          SELECT json_agg(json_build_object(
            'phone_number',s.phone_number,'vendor',s.vendor,
            'package_name',s.package_name,'service_type',s.service_type,'status',s.status
          ) ORDER BY s.phone_number)
          FROM sims s WHERE s.assigned_user_id=e.id AND s.assigned_type='user'
        ), '[]'::json) AS sims
      FROM employees e
      ${where}
      ORDER BY e.first_name, e.last_name`, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── EMPLOYEE ASSETS CSV ────────────────────────────────────
router.get('/employee-assets/csv', requireAuth, async (req, res) => {
  try {
    const { department, location } = req.query;
    const params = [];
    let i = 1;
    let where = 'WHERE e.is_active = true';
    if (department) { where += ` AND e.department = $${i++}`; params.push(department); }
    if (location)   { where += ` AND e.location   = $${i++}`; params.push(location); }

    const r = await db.query(`
      SELECT
        (e.first_name||' '||e.last_name) AS employee,
        e.email, e.designation, e.department, e.location, e.employment_type,
        s.type AS asset_type, s.asset_tag, s.manufacturer, s.model,
        s.serial_number, s.generation, s.status, s.condition, s.location AS asset_location
      FROM employees e
      JOIN systems s ON s.assigned_user_id=e.id AND s.assigned_type='user'
      ${where}
      UNION ALL
      SELECT
        (e.first_name||' '||e.last_name),
        e.email, e.designation, e.department, e.location, e.employment_type,
        'Mobile' AS asset_type, m.asset_tag, m.manufacturer, m.model,
        m.serial_number, NULL, m.status, m.condition, NULL
      FROM employees e
      JOIN mobiles m ON m.assigned_user_id=e.id AND m.assigned_type='user'
      ${where.replace(/e\.(department|location)/g, 'e.$1')}
      UNION ALL
      SELECT
        (e.first_name||' '||e.last_name),
        e.email, e.designation, e.department, e.location, e.employment_type,
        'SIM Card' AS asset_type, NULL, si.vendor, si.package_name,
        si.phone_number, NULL, si.status, NULL, NULL
      FROM employees e
      JOIN sims si ON si.assigned_user_id=e.id AND si.assigned_type='user'
      ${where.replace(/e\.(department|location)/g, 'e.$1')}
      ORDER BY employee, asset_type, asset_tag`, params);

    const csv = stringify(r.rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=employee-assets.csv');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── WARRANTY CSV ───────────────────────────────────────────
router.get('/warranty/csv', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT 'System' AS category, s.asset_tag, s.type, s.manufacturer, s.model,
             s.serial_number, s.status, s.warranty_expiry,
             (s.warranty_expiry::date - CURRENT_DATE) AS days_remaining,
             (e.first_name||' '||e.last_name) AS assigned_to
      FROM systems s LEFT JOIN employees e ON e.id=s.assigned_user_id
      WHERE s.warranty_expiry IS NOT NULL
      UNION ALL
      SELECT 'Mobile', m.asset_tag, 'Mobile', m.manufacturer, m.model,
             m.serial_number, m.status, m.warranty_expiry,
             (m.warranty_expiry::date - CURRENT_DATE),
             (e.first_name||' '||e.last_name)
      FROM mobiles m LEFT JOIN employees e ON e.id=m.assigned_user_id
      WHERE m.warranty_expiry IS NOT NULL
      UNION ALL
      SELECT 'Network', nd.serial_number, nd.device_type, nd.brand, nd.model,
             nd.serial_number, nd.status, nd.warranty_expiry,
             (nd.warranty_expiry::date - CURRENT_DATE), NULL
      FROM network_devices nd WHERE nd.warranty_expiry IS NOT NULL
      ORDER BY warranty_expiry ASC`);
    const csv = stringify(r.rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=warranty-report.csv');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SIM COSTS CSV ─────────────────────────────────────────
router.get('/sim-costs/csv', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT si.vendor, si.phone_number, si.package_name, si.service_type,
             si.monthly_rate, si.status,
             (e.first_name||' '||e.last_name) AS assigned_to, si.sim_holder
      FROM sims si LEFT JOIN employees e ON e.id=si.assigned_user_id
      WHERE si.status='active'
      ORDER BY si.vendor, si.monthly_rate DESC`);
    const csv = stringify(r.rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=sim-costs.csv');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── FILTER OPTIONS ─────────────────────────────────────────
router.get('/filter-options', requireAuth, async (req, res) => {
  try {
    const [depts, locs] = await Promise.all([
      db.query(`SELECT DISTINCT department FROM employees WHERE is_active=true AND department IS NOT NULL ORDER BY department`),
      db.query(`SELECT DISTINCT location  FROM employees WHERE is_active=true AND location  IS NOT NULL ORDER BY location`),
    ]);
    res.json({ departments: depts.rows.map(r => r.department), locations: locs.rows.map(r => r.location) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── UNASSIGNED INVENTORY ──────────────────────────────────
router.get('/unassigned', requireAuth, async (req, res) => {
  try {
    const [sys, mob, sim] = await Promise.all([
      db.query(`SELECT 'System' AS category, s.asset_tag, s.type, s.manufacturer, s.model,
                       s.serial_number, s.generation, s.status, s.condition, s.location, s.purchase_date
                FROM systems s WHERE s.assigned_type='inventory' ORDER BY s.asset_tag`),
      db.query(`SELECT 'Mobile' AS category, m.asset_tag, m.os AS type, m.manufacturer, m.model,
                       m.serial_number, NULL AS generation, m.status, m.condition, NULL AS location, m.purchase_date
                FROM mobiles m WHERE m.assigned_type='inventory' ORDER BY m.asset_tag`),
      db.query(`SELECT 'SIM Card' AS category, NULL AS asset_tag, si.vendor AS type, NULL AS manufacturer,
                       si.package_name AS model, si.phone_number AS serial_number, NULL AS generation,
                       si.status, NULL AS condition, NULL AS location, si.activation_date AS purchase_date
                FROM sims si WHERE si.assigned_type='inventory' ORDER BY si.phone_number`),
    ]);
    res.json({ systems: sys.rows, mobiles: mob.rows, sims: sim.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DAMAGE & REPAIR REPORT ────────────────────────────────
router.get('/damage', requireAuth, async (req, res) => {
  try {
    const [sys, mob] = await Promise.all([
      db.query(`SELECT 'System' AS category, s.asset_tag, s.type, s.manufacturer, s.model,
                       s.serial_number, s.status, s.condition, s.location, s.notes,
                       (e.first_name||' '||e.last_name) AS assigned_to
                FROM systems s LEFT JOIN employees e ON e.id=s.assigned_user_id
                WHERE s.condition='Damaged' OR s.status IN ('repair','retired')
                ORDER BY s.asset_tag`),
      db.query(`SELECT 'Mobile' AS category, m.asset_tag, m.os AS type, m.manufacturer, m.model,
                       m.serial_number, m.status, m.condition, NULL AS location, m.notes,
                       (e.first_name||' '||e.last_name) AS assigned_to
                FROM mobiles m LEFT JOIN employees e ON e.id=m.assigned_user_id
                WHERE m.condition='Damaged' OR m.status IN ('repair','retired')
                ORDER BY m.asset_tag`),
    ]);
    res.json({ systems: sys.rows, mobiles: mob.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DEPARTMENT ASSET SUMMARY ──────────────────────────────
router.get('/department-summary', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT dept, category,
             SUM(total) AS total, SUM(assigned) AS assigned, SUM(inventory) AS inventory
      FROM (
        SELECT COALESCE(department,'Unknown') AS dept, 'Systems' AS category,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE assigned_type='user') AS assigned,
               COUNT(*) FILTER (WHERE assigned_type='inventory') AS inventory
        FROM systems GROUP BY department
        UNION ALL
        SELECT COALESCE(department,'Unknown'), 'Mobiles',
               COUNT(*), COUNT(*) FILTER (WHERE assigned_type='user'),
               COUNT(*) FILTER (WHERE assigned_type='inventory')
        FROM mobiles GROUP BY department
        UNION ALL
        SELECT COALESCE(e.department,'Unknown'), 'SIM Cards',
               COUNT(*), COUNT(*) FILTER (WHERE si.assigned_type='user'), 0
        FROM sims si LEFT JOIN employees e ON e.id=si.assigned_user_id
        GROUP BY e.department
      ) t
      GROUP BY dept, category
      ORDER BY dept, category`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── WARRANTY REPORT ───────────────────────────────────────
router.get('/warranty', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT 'System' AS category, s.asset_tag, s.type, s.manufacturer, s.model,
             s.serial_number, s.warranty_expiry, s.status,
             (s.warranty_expiry::date - CURRENT_DATE) AS days_remaining,
             (e.first_name || ' ' || e.last_name) AS assigned_user_name
      FROM systems s LEFT JOIN employees e ON e.id=s.assigned_user_id
      WHERE s.warranty_expiry IS NOT NULL
      UNION ALL
      SELECT 'Mobile' AS category, m.asset_tag, 'Mobile' AS type, m.manufacturer, m.model,
             m.serial_number, m.warranty_expiry, m.status,
             (m.warranty_expiry::date - CURRENT_DATE) AS days_remaining,
             (e.first_name || ' ' || e.last_name) AS assigned_user_name
      FROM mobiles m LEFT JOIN employees e ON e.id=m.assigned_user_id
      WHERE m.warranty_expiry IS NOT NULL
      UNION ALL
      SELECT 'Network' AS category, nd.serial_number AS asset_tag, nd.device_type AS type,
             nd.brand AS manufacturer, nd.model, nd.serial_number, nd.warranty_expiry,
             nd.status, (nd.warranty_expiry::date - CURRENT_DATE) AS days_remaining,
             NULL AS assigned_user_name
      FROM network_devices nd
      WHERE nd.warranty_expiry IS NOT NULL
      ORDER BY warranty_expiry ASC`);
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

// ── COST ANALYTICS ────────────────────────────────────────
router.get('/cost-analytics', requireAuth, async (req, res) => {
  try {
    const [byType, byMonth, simByVendor, simTotal] = await Promise.all([
      // Maintenance costs by asset type
      db.query(`
        SELECT asset_type, SUM(cost_pkr) total_cost, COUNT(*) events
        FROM maintenance_log
        WHERE cost_pkr IS NOT NULL AND cost_pkr > 0
        GROUP BY asset_type ORDER BY total_cost DESC
      `),
      // Maintenance costs by month (last 12 months)
      db.query(`
        SELECT to_char(event_date, 'YYYY-MM') AS month,
               SUM(cost_pkr) total_cost, COUNT(*) events
        FROM maintenance_log
        WHERE cost_pkr IS NOT NULL AND cost_pkr > 0
          AND event_date >= NOW() - INTERVAL '12 months'
        GROUP BY month ORDER BY month
      `),
      // Active SIM monthly costs by vendor
      db.query(`
        SELECT vendor, COUNT(*) sim_count, SUM(monthly_rate) monthly_total
        FROM sims WHERE status='active' AND monthly_rate IS NOT NULL
        GROUP BY vendor ORDER BY monthly_total DESC
      `),
      // Total SIM monthly cost
      db.query(`SELECT COALESCE(SUM(monthly_rate), 0) AS total FROM sims WHERE status='active'`),
    ]);
    res.json({
      maintenanceByType: byType.rows,
      maintenanceByMonth: byMonth.rows,
      simByVendor: simByVendor.rows,
      simMonthlyTotal: Number(simTotal.rows[0]?.total || 0),
    });
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
