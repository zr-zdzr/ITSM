const router = require('express').Router();
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const ALLOWED = new Set(['system', 'mobile']);

router.get('/:type/:id', requireAuth, async (req, res) => {
  const { type, id } = req.params;
  if (!ALLOWED.has(type)) return res.status(400).json({ error: 'Invalid type' });
  try {
    const r = await db.query(
      `SELECT m.*, u.name AS logged_by_name
       FROM maintenance_log m LEFT JOIN users u ON u.id = m.logged_by
       WHERE m.asset_type = $1 AND m.asset_id = $2
       ORDER BY m.event_date DESC, m.created_at DESC`,
      [type, id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:type/:id', requireAuth, async (req, res) => {
  const { type, id } = req.params;
  if (!ALLOWED.has(type)) return res.status(400).json({ error: 'Invalid type' });
  const { event_type, event_date, performed_by, cost_pkr, notes } = req.body;
  if (!event_type) return res.status(400).json({ error: 'event_type is required' });
  try {
    const r = await db.query(
      `INSERT INTO maintenance_log (asset_type, asset_id, event_type, event_date, performed_by, cost_pkr, notes, logged_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [type, id, event_type, event_date || new Date().toISOString().slice(0, 10),
       performed_by || null, cost_pkr || null, notes || null, req.user.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:entryId', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM maintenance_log WHERE id = $1', [req.params.entryId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
