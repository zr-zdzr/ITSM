/**
 * Support tickets (support-module-architecture.md, Phase 1).
 *
 * Authorization model: tickets carry user-written complaint text, so reads
 * are owner-or-IT scoped — an unknown or foreign id answers 404, never 403,
 * to keep ticket ids unprobeable. "IT" means super_admin, or a 'user' with
 * support.can_update. There is deliberately no delete endpoint: cancel and
 * close are the terminal states, and a recycled ticket would silently lose
 * its cascaded comments.
 */
const router = require("express").Router();
const db = require("../config/db");
const { requireAuth, perm, hasPerm } = require("../middleware/auth");
const { logActivity, getIP } = require("../utils/activity");

const QUEUE_STATUSES = ["open", "assigned", "in_progress", "reopened"];

async function log(userId, action, id, label, details, ip) {
  await logActivity(userId, action, "support_tickets", id, label, details, ip);
}

async function nextTicketNumber() {
  const r = await db.query("SELECT nextval('support_ticket_seq') AS n");
  return `BYK-TICK-${new Date().getFullYear()}-${String(r.rows[0].n).padStart(4, "0")}`;
}

async function isIT(user) {
  if (user.role === "super_admin") return true;
  if (user.role !== "user") return false;
  return hasPerm(user, "support", "update");
}

const DETAIL_SQL = `
  SELECT t.*,
         r.name AS requester_name, r.email AS requester_email,
         a.name AS assignee_name
  FROM support_tickets t
  JOIN users r ON r.id = t.requester_id
  LEFT JOIN users a ON a.id = t.assigned_to`;

async function fetchTicket(id) {
  const r = await db.query(`${DETAIL_SQL} WHERE t.id = $1`, [id]);
  return r.rows[0];
}

// ── LISTS ─────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const it = await isIT(req.user);
    const mineOnly = !it || req.query.mine === "true";
    const params = [];
    let sql = `${DETAIL_SQL} WHERE 1=1`;
    if (mineOnly) {
      params.push(req.user.id);
      sql += ` AND t.requester_id = $${params.length}`;
    }
    if (req.query.status) {
      params.push(req.query.status);
      sql += ` AND t.status = $${params.length}`;
    }
    sql += " ORDER BY t.created_at DESC";
    res.json((await db.query(sql, params)).rows);
  } catch (e) {
    next(e);
  }
});

