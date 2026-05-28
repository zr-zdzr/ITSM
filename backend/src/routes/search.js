const router = require('express').Router();
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res, next) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const like = `%${q}%`;
  try {
    const r = await db.query(`
      SELECT 'systems' AS module, '/systems' AS path, id::text,
             COALESCE(asset_tag, serial_number, 'System') AS label,
             CONCAT_WS(' · ', type, manufacturer, model, status) AS sub
      FROM systems
      WHERE asset_tag ILIKE $1 OR serial_number ILIKE $1 OR manufacturer ILIKE $1 OR model ILIKE $1 OR type ILIKE $1

      UNION ALL

      SELECT 'network', '/network', id::text,
             COALESCE(serial_number, CONCAT(brand,' ',model), 'Network Device') AS label,
             CONCAT_WS(' · ', device_type, brand, model, status) AS sub
      FROM network_devices
      WHERE serial_number ILIKE $1 OR brand ILIKE $1 OR model ILIKE $1 OR device_type ILIKE $1 OR ip_address ILIKE $1

      UNION ALL

      SELECT 'mobiles', '/mobiles', id::text,
             COALESCE(asset_tag, serial_number, 'Mobile') AS label,
             CONCAT_WS(' · ', manufacturer, model, status) AS sub
      FROM mobiles
      WHERE asset_tag ILIKE $1 OR serial_number ILIKE $1 OR manufacturer ILIKE $1 OR model ILIKE $1 OR imei1 ILIKE $1

      UNION ALL

      SELECT 'sims', '/sims', id::text,
             COALESCE(phone_number, 'SIM') AS label,
             CONCAT_WS(' · ', vendor, package_name, status) AS sub
      FROM sims
      WHERE phone_number ILIKE $1 OR vendor ILIKE $1 OR sim_holder ILIKE $1 OR package_name ILIKE $1

      UNION ALL

      SELECT 'gws', '/gws', id::text,
             COALESCE(email, display_name, 'Cloud ID') AS label,
             CONCAT_WS(' · ', account_type, status) AS sub
      FROM gws_accounts
      WHERE email ILIKE $1 OR display_name ILIKE $1

      UNION ALL

      SELECT 'employees', '/employees', id::text,
             full_name AS label,
             CONCAT_WS(' · ', designation, department, email) AS sub
      FROM employees
      WHERE full_name ILIKE $1 OR email ILIKE $1 OR designation ILIKE $1 OR department ILIKE $1

      UNION ALL

      SELECT 'inventory', '/inventory', i.id::text,
             i.name AS label,
             CONCAT_WS(' · ', c.name, i.model, i.sku) AS sub
      FROM inv_items i LEFT JOIN inv_categories c ON c.id = i.category_id
      WHERE i.name ILIKE $1 OR i.model ILIKE $1 OR i.sku ILIKE $1

      LIMIT 50
    `, [like]);
    res.json(r.rows);
  } catch (e) { next(e); }
});

module.exports = router;
