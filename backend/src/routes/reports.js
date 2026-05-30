const router = require("express").Router();
const { stringify } = require("csv-stringify/sync");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

// ── DASHBOARD STATS ───────────────────────────────────────
router.get("/dashboard", requireAuth, async (req, res, next) => {
  try {
    const [
      net,
      gws,
      gwsLic,
      gwsTyp,
      usr,
      warExp,
      warSoon,
      act24h,
      sysAssignment,
      sysLocation,
      sysGeneration,
      sysType,
      mobAssignment,
      mobLocation,
      mobOS,
      mobPurpose,
      simAssignment,
      simLocation,
      simPackage,
      simVendor,
      empTotal,
      empByLocation,
      empByDept,
      empByType,
    ] = await Promise.all([
      db.query(
        "SELECT device_type, COUNT(*) n FROM network_devices GROUP BY device_type",
      ),
      db.query("SELECT status, COUNT(*) n FROM gws_accounts GROUP BY status"),
      db.query(
        "SELECT COALESCE(license,'Not Assigned') AS license, COUNT(*) n FROM gws_accounts GROUP BY license",
      ),
      db.query(
        "SELECT account_type, COUNT(*) n FROM gws_accounts GROUP BY account_type",
      ),
      db.query("SELECT role, COUNT(*) n FROM users GROUP BY role"),
      db.query(
        "SELECT COUNT(*) n FROM systems WHERE warranty_expiry < NOW() UNION ALL SELECT COUNT(*) n FROM mobiles WHERE warranty_expiry < NOW() UNION ALL SELECT COUNT(*) n FROM network_devices WHERE warranty_expiry < NOW()",
      ),
      db.query(
        "SELECT COUNT(*) n FROM systems WHERE warranty_expiry BETWEEN NOW() AND NOW() + INTERVAL '90 days' UNION ALL SELECT COUNT(*) n FROM mobiles WHERE warranty_expiry BETWEEN NOW() AND NOW() + INTERVAL '90 days' UNION ALL SELECT COUNT(*) n FROM network_devices WHERE warranty_expiry BETWEEN NOW() AND NOW() + INTERVAL '90 days'",
      ),
      db.query(
        `SELECT a.id, a.action, a.table_name, a.record_label, a.details, a.ip_address, a.created_at, u.name AS user_name, u.email AS user_email FROM activity_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.created_at >= NOW() - INTERVAL '24 hours' ORDER BY a.created_at DESC LIMIT 100`,
      ),
      // Systems
      db.query(`SELECT
        COUNT(*) FILTER (WHERE assigned_type IN ('employee','user')) AS employees,
        COUNT(*) FILTER (WHERE assigned_type='wfh') AS wfh,
        COUNT(*) FILTER (WHERE assigned_type='inventory') AS in_inventory,
        COUNT(*) FILTER (WHERE assigned_type='damaged') AS damaged,
        COUNT(*) FILTER (WHERE assigned_type IN ('employee','user','wfh')) AS assigned_users,
        COUNT(*) AS total
        FROM systems`),
      db.query(
        `SELECT COALESCE(location,'Unknown') AS location, COUNT(*) n FROM systems GROUP BY location ORDER BY n DESC`,
      ),
      db.query(
        `SELECT COALESCE(generation,'Unknown') AS generation, COUNT(*) n FROM systems GROUP BY generation ORDER BY n DESC`,
      ),
      db.query(
        `SELECT type, COUNT(*) n FROM systems GROUP BY type ORDER BY n DESC`,
      ),
      // Mobiles
      db.query(`SELECT
        COUNT(*) FILTER (WHERE assigned_type IN ('employee','user')) AS employees,
        COUNT(*) FILTER (WHERE assigned_type='wfh') AS wfh,
        COUNT(*) FILTER (WHERE assigned_type='inventory') AS in_inventory,
        COUNT(*) FILTER (WHERE assigned_type='damaged') AS damaged,
        COUNT(*) FILTER (WHERE assigned_type IN ('employee','user','wfh')) AS assigned_users,
        COUNT(*) AS total
        FROM mobiles`),
      db.query(
        `SELECT COALESCE(location,'Unknown') AS location, COUNT(*) n FROM mobiles GROUP BY location ORDER BY n DESC`,
      ),
      db.query(
        `SELECT COALESCE(os,'Unknown') AS os, COUNT(*) n FROM mobiles GROUP BY os ORDER BY n DESC`,
      ),
      db.query(
        `SELECT COALESCE(purpose,'Unknown') AS purpose, COUNT(*) n FROM mobiles GROUP BY purpose ORDER BY n DESC`,
      ),
      // SIMs
      db.query(`SELECT
        COUNT(*) FILTER (WHERE assigned_type IN ('employee','user')) AS employees,
        COUNT(*) FILTER (WHERE assigned_type='wfh') AS wfh,
        COUNT(*) FILTER (WHERE assigned_type='service') AS for_services,
        COUNT(*) AS total
        FROM sims`),
      db.query(`SELECT COALESCE(s.location,'Unknown') AS location, COUNT(*) n
        FROM sims s GROUP BY s.location ORDER BY n DESC`),
      db.query(
        `SELECT COALESCE(package_name,'Unassigned') AS package_name, COUNT(*) n FROM sims GROUP BY package_name ORDER BY n DESC`,
      ),
      db.query(
        `SELECT vendor, COUNT(*) n FROM sims GROUP BY vendor ORDER BY n DESC`,
      ),
      // Employees
      db.query(
        `SELECT COUNT(*) total, COUNT(*) FILTER (WHERE is_active=true) active FROM employees`,
      ),
      db.query(
        `SELECT COALESCE(location,'Unknown') AS location, COUNT(*) n FROM employees WHERE is_active=true GROUP BY location ORDER BY n DESC`,
      ),
      db.query(
        `SELECT COALESCE(department,'Unknown') AS department, COUNT(*) n FROM employees WHERE is_active=true GROUP BY department ORDER BY n DESC`,
      ),
      db.query(
        `SELECT COALESCE(employment_type,'Unknown') AS type, COUNT(*) n FROM employees WHERE is_active=true GROUP BY employment_type ORDER BY n DESC`,
      ),
    ]);
    res.json({
      networkDevices: net.rows,
      gws: gws.rows,
      gwsLicense: gwsLic.rows,
      gwsType: gwsTyp.rows,
      users: usr.rows,
      warrantyExpired: warExp.rows.reduce((s, r) => s + Number(r.n), 0),
      warrantySoon: warSoon.rows.reduce((s, r) => s + Number(r.n), 0),
      activity24h: act24h.rows,
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
        byType: empByType.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── EMPLOYEE ASSETS REPORT ───────────────────────────────
router.get("/employee-assets", requireAuth, async (req, res, next) => {
  try {
    const { department, location } = req.query;
    const params = [];
    let i = 1;
    let where = "WHERE e.is_active = true";
    if (department) {
      where += ` AND e.department = $${i++}`;
      params.push(department);
    }
    if (location) {
      where += ` AND e.location   = $${i++}`;
      params.push(location);
    }

    const r = await db.query(
      `
      SELECT
        e.id, e.full_name, e.email,
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
      ORDER BY e.full_name`,
      params,
    );
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});

// ── EMPLOYEE ASSETS CSV ────────────────────────────────────
router.get("/employee-assets/csv", requireAuth, async (req, res, next) => {
  try {
    const { department, location } = req.query;
    const params = [];
    let i = 1;
    let where = "WHERE e.is_active = true";
    if (department) {
      where += ` AND e.department = $${i++}`;
      params.push(department);
    }
    if (location) {
      where += ` AND e.location   = $${i++}`;
      params.push(location);
    }

    const r = await db.query(
      `
      SELECT
        e.full_name AS employee,
        e.email, e.designation, e.department, e.location, e.employment_type,
        s.type AS asset_type, s.asset_tag, s.manufacturer, s.model,
        s.serial_number, s.generation, s.status, s.condition, s.location AS asset_location
      FROM employees e
      JOIN systems s ON s.assigned_user_id=e.id AND s.assigned_type='user'
      ${where}
      UNION ALL
      SELECT
        e.full_name,
        e.email, e.designation, e.department, e.location, e.employment_type,
        'Mobile' AS asset_type, m.asset_tag, m.manufacturer, m.model,
        m.serial_number, NULL, m.status, m.condition, NULL
      FROM employees e
      JOIN mobiles m ON m.assigned_user_id=e.id AND m.assigned_type='user'
      ${where.replace(/e\.(department|location)/g, "e.$1")}
      UNION ALL
      SELECT
        e.full_name,
        e.email, e.designation, e.department, e.location, e.employment_type,
        'SIM Card' AS asset_type, NULL, si.vendor, si.package_name,
        si.phone_number, NULL, si.status, NULL, NULL
      FROM employees e
      JOIN sims si ON si.assigned_user_id=e.id AND si.assigned_type='user'
      ${where.replace(/e\.(department|location)/g, "e.$1")}
      ORDER BY employee, asset_type, asset_tag`,
      params,
    );

    const csv = stringify(r.rows, { header: true });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=employee-assets.csv",
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// ── WARRANTY CSV ───────────────────────────────────────────
router.get("/warranty/csv", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT 'System' AS category, s.asset_tag, s.type, s.manufacturer, s.model,
             s.serial_number, s.status, s.warranty_expiry,
             (s.warranty_expiry::date - CURRENT_DATE) AS days_remaining,
             e.full_name AS assigned_to
      FROM systems s LEFT JOIN employees e ON e.id=s.assigned_user_id
      WHERE s.warranty_expiry IS NOT NULL
      UNION ALL
      SELECT 'Mobile', m.asset_tag, 'Mobile', m.manufacturer, m.model,
             m.serial_number, m.status, m.warranty_expiry,
             (m.warranty_expiry::date - CURRENT_DATE),
             e.full_name
      FROM mobiles m LEFT JOIN employees e ON e.id=m.assigned_user_id
      WHERE m.warranty_expiry IS NOT NULL
      UNION ALL
      SELECT 'Network', nd.serial_number, nd.device_type, nd.brand, nd.model,
             nd.serial_number, nd.status, nd.warranty_expiry,
             (nd.warranty_expiry::date - CURRENT_DATE), NULL
      FROM network_devices nd WHERE nd.warranty_expiry IS NOT NULL
      ORDER BY warranty_expiry ASC`);
    const csv = stringify(r.rows, { header: true });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=warranty-report.csv",
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// ── SIM COSTS CSV ─────────────────────────────────────────
router.get("/sim-costs/csv", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT si.vendor, si.phone_number, si.package_name, si.service_type,
             si.monthly_rate, si.status,
             e.full_name AS assigned_to, si.sim_holder
      FROM sims si LEFT JOIN employees e ON e.id=si.assigned_user_id
      WHERE si.status='active'
      ORDER BY si.vendor, si.monthly_rate DESC`);
    const csv = stringify(r.rows, { header: true });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=sim-costs.csv");
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// ── FILTER OPTIONS ─────────────────────────────────────────
router.get("/filter-options", requireAuth, async (req, res, next) => {
  try {
    const [depts, locs, emps] = await Promise.all([
      db.query(
        `SELECT DISTINCT department FROM employees WHERE is_active=true AND department IS NOT NULL ORDER BY department`,
      ),
      db.query(
        `SELECT DISTINCT location  FROM employees WHERE is_active=true AND location  IS NOT NULL ORDER BY location`,
      ),
      db.query(
        `SELECT id, full_name FROM employees WHERE is_active=true ORDER BY full_name`,
      ),
    ]);
    res.json({
      departments: depts.rows.map((r) => r.department),
      locations: locs.rows.map((r) => r.location),
      employees: emps.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ── UNASSIGNED INVENTORY ──────────────────────────────────
router.get("/unassigned", requireAuth, async (req, res, next) => {
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
  } catch (err) {
    next(err);
  }
});

// ── DAMAGE & REPAIR REPORT ────────────────────────────────
router.get("/damage", requireAuth, async (req, res, next) => {
  try {
    const [sys, mob] = await Promise.all([
      db.query(`SELECT 'System' AS category, s.asset_tag, s.type, s.manufacturer, s.model,
                       s.serial_number, s.status, s.condition, s.location, s.notes,
                       e.full_name AS assigned_to
                FROM systems s LEFT JOIN employees e ON e.id=s.assigned_user_id
                WHERE s.condition='Damaged' OR s.status IN ('repair','retired')
                ORDER BY s.asset_tag`),
      db.query(`SELECT 'Mobile' AS category, m.asset_tag, m.os AS type, m.manufacturer, m.model,
                       m.serial_number, m.status, m.condition, NULL AS location, m.notes,
                       e.full_name AS assigned_to
                FROM mobiles m LEFT JOIN employees e ON e.id=m.assigned_user_id
                WHERE m.condition='Damaged' OR m.status IN ('repair','retired')
                ORDER BY m.asset_tag`),
    ]);
    res.json({ systems: sys.rows, mobiles: mob.rows });
  } catch (err) {
    next(err);
  }
});

// ── DEPARTMENT ASSET SUMMARY ──────────────────────────────
router.get("/department-summary", requireAuth, async (req, res, next) => {
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
  } catch (err) {
    next(err);
  }
});

// ── WARRANTY REPORT ───────────────────────────────────────
router.get("/warranty", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT 'System' AS category, s.asset_tag, s.type, s.manufacturer, s.model,
             s.serial_number, s.warranty_expiry, s.status,
             (s.warranty_expiry::date - CURRENT_DATE) AS days_remaining,
             e.full_name AS assigned_user_name
      FROM systems s LEFT JOIN employees e ON e.id=s.assigned_user_id
      WHERE s.warranty_expiry IS NOT NULL
      UNION ALL
      SELECT 'Mobile' AS category, m.asset_tag, 'Mobile' AS type, m.manufacturer, m.model,
             m.serial_number, m.warranty_expiry, m.status,
             (m.warranty_expiry::date - CURRENT_DATE) AS days_remaining,
             e.full_name AS assigned_user_name
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
  } catch (err) {
    next(err);
  }
});

// ── ASSIGNMENTS REPORT ────────────────────────────────────
router.get("/assignments", requireAuth, async (req, res, next) => {
  try {
    const [sys, mob, sim] = await Promise.all([
      db.query(
        `SELECT e.full_name AS name,e.email,e.department, json_agg(json_build_object('type','System','label',s.serial_number,'status',s.status)) AS items FROM systems s JOIN employees e ON e.id=s.assigned_user_id GROUP BY e.id,e.full_name,e.email,e.department`,
      ),
      db.query(
        `SELECT e.full_name AS name,e.email,e.department, json_agg(json_build_object('type','Mobile','label',m.asset_tag,'model',m.manufacturer||' '||m.model,'status',m.status)) AS items FROM mobiles m JOIN employees e ON e.id=m.assigned_user_id GROUP BY e.id,e.full_name,e.email,e.department`,
      ),
      db.query(
        `SELECT e.full_name AS name,e.email,e.department, json_agg(json_build_object('type','SIM','label',s.phone_number,'vendor',s.vendor)) AS items FROM sims s JOIN employees e ON e.id=s.assigned_user_id GROUP BY e.id,e.full_name,e.email,e.department`,
      ),
    ]);
    res.json({ systems: sys.rows, mobiles: mob.rows, sims: sim.rows });
  } catch (err) {
    next(err);
  }
});

// ── FULL SUMMARY EXPORT ───────────────────────────────────
router.get("/summary/csv", requireAuth, async (req, res, next) => {
  try {
    const [sys, net, mob, sim, gws] = await Promise.all([
      db.query("SELECT * FROM systems ORDER BY created_at DESC"),
      db.query("SELECT * FROM network_devices ORDER BY created_at DESC"),
      db.query("SELECT * FROM mobiles ORDER BY created_at DESC"),
      db.query("SELECT * FROM sims ORDER BY created_at DESC"),
      db.query("SELECT * FROM gws_accounts ORDER BY created_at DESC"),
    ]);
    // Return a multi-sheet style CSV with section markers
    const sections = [
      { title: "## SYSTEMS", rows: sys.rows },
      { title: "## NETWORK DEVICES", rows: net.rows },
      { title: "## MOBILE PHONES", rows: mob.rows },
      { title: "## SIM CARDS", rows: sim.rows },
      { title: "## GWS ACCOUNTS", rows: gws.rows },
    ];
    let output = "";
    for (const s of sections) {
      output += s.title + "\n";
      output +=
        s.rows.length > 0
          ? stringify(s.rows, { header: true })
          : "No records\n";
      output += "\n";
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=itms_full_report.csv",
    );
    res.send(output);
  } catch (err) {
    next(err);
  }
});

// ── GWS REPORT ────────────────────────────────────────────
router.get("/gws", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT *, (storage_used / NULLIF(storage_limit,0) * 100)::int AS storage_pct
      FROM gws_accounts ORDER BY storage_used DESC`);
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});

// ── SIM COST REPORT ───────────────────────────────────────
router.get("/sim-costs", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT vendor, COUNT(*) count, SUM(monthly_rate) total_monthly
      FROM sims WHERE status='active' GROUP BY vendor ORDER BY total_monthly DESC`);
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});

// ── BY BRAND / MANUFACTURER ───────────────────────────────
router.get("/by-brand", requireAuth, async (req, res, next) => {
  try {
    const [sys, mob, net] = await Promise.all([
      db.query(
        `SELECT manufacturer AS brand, COUNT(*) cnt FROM systems WHERE manufacturer IS NOT NULL GROUP BY manufacturer ORDER BY cnt DESC`,
      ),
      db.query(
        `SELECT manufacturer AS brand, COUNT(*) cnt FROM mobiles WHERE manufacturer IS NOT NULL GROUP BY manufacturer ORDER BY cnt DESC`,
      ),
      db.query(
        `SELECT brand, COUNT(*) cnt FROM network_devices WHERE brand IS NOT NULL GROUP BY brand ORDER BY cnt DESC`,
      ),
    ]);
    res.json({ systems: sys.rows, mobiles: mob.rows, network: net.rows });
  } catch (err) {
    next(err);
  }
});

// ── BY ASSET TAG ──────────────────────────────────────────
router.get("/by-asset-tag", requireAuth, async (req, res, next) => {
  try {
    const { q } = req.query;
    const pattern = q ? `%${q}%` : "%";
    const [sys, mob] = await Promise.all([
      db.query(
        `SELECT s.asset_tag, s.type, s.manufacturer, s.model, s.serial_number, s.status, s.condition,
                s.department, s.location, e.full_name AS assigned_user_name
         FROM systems s LEFT JOIN employees e ON e.id=s.assigned_user_id
         WHERE s.asset_tag ILIKE $1 ORDER BY s.asset_tag`,
        [pattern],
      ),
      db.query(
        `SELECT m.asset_tag, m.manufacturer, m.model, m.serial_number, m.status, m.condition,
                m.department, e.full_name AS assigned_user_name
         FROM mobiles m LEFT JOIN employees e ON e.id=m.assigned_user_id
         WHERE m.asset_tag ILIKE $1 ORDER BY m.asset_tag`,
        [pattern],
      ),
    ]);
    res.json({ systems: sys.rows, mobiles: mob.rows });
  } catch (err) {
    next(err);
  }
});

// ── COST ANALYTICS ────────────────────────────────────────
router.get("/cost-analytics", requireAuth, async (req, res, next) => {
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
      db.query(
        `SELECT COALESCE(SUM(monthly_rate), 0) AS total FROM sims WHERE status='active'`,
      ),
    ]);
    res.json({
      maintenanceByType: byType.rows,
      maintenanceByMonth: byMonth.rows,
      simByVendor: simByVendor.rows,
      simMonthlyTotal: Number(simTotal.rows[0]?.total || 0),
    });
  } catch (err) {
    next(err);
  }
});

// ── ELOG (Activity / Access Log) ──────────────────────────
router.get("/elog", requireAuth, async (req, res, next) => {
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
    if (table_name) {
      sql += ` AND a.table_name=$${i++}`;
      params.push(table_name);
    }
    if (action) {
      sql += ` AND a.action ILIKE $${i++}`;
      params.push(`%${action}%`);
    }
    sql += ` ORDER BY a.created_at DESC LIMIT $${i++}`;
    params.push(Number(limit));
    const r = await db.query(sql, params);
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});

// ── STOCK TRENDS ─────────────────────────────────────────
// Monthly totals from inv_adjustments — issued, returned, purchased, consumed
router.get("/stock-trends", requireAuth, async (req, res, next) => {
  try {
    const months = Math.min(24, Math.max(1, parseInt(req.query.months) || 12));
    const r = await db.query(
      `
      SELECT
        to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
        SUM(CASE WHEN type = 'assignment'       THEN ABS(qty_change) ELSE 0 END) AS issued,
        SUM(CASE WHEN type = 'return_to_stock'  THEN ABS(qty_change) ELSE 0 END) AS returned,
        SUM(CASE WHEN type = 'purchase'         THEN ABS(qty_change) ELSE 0 END) AS purchased,
        SUM(CASE WHEN type IN ('damaged','lost','retired') THEN ABS(qty_change) ELSE 0 END) AS consumed,
        COUNT(*) AS movements
      FROM inv_adjustments
      WHERE created_at >= NOW() - ($1 || ' months')::INTERVAL
      GROUP BY month
      ORDER BY month ASC
    `,
      [months],
    );
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});

// ── TOP CONSUMED ITEMS ────────────────────────────────────
// Most-issued items by assignment count from inv_adjustments
router.get("/top-items", requireAuth, async (req, res, next) => {
  try {
    const months = Math.min(24, Math.max(1, parseInt(req.query.months) || 12));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const r = await db.query(
      `
      SELECT
        i.id   AS item_id,
        i.name,
        i.unit,
        c.name AS category_name,
        SUM(CASE WHEN a.type = 'assignment'      THEN ABS(a.qty_change) ELSE 0 END) AS total_issued,
        SUM(CASE WHEN a.type = 'return_to_stock' THEN ABS(a.qty_change) ELSE 0 END) AS total_returned,
        SUM(CASE WHEN a.type IN ('damaged','lost','retired') THEN ABS(a.qty_change) ELSE 0 END) AS total_consumed,
        COUNT(DISTINCT CASE WHEN a.type = 'assignment' THEN a.id END) AS issue_events
      FROM inv_adjustments a
      JOIN inv_items     i ON i.id = a.item_id
      LEFT JOIN inv_categories c ON c.id = i.category_id
      WHERE a.created_at >= NOW() - ($1 || ' months')::INTERVAL
        AND i.is_active = true
      GROUP BY i.id, i.name, i.unit, c.name
      HAVING SUM(CASE WHEN a.type = 'assignment' THEN ABS(a.qty_change) ELSE 0 END) > 0
      ORDER BY total_issued DESC
      LIMIT $2
    `,
      [months, limit],
    );
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});

// ── DEPARTMENT UTILIZATION ────────────────────────────────
// Inventory consumption grouped by employee department
router.get("/department-utilization", requireAuth, async (req, res, next) => {
  try {
    const months = Math.min(24, Math.max(1, parseInt(req.query.months) || 12));
    const r = await db.query(
      `
      SELECT
        COALESCE(e.department, 'Unknown') AS department,
        COUNT(DISTINCT ia.id)  AS total_assignments,
        COUNT(DISTINCT CASE WHEN ia.status = 'active' THEN ia.id END) AS active_assignments,
        COUNT(DISTINCT e.id)   AS employee_count,
        SUM(iai.qty)           AS total_qty_issued,
        COUNT(DISTINCT iai.item_id) AS unique_items
      FROM inv_assignments ia
      JOIN inv_assignment_items iai ON iai.assignment_id = ia.id
      JOIN employees            e   ON e.id = ia.assignee_id
      WHERE ia.created_at >= NOW() - ($1 || ' months')::INTERVAL
      GROUP BY e.department
      ORDER BY total_qty_issued DESC
    `,
      [months],
    );
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});

// ── FORECAST ─────────────────────────────────────────────
// Projected stockout date per inventory item based on avg daily consumption
router.get("/forecast", requireAuth, async (req, res, next) => {
  try {
    const months = Math.min(24, Math.max(1, parseInt(req.query.months) || 6));
    const r = await db.query(
      `
      WITH consumption AS (
        SELECT
          a.item_id,
          SUM(CASE WHEN a.type = 'assignment' THEN ABS(a.qty_change) ELSE 0 END) AS total_issued,
          SUM(CASE WHEN a.type IN ('damaged','lost','retired') THEN ABS(a.qty_change) ELSE 0 END) AS total_consumed,
          COUNT(DISTINCT DATE(a.created_at)) AS active_days
        FROM inv_adjustments a
        WHERE a.created_at >= NOW() - ($1 || ' months')::INTERVAL
        GROUP BY a.item_id
      )
      SELECT
        i.id         AS item_id,
        i.name,
        i.unit,
        c.name       AS category_name,
        s.qty_available,
        s.reorder_level,
        COALESCE(con.total_issued, 0)   AS total_issued,
        COALESCE(con.total_consumed, 0) AS total_consumed,
        COALESCE(con.active_days, 0)    AS active_days,
        ROUND(
          COALESCE(con.total_issued, 0)::numeric
          / GREATEST(($1::numeric * 30), 1),
          4
        ) AS avg_daily_consumption,
        CASE
          WHEN COALESCE(con.total_issued, 0) = 0 THEN NULL
          ELSE CURRENT_DATE + (
            s.qty_available::numeric
            / GREATEST(
                COALESCE(con.total_issued, 0)::numeric / GREATEST(($1::numeric * 30), 1),
                0.001
              )
          )::integer
        END AS projected_stockout_date,
        CASE
          WHEN COALESCE(con.total_issued, 0) = 0 THEN NULL
          ELSE ROUND(
            s.qty_available::numeric
            / GREATEST(
                COALESCE(con.total_issued, 0)::numeric / GREATEST(($1::numeric * 30), 1),
                0.001
              ),
            0
          )
        END AS days_until_stockout
      FROM inv_items i
      LEFT JOIN inv_stock      s   ON s.item_id   = i.id
      LEFT JOIN inv_categories c   ON c.id         = i.category_id
      LEFT JOIN consumption    con ON con.item_id  = i.id
      WHERE i.is_active = true
        AND s.qty_available IS NOT NULL
      ORDER BY
        CASE WHEN COALESCE(con.total_issued, 0) = 0 THEN 1 ELSE 0 END,
        days_until_stockout ASC NULLS LAST
    `,
      [months],
    );
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});

// ── COST SUMMARY ─────────────────────────────────────────
// Hardware asset purchase value + straight-line depreciation
router.get("/cost-summary", requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT
        asset_type,
        category,
        COUNT(*)                                        AS total_assets,
        COUNT(*) FILTER (WHERE purchase_price_pkr IS NOT NULL) AS priced_assets,
        COALESCE(SUM(purchase_price_pkr), 0)           AS total_cost,
        COALESCE(AVG(purchase_price_pkr), 0)           AS avg_cost,
        COALESCE(SUM(
          LEAST(
            purchase_price_pkr,
            GREATEST(0,
              purchase_price_pkr
              * EXTRACT(EPOCH FROM (NOW() - purchase_date::timestamptz))
              / (useful_life_years * 365.25 * 86400)
            )
          )
        ) FILTER (WHERE purchase_price_pkr IS NOT NULL AND purchase_date IS NOT NULL), 0) AS total_depreciation,
        COALESCE(SUM(
          purchase_price_pkr - LEAST(
            purchase_price_pkr,
            GREATEST(0,
              purchase_price_pkr
              * EXTRACT(EPOCH FROM (NOW() - purchase_date::timestamptz))
              / (useful_life_years * 365.25 * 86400)
            )
          )
        ) FILTER (WHERE purchase_price_pkr IS NOT NULL AND purchase_date IS NOT NULL), 0) AS net_book_value
      FROM (
        SELECT 'system'  AS asset_type, type AS category,
               purchase_price_pkr, purchase_date, useful_life_years
        FROM systems
        UNION ALL
        SELECT 'mobile'  AS asset_type, os AS category,
               purchase_price_pkr, purchase_date, useful_life_years
        FROM mobiles
        UNION ALL
        SELECT 'network' AS asset_type, device_type AS category,
               purchase_price_pkr, purchase_date, useful_life_years
        FROM network_devices
      ) t
      GROUP BY asset_type, category
      ORDER BY asset_type, total_cost DESC
    `);

    // Overall totals
    const totals = await db.query(`
      SELECT
        COALESCE(SUM(purchase_price_pkr), 0) AS grand_total_cost,
        COUNT(*) FILTER (WHERE purchase_price_pkr IS NOT NULL) AS priced_assets,
        COUNT(*) AS total_assets
      FROM (
        SELECT purchase_price_pkr FROM systems
        UNION ALL
        SELECT purchase_price_pkr FROM mobiles
        UNION ALL
        SELECT purchase_price_pkr FROM network_devices
      ) t
    `);

    res.json({ byCategory: r.rows, totals: totals.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
