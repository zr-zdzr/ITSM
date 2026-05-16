const router = require('express').Router();
const db = require('../config/db');
const { requireAuth, perm } = require('../middleware/auth');

const COLS = ['name','contact','email','phone','website','category','address','notes'];

router.get('/', requireAuth, perm('vendors','read'), async (_req, res) => {
  const { rows } = await db.query(
    `SELECT v.*, u.display_name AS created_by_name
     FROM vendors v LEFT JOIN users u ON u.id = v.created_by
     ORDER BY v.name`
  );
  res.json(rows);
});

router.post('/', requireAuth, perm('vendors','create'), async (req, res) => {
  const pick = COLS.reduce((o, k) => { o[k] = req.body[k] ?? null; return o; }, {});
  pick.created_by = req.user.id;
  const keys = Object.keys(pick);
  const vals = Object.values(pick);
  const ph   = keys.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await db.query(
    `INSERT INTO vendors (${keys.join(', ')}) VALUES (${ph}) RETURNING *`,
    vals
  );
  res.json(rows[0]);
});

router.put('/:id', requireAuth, perm('vendors','update'), async (req, res) => {
  const pick = COLS.reduce((o, k) => { if (k in req.body) o[k] = req.body[k]; return o; }, {});
  pick.updated_at = new Date();
  const sets = Object.keys(pick).map((k, i) => `${k} = $${i + 1}`).join(', ');
  const vals = [...Object.values(pick), req.params.id];
  const { rows } = await db.query(
    `UPDATE vendors SET ${sets} WHERE id = $${vals.length} RETURNING *`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id', requireAuth, perm('vendors','delete'), async (req, res) => {
  await db.query('DELETE FROM vendors WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
