const router = require('express').Router();
const db     = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { ALLOWED_TABLES } = require('../utils/recycle');

// GET /count – lightweight badge
router.get('/count', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`SELECT COUNT(*) n FROM recycle_bin WHERE expires_at > NOW()`);
    res.json({ count: Number(r.rows[0].n) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET / – full list with last action from activity_log
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT rb.id, rb.module, rb.table_name, rb.record_id, rb.record_name,
             rb.deleted_at, rb.expires_at,
             u.name  AS deleted_by_name,
             (SELECT a.action     FROM activity_log a WHERE a.table_name=rb.table_name AND a.record_id=rb.record_id AND a.created_at < rb.deleted_at AND a.action NOT IN ('deleted','deleted_all') ORDER BY a.created_at DESC LIMIT 1) AS last_action,
             (SELECT a.created_at FROM activity_log a WHERE a.table_name=rb.table_name AND a.record_id=rb.record_id AND a.created_at < rb.deleted_at AND a.action NOT IN ('deleted','deleted_all') ORDER BY a.created_at DESC LIMIT 1) AS last_action_at,
             (SELECT u2.name FROM activity_log a LEFT JOIN users u2 ON u2.id=a.user_id WHERE a.table_name=rb.table_name AND a.record_id=rb.record_id AND a.created_at < rb.deleted_at AND a.action NOT IN ('deleted','deleted_all') ORDER BY a.created_at DESC LIMIT 1) AS last_action_by
      FROM recycle_bin rb LEFT JOIN users u ON u.id = rb.deleted_by
      WHERE rb.expires_at > NOW()
      ORDER BY rb.deleted_at DESC
    `);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /:id/restore
router.post('/:id/restore', requireAuth, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM recycle_bin WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found in recycle bin' });

    const item = r.rows[0];
    if (!ALLOWED_TABLES.has(item.table_name))
      return res.status(400).json({ error: 'Invalid table' });

    const record = typeof item.data === 'string' ? JSON.parse(item.data) : { ...item.data };
    // Remove auto-managed fields so the DB assigns fresh values
    delete record.id;
    delete record.created_at;
    delete record.updated_at;

    const cols = Object.keys(record);
    const vals = cols.map(k => record[k]);
    const placeholders = cols.map((_, i) => `$${i + 1}`);

    await db.query(
      `INSERT INTO "${item.table_name}" (${cols.map(c => `"${c}"`).join(',')})
       VALUES (${placeholders.join(',')})`,
      vals
    );

    await db.query('DELETE FROM recycle_bin WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /:id – permanently delete one item
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM recycle_bin WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
