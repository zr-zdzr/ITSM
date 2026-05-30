const router = require('express').Router();
const db = require('../config/db');
const { requireAuth, perm } = require('../middleware/auth');

// ── List (filterable) ─────────────────────────────────────
router.get('/', requireAuth, perm('systems', 'read'), async (req, res, next) => {
  try {
    const { asset_type, asset_id, employee_id, event_type, from_date, to_date } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];
    let i = 1;

    if (asset_type)  { where += ` AND ah.asset_type=$${i++}`;              params.push(asset_type); }
    if (asset_id)    { where += ` AND ah.asset_id=$${i++}`;                params.push(asset_id); }
    if (employee_id) { where += ` AND (ah.from_employee_id=$${i} OR ah.to_employee_id=$${i++})`; params.push(employee_id); }
    if (event_type)  { where += ` AND ah.event_type=$${i++}`;              params.push(event_type); }
    if (from_date)   { where += ` AND ah.created_at >= $${i++}`;           params.push(from_date); }
    if (to_date)     { where += ` AND ah.created_at < ($${i++}::date + 1)`; params.push(to_date); }

    const countRes = await db.query(
      `SELECT COUNT(*) FROM asset_history ah ${where}`,
      params,
    );
    const total = parseInt(countRes.rows[0].count);

    const rows = await db.query(
      `SELECT
         ah.*,
         fe.full_name AS from_employee_name,
         te.full_name AS to_employee_name,
         u.name       AS performed_by_name
       FROM asset_history ah
       LEFT JOIN employees fe ON fe.id = ah.from_employee_id
       LEFT JOIN employees te ON te.id = ah.to_employee_id
       LEFT JOIN users     u  ON u.id  = ah.performed_by
       ${where}
       ORDER BY ah.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset],
    );

    res.json({ total, page, limit, rows: rows.rows });
  } catch (err) { next(err); }
});

// ── Timeline for a single asset ───────────────────────────
router.get('/:assetType/:assetId', requireAuth, perm('systems', 'read'), async (req, res, next) => {
  try {
    const { assetType, assetId } = req.params;
    const rows = await db.query(
      `SELECT
         ah.*,
         fe.full_name AS from_employee_name,
         te.full_name AS to_employee_name,
         u.name       AS performed_by_name
       FROM asset_history ah
       LEFT JOIN employees fe ON fe.id = ah.from_employee_id
       LEFT JOIN employees te ON te.id = ah.to_employee_id
       LEFT JOIN users     u  ON u.id  = ah.performed_by
       WHERE ah.asset_type=$1 AND ah.asset_id=$2
       ORDER BY ah.created_at ASC`,
      [assetType, assetId],
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});

// ── All hardware assets an employee has ever held ─────────
router.get('/employee/:employeeId', requireAuth, perm('systems', 'read'), async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT
         ah.*,
         fe.full_name AS from_employee_name,
         te.full_name AS to_employee_name,
         u.name       AS performed_by_name
       FROM asset_history ah
       LEFT JOIN employees fe ON fe.id = ah.from_employee_id
       LEFT JOIN employees te ON te.id = ah.to_employee_id
       LEFT JOIN users     u  ON u.id  = ah.performed_by
       WHERE ah.from_employee_id=$1 OR ah.to_employee_id=$1
       ORDER BY ah.created_at DESC`,
      [req.params.employeeId],
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});

// ── Replacement frequency stats ───────────────────────────
router.get('/stats/replacements', requireAuth, perm('systems', 'read'), async (req, res, next) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const rows = await db.query(
      `SELECT
         e.id AS employee_id,
         e.full_name,
         e.department,
         COUNT(*) AS replacement_count,
         MAX(ah.created_at) AS last_replacement_at
       FROM asset_history ah
       JOIN employees e ON e.id = ah.to_employee_id
       WHERE ah.event_type = 'replaced'
       GROUP BY e.id, e.full_name, e.department
       ORDER BY replacement_count DESC
       LIMIT $1`,
      [limit],
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});

module.exports = router;
