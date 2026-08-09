import { useEffect, useState, useCallback } from "react";
import { Plus, RefreshCw, Send } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Modal from "../components/ui/Modal";
import { fmtDate } from "../lib/utils";

const CATEGORY_LABELS = {
  hardware_fault: "Hardware Fault",
  performance: "Performance",
  os: "Operating System",
  software: "Software",
  network: "Network",
  printer: "Printer",
  email_gws: "Email / Google Workspace",
};

const PRIORITY_BADGE = {
  urgent: { bg: "rgba(239,68,68,0.15)", color: "#f87171" },
  high: { bg: "rgba(249,115,22,0.15)", color: "#fb923c" },
  normal: { bg: "rgba(59,130,246,0.15)", color: "#7dd3fc" },
  low: { bg: "rgba(113,113,122,0.15)", color: "#a1a1aa" },
};
const STATUS_BADGE = {
  open: { bg: "rgba(59,130,246,0.15)", color: "#7dd3fc" },
  assigned: { bg: "rgba(168,85,247,0.15)", color: "#c4b5fd" },
  in_progress: { bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
  resolved: { bg: "rgba(34,197,94,0.15)", color: "#4ade80" },
  closed: { bg: "rgba(4,120,87,0.15)", color: "#6ee7b7" },
  reopened: { bg: "rgba(249,115,22,0.15)", color: "#fb923c" },
  cancelled: { bg: "rgba(113,113,122,0.15)", color: "#a1a1aa" },
};

const inp = "form-control form-control-sm";
const sel = "form-select form-select-sm";

const EMPTY_FORM = {
  category: "hardware_fault",
  priority: "normal",
  subject: "",
  description: "",
};

function Badge({ map, value }) {
  const s = map[value] || {};
  return (
    <span
      className="badge px-2 py-1"
      style={{ background: s.bg, color: s.color, fontSize: "11px" }}
    >
      {value?.replace(/_/g, " ")}
    </span>
  );
}

export default function Tickets() {
  const { user, canPerm } = useAuth();
  const { toast } = useToast();
  const isIT = user?.role === "super_admin" || canPerm("support", "update");

  const [tab, setTab] = useState(isIT ? "queue" : "mine");
  const [queue, setQueue] = useState([]);
  const [mine, setMine] = useState([]);
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itUsers, setItUsers] = useState([]);

  const [newModal, setNewModal] = useState(false);
  const [detail, setDetail] = useState(null); // full ticket incl. comments
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);
  const [actionInput, setActionInput] = useState(""); // resolve notes / reopen reason
  const [assignTo, setAssignTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isIT) {
        const [q, m, a] = await Promise.all([
          api.get("/api/tickets/queue"),
          api.get("/api/tickets?mine=true"),
          api.get("/api/tickets"),
        ]);
        setQueue(q);
        setMine(m);
        setAll(a);
      } else {
        setMine(await api.get("/api/tickets"));
      }
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [isIT, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(ticket) {
    try {
      const full = await api.get(`/api/tickets/${ticket.id}`);
      setDetail(full);
      setComment("");
      setInternal(false);
      setActionInput("");
      setAssignTo(full.assigned_to || "");
      if (isIT && !itUsers.length) {
        api
          .get("/api/tickets/assignees")
          .then(setItUsers)
          .catch(() => setItUsers([]));
      }
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function refreshDetail(id) {
    const full = await api.get(`/api/tickets/${id}`);
    setDetail(full);
    load();
  }

  async function createTicket() {
    setSaving(true);
    try {
      const created = await api.post("/api/tickets", form);
      toast(`Ticket ${created.ticket_number} filed`, "success");
      setNewModal(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function postComment() {
    if (!comment.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/tickets/${detail.id}/comments`, {
        body: comment,
        is_internal: internal,
      });
      setComment("");
      setInternal(false);
      await refreshDetail(detail.id);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function act(path, body, successMsg) {
    setSaving(true);
    try {
      await api.post(`/api/tickets/${detail.id}/${path}`, body || {});
      toast(successMsg, "success");
      setActionInput("");
      await refreshDetail(detail.id);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  const lists = { queue, mine, all };
  const displayList = lists[tab] || [];
  const isOwner = detail && detail.requester_id === user?.id;

  const tabBtn = (key, label, count) => (
    <button
      onClick={() => setTab(key)}
      className="btn btn-sm rounded-2 fw-medium"
      style={{
        background: tab === key ? "var(--card-bg)" : "transparent",
        color: tab === key ? "inherit" : "#71717a",
        border: "none",
        boxShadow: tab === key ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
      }}
    >
      {label}
      {count > 0 && (
        <span
          className="badge bg-primary ms-1 px-1 py-0"
          style={{ fontSize: "11px" }}
        >
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="d-flex flex-column gap-4">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between">
        <div>
          <h5 className="fw-bold mb-1">Support Tickets</h5>
          <p className="small text-secondary mb-0">
            IT complaints, faults and support requests
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            onClick={load}
            className="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center"
            style={{ width: 32, height: 32, padding: 0 }}
          >
            <RefreshCw size={14} />
          </button>
          {canPerm("support", "create") && (
            <button
              onClick={() => setNewModal(true)}
              className="btn btn-primary btn-sm d-flex align-items-center gap-1"
            >
              <Plus size={14} /> New Ticket
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        className="d-flex gap-1 p-1 rounded-3"
        style={{ background: "rgba(113,113,122,0.15)", width: "fit-content" }}
      >
        {isIT && tabBtn("queue", "Queue", queue.length)}
        {tabBtn("mine", "My Tickets", 0)}
        {isIT && tabBtn("all", "All Tickets", 0)}
      </div>

      {/* List */}
      <div className="itms-card overflow-hidden">
        {loading ? (
          <div className="text-center text-secondary py-5 small">Loading…</div>
        ) : displayList.length === 0 ? (
          <div className="text-center text-secondary py-5 small">
            {tab === "queue" ? "No open tickets" : "No tickets yet"}
          </div>
        ) : (
          displayList.map((t) => (
            <div key={t.id} className="px-3 py-3 border-bottom">
              <div className="d-flex align-items-start justify-content-between gap-3">
                <div className="min-w-0 flex-grow-1">
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span className="font-monospace small fw-semibold">
                      {t.ticket_number}
                    </span>
                    <Badge map={STATUS_BADGE} value={t.status} />
                    <Badge map={PRIORITY_BADGE} value={t.priority} />
                    <span
                      className="badge bg-secondary bg-opacity-25 text-secondary"
                      style={{ fontSize: "11px" }}
                    >
                      {CATEGORY_LABELS[t.category] || t.category}
                    </span>
                  </div>
                  <div className="fw-medium small mt-1">{t.subject}</div>
                  <div
                    className="text-secondary mt-1"
                    style={{ fontSize: "0.75rem" }}
                  >
                    {t.requester_name}
                    {t.requester_department && ` · ${t.requester_department}`}
                    {t.assignee_name && ` → ${t.assignee_name}`}
                    {" · "}
                    {fmtDate(t.created_at)}
                  </div>
                </div>
                <button
                  onClick={() => openDetail(t)}
                  className="btn btn-outline-secondary btn-sm px-2 py-1 flex-shrink-0"
                  style={{ fontSize: "0.75rem" }}
                >
                  View
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Ticket Modal */}
      <Modal
        open={newModal}
        onClose={() => setNewModal(false)}
        title="New Ticket"
      >
        <div className="d-flex flex-column gap-2">
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label small fw-medium mb-1">
                Category *
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
                className={sel}
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium mb-1">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: e.target.value }))
                }
                className={sel}
              >
                {["low", "normal", "high", "urgent"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="col-12">
              <label className="form-label small fw-medium mb-1">
                Subject *
              </label>
              <input
                value={form.subject}
                onChange={(e) =>
                  setForm((f) => ({ ...f, subject: e.target.value }))
                }
                placeholder="One line summary"
                className={inp}
                maxLength={200}
              />
            </div>
            <div className="col-12">
              <label className="form-label small fw-medium mb-1">
                Description *
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={4}
                placeholder="What happened? Since when? What have you tried?"
                className={inp}
                style={{ resize: "none" }}
              />
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 pt-1">
            <button
              onClick={() => setNewModal(false)}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              onClick={createTicket}
              disabled={
                saving || !form.subject.trim() || !form.description.trim()
              }
              className="btn btn-primary btn-sm"
            >
              {saving ? "Filing…" : "File Ticket"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? detail.ticket_number : ""}
      >
        {detail && (
          <div className="d-flex flex-column gap-3">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <Badge map={STATUS_BADGE} value={detail.status} />
              <Badge map={PRIORITY_BADGE} value={detail.priority} />
              <span
                className="badge bg-secondary bg-opacity-25 text-secondary"
                style={{ fontSize: "11px" }}
              >
                {CATEGORY_LABELS[detail.category] || detail.category}
              </span>
              <span className="small text-secondary ms-auto">
                {detail.requester_name}
                {detail.requester_department &&
                  ` · ${detail.requester_department}`}
              </span>
            </div>
            <div>
              <div className="fw-semibold">{detail.subject}</div>
              <p className="small text-secondary mb-0 mt-1">
                {detail.description}
              </p>
            </div>
            {detail.resolution_notes && (
              <div
                className="p-2 rounded-2 small"
                style={{ background: "rgba(34,197,94,0.08)", color: "#4ade80" }}
              >
                Resolution: {detail.resolution_notes}
              </div>
            )}

            {/* Comments */}
            <div>
              <div
                className="fw-semibold text-secondary text-uppercase mb-2"
                style={{ fontSize: "0.7rem", letterSpacing: "0.08em" }}
              >
                Comments
              </div>
              {!detail.comments?.length ? (
                <p className="small text-secondary mb-2">No comments yet</p>
              ) : (
                <div
                  className="d-flex flex-column gap-2 mb-2"
                  style={{ maxHeight: 220, overflowY: "auto" }}
                >
                  {detail.comments.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-2 px-2 py-1"
                      style={{
                        background: c.is_internal
                          ? "rgba(245,158,11,0.08)"
                          : "rgba(255,255,255,0.03)",
                        border: "1px solid var(--bs-border-color)",
                      }}
                    >
                      <div
                        className="text-secondary d-flex gap-2"
                        style={{ fontSize: "0.7rem" }}
                      >
                        <span className="fw-medium">{c.author_label}</span>
                        <span>{fmtDate(c.created_at)}</span>
                        {c.is_internal && (
                          <span style={{ color: "#fbbf24" }}>internal</span>
                        )}
                      </div>
                      <div className="small">{c.body}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="d-flex gap-2 align-items-start">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  placeholder="Write a comment…"
                  className={inp}
                  style={{ resize: "none" }}
                />
                <button
                  onClick={postComment}
                  disabled={saving || !comment.trim()}
                  className="btn btn-primary btn-sm"
                  style={{ height: 32 }}
                >
                  <Send size={13} />
                </button>
              </div>
              {isIT && (
                <label
                  className="d-flex align-items-center gap-1 small text-secondary mt-1"
                  style={{ cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                  />
                  Internal note (hidden from requester)
                </label>
              )}
            </div>

            {/* Actions */}
            <div
              className="d-flex flex-column gap-2 pt-2"
              style={{ borderTop: "1px solid var(--bs-border-color)" }}
            >
              {isIT &&
                ["open", "reopened", "assigned", "in_progress"].includes(
                  detail.status,
                ) && (
                  <div className="d-flex gap-2">
                    <select
                      value={assignTo}
                      onChange={(e) => setAssignTo(e.target.value)}
                      className={sel}
                      style={{ flex: 1 }}
                    >
                      <option value="">Assign to…</option>
                      {itUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name || u.email}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() =>
                        act(
                          "assign",
                          { assigned_to: Number(assignTo) },
                          "Ticket assigned",
                        )
                      }
                      disabled={saving || !assignTo}
                      className="btn btn-outline-primary btn-sm"
                    >
                      Assign
                    </button>
                    {detail.status === "assigned" && (
                      <button
                        onClick={() => act("start", null, "Work started")}
                        disabled={saving}
                        className="btn btn-outline-warning btn-sm"
                      >
                        Start
                      </button>
                    )}
                  </div>
                )}
              {isIT &&
                ["assigned", "in_progress", "reopened"].includes(
                  detail.status,
                ) && (
                  <div className="d-flex gap-2">
                    <input
                      value={actionInput}
                      onChange={(e) => setActionInput(e.target.value)}
                      placeholder="Resolution notes (required)"
                      className={inp}
                      style={{ flex: 1 }}
                    />
                    <button
                      onClick={() =>
                        act(
                          "resolve",
                          { resolution_notes: actionInput },
                          "Ticket resolved",
                        )
                      }
                      disabled={saving || !actionInput.trim()}
                      className="btn btn-success btn-sm"
                    >
                      Resolve
                    </button>
                  </div>
                )}
              {detail.status === "resolved" && (
                <button
                  onClick={() => act("close", null, "Ticket closed")}
                  disabled={saving}
                  className="btn btn-outline-success btn-sm align-self-start"
                >
                  Confirm &amp; Close
                </button>
              )}
              {["resolved", "closed"].includes(detail.status) && (
                <div className="d-flex gap-2">
                  <input
                    value={actionInput}
                    onChange={(e) => setActionInput(e.target.value)}
                    placeholder="Why reopen?"
                    className={inp}
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={() =>
                      act("reopen", { reason: actionInput }, "Ticket reopened")
                    }
                    disabled={saving || !actionInput.trim()}
                    className="btn btn-outline-warning btn-sm"
                  >
                    Reopen
                  </button>
                </div>
              )}
              {((isOwner && ["open", "assigned"].includes(detail.status)) ||
                (isIT &&
                  ["open", "assigned", "in_progress", "reopened"].includes(
                    detail.status,
                  ))) && (
                <button
                  onClick={() => act("cancel", null, "Ticket cancelled")}
                  disabled={saving}
                  className="btn btn-outline-danger btn-sm align-self-start"
                >
                  Cancel Ticket
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
