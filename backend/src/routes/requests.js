const router = require('express').Router();
const db = require('../config/db');
const { requireAuth, perm } = require('../middleware/auth');
const { checkAlerts } = require('./inventory');

async function log(userId, action, id, label, details) {
  await db.query(
    'INSERT INTO activity_log (user_id,action,table_name,record_id,record_label,details) VALUES ($1,$2,$3,$4,$5,$6)',
    [userId, action, 'inv_requests', id, label, details]
  );
}

async function nextReqNumber() {
  const r = await db.query("SELECT nextval('inv_req_seq') AS n");
  const year = new Date().getFullYear();
  return `REQ-${year}-${String(r.rows[0].n).padStart(4, '0')}`;
}

const REQUEST_DETAIL_SQL = `
  SELECT r.*,
         u.name  AS requester_name,
         u.email AS requester_email,
         rv.name AS reviewed_by_name,
         fu.name AS fulfilled_by_name
  FROM inv_requests r
  JOIN users u  ON u.id  = r.requester_id
  LEFT JOIN users rv ON rv.id = r.reviewed_by
  LEFT JOIN users fu ON fu.id = r.fulfilled_by`;

const ITEMS_SQL = `
  SELECT ri.*, i.name AS item_name, i.unit, i.tracking_type,
         c.name AS category_name,
         s.qty_available
  FROM inv_request_items ri
  JOIN inv_items i ON i.id = ri.item_id
  LEFT JOIN inv_categories c ON c.id = i.category_id
  LEFT JOIN inv_stock s ON s.item_id = i.id
  WHERE ri.request_id = $1
  ORDER BY ri.id`;

// ── LIST ──────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, mine } = req.query;
    const isSuperAdmin = req.user.role === 'super_admin';
    const isIT = isSuperAdmin || req.user.role === 'user';

    let sql = `${REQUEST_DETAIL_SQL} WHERE 1=1`;
    const params = [];

    // Regular users only see their own requests unless IT/admin
    if (!isIT || mine === 'true') {
      params.push(req.user.id);
      sql += ` AND r.requester_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND r.status = $${params.length}`;
    }
    sql += ' ORDER BY r.created_at DESC';

    const r = await db.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/queue', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `${REQUEST_DETAIL_SQL}
       WHERE r.status IN ('submitted','in_review','approved')
       ORDER BY
         CASE r.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
         r.created_at ASC`
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/count', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      "SELECT COUNT(*) FROM inv_requests WHERE status IN ('submitted','in_review','approved')"
    );
    res.json({ count: parseInt(r.rows[0].count) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET SINGLE ────────────────────────────────────────────

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`${REQUEST_DETAIL_SQL} WHERE r.id=$1`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    const req_row = r.rows[0];
    const items = await db.query(ITEMS_SQL, [req.params.id]);
    res.json({ ...req_row, items: items.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CREATE ────────────────────────────────────────────────

router.post('/', requireAuth, async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { items, priority, reason, required_by } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'At least one item is required' });

    const req_number = await nextReqNumber();
    const rr = await client.query(
      `INSERT INTO inv_requests (req_number, requester_id, priority, status, reason, required_by)
       VALUES ($1,$2,$3,'submitted',$4,$5) RETURNING *`,
      [req_number, req.user.id, priority || 'normal', reason || null, required_by || null]
    );
    const request = rr.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO inv_request_items (request_id, item_id, qty_requested, notes)
         VALUES ($1,$2,$3,$4)`,
        [request.id, item.item_id, item.qty || 1, item.notes || null]
      );
    }
    await client.query('COMMIT');
    await log(req.user.id, 'CREATE', request.id, req_number, `${items.length} item(s) requested`);
    res.json(request);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ── REVIEW (approve / reject) ─────────────────────────────

router.post('/:id/review', requireAuth, perm('inventory', 'update'), async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { decisions, review_notes } = req.body;
    // decisions: [{ request_item_id, action: 'approved'|'rejected', qty_approved, rejection_reason }]

    const reqRow = await client.query('SELECT * FROM inv_requests WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!reqRow.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    if (!['submitted','in_review'].includes(reqRow.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Request cannot be reviewed in current status' });
    }

    for (const d of (decisions || [])) {
      await client.query(
        `UPDATE inv_request_items SET item_status=$1, qty_approved=$2, rejection_reason=$3
         WHERE id=$4 AND request_id=$5`,
        [d.action, d.action === 'approved' ? (d.qty_approved || 0) : 0,
         d.rejection_reason || null, d.request_item_id, req.params.id]
      );
    }

    // Determine overall request status
    const items = await client.query(
      'SELECT id, item_id, item_status, qty_approved FROM inv_request_items WHERE request_id=$1', [req.params.id]
    );
    const all = items.rows;
    const allRejected = all.every(i => i.item_status === 'rejected');
    const allApproved = all.every(i => i.item_status === 'approved');
    const newStatus = allRejected ? 'rejected' : allApproved ? 'approved' : 'partially_approved';

    // Reserve stock for approved items
    if (!allRejected) {
      for (const item of all.filter(i => i.item_status === 'approved' && i.qty_approved > 0)) {
        await client.query(
          `UPDATE inv_stock SET qty_reserved = qty_reserved + $1, updated_at=NOW() WHERE item_id=$2`,
          [item.qty_approved, item.item_id]
        );
      }
    }

    await client.query(
      `UPDATE inv_requests SET status=$1, reviewed_by=$2, reviewed_at=NOW(), review_notes=$3, updated_at=NOW()
       WHERE id=$4`,
      [newStatus, req.user.id, review_notes || null, req.params.id]
    );

    await client.query('COMMIT');
    await log(req.user.id, 'REVIEW', parseInt(req.params.id), reqRow.rows[0].req_number, `Status → ${newStatus}`);
    res.json({ ok: true, status: newStatus });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ── FULFILL (deduct stock, create assignment) ─────────────