router.get("/queue", requireAuth, async (req, res, next) => {
  try {
    if (!(await isIT(req.user)))
      return res.status(403).json({ error: "Permission denied" });
    const r = await db.query(
      `${DETAIL_SQL}
       WHERE t.status = ANY($1)
       ORDER BY CASE t.priority
                  WHEN 'urgent' THEN 0 WHEN 'high' THEN 1
                  WHEN 'normal' THEN 2 ELSE 3 END,
                t.created_at ASC`,
      [QUEUE_STATUSES],
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

// Badge count — scoped server-side so one endpoint serves both audiences and
// a plain requester never learns the size of the org-wide backlog.
router.get("/count", requireAuth, async (req, res, next) => {
  try {
    const it = await isIT(req.user);
    const r = it
      ? await db.query(
          `SELECT COUNT(*)::int AS count FROM support_tickets WHERE status = ANY($1)`,
          [QUEUE_STATUSES],
        )
      : await db.query(
          `SELECT COUNT(*)::int AS count FROM support_tickets
           WHERE requester_id = $1 AND status = ANY($2)`,
          [req.user.id, QUEUE_STATUSES],
        );
    res.json({ count: r.rows[0].count });
  } catch (e) {
    next(e);
  }
});

// Who a ticket may be assigned to — needed because /api/users is admin-only
// and IT agents with the plain 'user' role must still populate the picker.
router.get("/assignees", requireAuth, async (req, res, next) => {
  try {
    if (!(await isIT(req.user)))
      return res.status(403).json({ error: "Permission denied" });
    const r = await db.query(
      `SELECT u.id, u.name, u.email FROM users u
       WHERE u.is_active AND (
         u.role = 'super_admin' OR (
           u.role = 'user' AND EXISTS (
             SELECT 1 FROM user_permissions p
             WHERE p.user_id = u.id AND p.module = 'support' AND p.can_update
           )
         )
       )
       ORDER BY u.name`,
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const ticket = await fetchTicket(req.params.id);
    const it = await isIT(req.user);
    if (!ticket || (!it && ticket.requester_id !== req.user.id))
      return res.status(404).json({ error: "Not found" });
    const comments = await db.query(
      `SELECT * FROM ticket_comments
       WHERE ticket_id = $1 ${it ? "" : "AND is_internal = false"}
       ORDER BY created_at ASC`,
      [ticket.id],
    );
    res.json({ ...ticket, comments: comments.rows });
  } catch (e) {
    next(e);
  }
});

// ── CREATE ────────────────────────────────────────────────

router.post(
  "/",
  requireAuth,
  perm("support", "create"),
  async (req, res, next) => {
    try {
      const { category, priority, subject, description, asset_type, asset_id } =
        req.body;
      if (!category)
        return res.status(400).json({ error: "category is required" });
      if (!subject?.trim())
        return res.status(400).json({ error: "subject is required" });
      if (!description?.trim())
        return res.status(400).json({ error: "description is required" });

      // Snapshot who this was for at file time — departments change, and the
      // audit convention is that a record keeps what was true when written.
      const emp = await db.query(
        "SELECT id, department FROM employees WHERE portal_user_id = $1",
        [req.user.id],
      );
      const number = await nextTicketNumber();
      const r = await db.query(
        `INSERT INTO support_tickets
           (ticket_number, category, priority, subject, description,
            requester_id, requester_employee_id, requester_department,
            asset_type, asset_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          number,
          category,
          priority || "normal",
          subject.trim(),
          description.trim(),
          req.user.id,
          emp.rows[0]?.id || null,
          emp.rows[0]?.department || req.user.department || null,
          asset_type || null,
          asset_id || null,
        ],
      );
      await log(
        req.user.id,
        "created",
        r.rows[0].id,
        number,
        `Ticket filed: ${category} — ${subject.trim()}`,
        getIP(req),
      );
      res.status(201).json(r.rows[0]);
    } catch (e) {
      next(e);
    }
  },
);

// ── COMMENTS ──────────────────────────────────────────────

router.post("/:id/comments", requireAuth, async (req, res, next) => {
  try {
    const ticket = await fetchTicket(req.params.id);
    const it = await isIT(req.user);
    if (!ticket || (!it && ticket.requester_id !== req.user.id))
      return res.status(404).json({ error: "Not found" });
    if (!req.body.body?.trim())
      return res.status(400).json({ error: "Comment body is required" });
    if (["closed", "cancelled"].includes(ticket.status) && !it)
      return res
        .status(400)
        .json({ error: "This ticket is closed — reopen it to comment" });

    // Non-IT authors can never write internal notes; coerce silently rather
    // than leak that the flag exists.
    const internal = it && req.body.is_internal === true;
    const r = await db.query(
      `INSERT INTO ticket_comments (ticket_id, author_id, author_label, body, is_internal)
       VALUES ($1, $2, (SELECT COALESCE(name, email) FROM users WHERE id = $2), $3, $4)
       RETURNING *`,
      [ticket.id, req.user.id, req.body.body.trim(), internal],
    );
    await log(
      req.user.id,
      "commented",
      ticket.id,
      ticket.ticket_number,
      internal ? "Internal note added" : "Comment added",
      getIP(req),
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// ── TRANSITIONS ───────────────────────────────────────────

// Shared shape: re-read the row, check who may act and from which states,
// apply, log. 400 on a bad starting state, 404 on not-yours.
function transition({ action, from, allow, apply, details }) {
  return async (req, res, next) => {
    try {
      const ticket = await fetchTicket(req.params.id);
      const it = await isIT(req.user);
      const owner = ticket && ticket.requester_id === req.user.id;
      if (!ticket || (!it && !owner))
        return res.status(404).json({ error: "Not found" });
      const gate = await allow({ req, ticket, it, owner });
      if (gate !== true)
        return res
          .status(gate?.status || 403)
          .json({ error: gate?.error || "Permission denied" });
      if (!from.includes(ticket.status))
        return res.status(400).json({
          error: `Cannot ${action} a ticket that is ${ticket.status}`,
        });
      const updated = await apply({ req, ticket });
      await log(
        req.user.id,
        action,
        ticket.id,
        ticket.ticket_number,
        details({ req, ticket, updated }),
        getIP(req),
      );
      res.json(updated);
    } catch (e) {
      next(e);
    }
  };
}

router.post(
  "/:id/assign",
  requireAuth,
  transition({
    action: "assigned",
    from: ["open", "reopened", "assigned", "in_progress"],
    allow: async ({ req, it }) => {
      if (!it) return { status: 403, error: "Permission denied" };
      const target = await db.query("SELECT * FROM users WHERE id=$1", [
        req.body.assigned_to,
      ]);
      if (!target.rows[0] || !(await isIT(target.rows[0])))
        return { status: 400, error: "Assignee must be an IT user" };
      return true;
    },
    apply: async ({ req, ticket }) => {
      const r = await db.query(
        `UPDATE support_tickets SET assigned_to=$1, assigned_at=NOW(),
                status = CASE WHEN status IN ('open','reopened') THEN 'assigned' ELSE status END,
                updated_at=NOW()
         WHERE id=$2 RETURNING *`,
        [req.body.assigned_to, ticket.id],
      );
      return r.rows[0];
    },
    details: ({ updated }) => `Assigned to user #${updated.assigned_to}`,
  }),
);

router.post(
  "/:id/start",
  requireAuth,
  transition({
    action: "started",
    from: ["assigned"],
    allow: async ({ req, ticket, it }) =>
      it || ticket.assigned_to === req.user.id
        ? true
        : { status: 403, error: "Permission denied" },
    apply: async ({ ticket }) => {
      const r = await db.query(
        `UPDATE support_tickets SET status='in_progress', updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [ticket.id],
      );
      return r.rows[0];
    },
    details: () => "Work started",
  }),
);

router.post(
  "/:id/resolve",
  requireAuth,
  transition({
    action: "resolved",
    from: ["assigned", "in_progress", "reopened"],
    allow: async ({ req, it }) => {
      if (!it) return { status: 403, error: "Permission denied" };
      if (!req.body.resolution_notes?.trim())
        return { status: 400, error: "resolution_notes is required" };
      return true;
    },
    apply: async ({ req, ticket }) => {
      const r = await db.query(
        `UPDATE support_tickets SET status='resolved', resolution_notes=$1,
                resolved_by=$2, resolved_at=NOW(), updated_at=NOW()
         WHERE id=$3 RETURNING *`,
        [req.body.resolution_notes.trim(), req.user.id, ticket.id],
      );
      return r.rows[0];
    },
    details: ({ req }) => `Resolved: ${req.body.resolution_notes.trim()}`,
  }),
);

router.post(
  "/:id/close",
  requireAuth,
  transition({
    action: "closed",
    from: ["resolved"],
    allow: async () => true, // owner-or-IT already enforced by transition()
    apply: async ({ ticket }) => {
      const r = await db.query(
        `UPDATE support_tickets SET status='closed', closed_at=NOW(), updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [ticket.id],
      );
      return r.rows[0];
    },
    details: () => "Ticket closed",
  }),
);

router.post(
  "/:id/reopen",
  requireAuth,
  transition({
    action: "reopened",
    from: ["resolved", "closed"],
    allow: async ({ req }) =>
      req.body.reason?.trim()
        ? true
        : { status: 400, error: "A reason is required to reopen" },
    apply: async ({ req, ticket }) => {
      const r = await db.query(
        `UPDATE support_tickets SET status='reopened', closed_at=NULL, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [ticket.id],
      );
      await db.query(
        `INSERT INTO ticket_comments (ticket_id, author_id, author_label, body)
         VALUES ($1, $2, (SELECT COALESCE(name, email) FROM users WHERE id = $2), $3)`,
        [ticket.id, req.user.id, `Reopened: ${req.body.reason.trim()}`],
      );
      return r.rows[0];
    },
    details: ({ req }) => `Reopened: ${req.body.reason.trim()}`,
  }),
);

router.post(
  "/:id/cancel",
  requireAuth,
  transition({
    action: "cancelled",
    from: ["open", "assigned", "in_progress", "reopened"],
    allow: async ({ ticket, it, owner }) => {
      // Requesters may withdraw only before work is underway; IT may cancel
      // anything not yet resolved.
      if (it) return true;
      if (owner && ["open", "assigned"].includes(ticket.status)) return true;
      return {
        status: 400,
        error: "Work is underway — ask IT to cancel this ticket",
      };
    },
    apply: async ({ ticket }) => {
      const r = await db.query(
        `UPDATE support_tickets SET status='cancelled', updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [ticket.id],
      );
      return r.rows[0];
    },
    details: () => "Ticket cancelled",
  }),
);

module.exports = router;
