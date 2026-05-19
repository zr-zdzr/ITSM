const router = require('express').Router();
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');

router.get('/count', requireAuth, async (req, res) => {
  try {
    const [inv, overdue, warranty] = await Promise.all([
      db.query(`SELECT COUNT(*) n FROM inv_alerts WHERE is_resolved = false`),
      db.query(`SELECT COUNT(*) n FROM inv_assignments WHERE status = 'active' AND expected_return_date < CURRENT_DATE`),
      db.query(`
        SELECT COUNT(*) n FROM (
          SELECT id FROM systems WHERE warranty_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
          UNION ALL SELECT id FROM mobiles WHERE warranty_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
          UNION ALL SELECT id FROM network_devices WHERE warranty_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
        ) x
      `),
    ]);
    const count = Number(inv.rows[0].n) + Number(overdue.rows[0].n) + Number(warranty.rows[0].n);
    res.json({ count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const [inv, overdue, warranty] = await Promise.all([
      db.query(`
        SELECT a.id, a.alert_type, a.current_value, a.threshold_value, a.created_at,
               i.name AS item_name, i.unit
        FROM inv_alerts a JOIN inv_items i ON i.id = a.item_id
        WHERE a.is_resolved = false
        ORDER BY a.alert_type DESC, a.current_value ASC
        LIMIT 20
      `),
      db.query(`
        SELECT a.id, a.asn_number, a.expected_return_date, a.status,
               e.full_name AS assignee_name
        FROM inv_assignments a JOIN employees e ON e.id = a.assignee_id
        WHERE a.status = 'active' AND a.expected_return_date < CURRENT_DATE
        ORDER BY a.expected_return_date ASC
        LIMIT 20
      `),
      db.query(`
        SELECT 'System' AS category, COALESCE(asset_tag, serial_number) AS label,
               manufacturer, model, warranty_expiry,
               (warranty_expiry::date - CURRENT_DATE) AS days_remaining
        FROM systems WHERE warranty_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
        UNION ALL
        SELECT 'Mobile', COALESCE(asset_tag, serial_number),
               manufacturer, model, warranty_expiry,
               (warranty_expiry::date - CURRENT_DATE)
        FROM mobiles WHERE warranty_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
        UNION ALL
        SELECT 'Network', serial_number, brand, model, warranty_expiry,
               (warranty_expiry::date - CURRENT_DATE)
        FROM network_devices WHERE warranty_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
        ORDER BY days_remaining ASC
        LIMIT 20
      `),
    ]);
    res.json({
      inventory:      inv.rows,
      overdueReturns: overdue.rows,
      warranties:     warranty.rows,
      totalCount: inv.rows.length + overdue.rows.length + warranty.rows.length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