router.post('/:id/fulfill', requireAuth, perm('inventory', 'update'), async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { assignee_id, expected_return_date, notes } = req.body;
    if (!assignee_id) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'assignee_id required' }); }

    const reqRow = await client.query('SELECT * FROM inv_requests WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!reqRow.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    if (!['approved','partially_approved'].includes(reqRow.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Request must be approved before fulfillment' });
    }

    const approvedItems = await client.query(
      `SELECT ri.*, i.name AS item_name FROM inv_request_items ri
       JOIN inv_items i ON i.id = ri.item_id
       WHERE ri.request_id=$1 AND ri.item_status='approved' AND ri.qty_approved > 0`,
      [req.params.id]
    );
    if (!approvedItems.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No approved items to fulfill' });
    }

    // Verify + deduct stock atomically
    for (const item of approvedItems.rows) {
      const s = await client.query('SELECT * FROM inv_stock WHERE item_id=$1 FOR UPDATE', [item.item_id]);
      const stock = s.rows[0];
      if (!stock || stock.qty_available < item.qty_approved) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Insufficient stock for: ${item.item_name}` });
      }
      await client.query(
        `UPDATE inv_stock SET
           qty_available = qty_available - $1,
           qty_reserved  = GREATEST(0, qty_reserved - $1),
           qty_assigned  = qty_assigned + $1,
           updated_at    = NOW()
         WHERE item_id = $2`,
        [item.qty_approved, item.item_id]
      );
      await client.query(
        `INSERT INTO inv_adjustments (item_id, type, qty_change, reference_type, reference_id, notes, performed_by)
         VALUES ($1,'assignment',$2,'inv_requests',$3,$4,$5)`,
        [item.item_id, -item.qty_approved, req.params.id, `Fulfilled for ${reqRow.rows[0].req_number}`, req.user.id]
      );
    }

    // Create assignment
    const asnNum = await (async () => {
      const r = await client.query("SELECT nextval('inv_asn_seq') AS n");
      return `ASN-${new Date().getFullYear()}-${String(r.rows[0].n).padStart(4,'0')}`;
    })();

    const asnRow = await client.query(
      `INSERT INTO inv_assignments (asn_number, request_id, assignee_id, assigned_by, expected_return_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [asnNum, req.params.id, assignee_id, req.user.id, expected_return_date || null, notes || null]
    );
    const asn = asnRow.rows[0];

    for (const item of approvedItems.rows) {
      await client.query(
        `INSERT INTO inv_assignment_items (assignment_id, item_id, qty) VALUES ($1,$2,$3)`,
        [asn.id, item.item_id, item.qty_approved]
      );
    }

    await client.query(
      `UPDATE inv_requests SET status='fulfilled', fulfilled_by=$1, fulfilled_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [req.user.id, req.params.id]
    );

    await client.query('COMMIT');

    // Check alerts async
    for (const item of approvedItems.rows) await checkAlerts(item.item_id);

    await log(req.user.id, 'FULFILL', parseInt(req.params.id), reqRow.rows[0].req_number,
      `Assignment ${asnNum} created for employee #${assignee_id}`);

    res.json({ ok: true, assignment: asn });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ── CANCEL ────────────────────────────────────────────────

router.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM inv_requests WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    const row = r.rows[0];

    // Only requester or admin can cancel
    if (row.requester_id !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (['fulfilled','cancelled','rejected'].includes(row.status)) {
      return res.status(400).json({ error: 'Cannot cancel in current status' });
    }

    // Release any reserved stock
    if (['approved','partially_approved'].includes(row.status)) {
      const items = await db.query(
        "SELECT * FROM inv_request_items WHERE request_id=$1 AND item_status='approved'",
        [req.params.id]
      );
      for (const item of items.rows) {
        await db.query(
          'UPDATE inv_stock SET qty_reserved=GREATEST(0,qty_reserved-$1) WHERE item_id=$2',
          [item.qty_approved, item.item_id]
        );
      }
    }

    await db.query(
      "UPDATE inv_requests SET status='cancelled', updated_at=NOW() WHERE id=$1", [req.params.id]
    );
    await log(req.user.id, 'CANCEL', parseInt(req.params.id), row.req_number, 'Cancelled');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
