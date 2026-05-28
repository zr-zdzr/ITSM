import React, { useEffect, useState, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Send,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Modal from "../components/ui/Modal";
import { cn } from "../lib/utils";

const PRIORITY_BADGE = {
  urgent: { bg: "rgba(239,68,68,0.15)", color: "#f87171" },
  high: { bg: "rgba(249,115,22,0.15)", color: "#fb923c" },
  normal: { bg: "rgba(59,130,246,0.15)", color: "#7dd3fc" },
  low: { bg: "rgba(113,113,122,0.15)", color: "#a1a1aa" },
};
const STATUS_BADGE = {
  submitted: { bg: "rgba(59,130,246,0.15)", color: "#7dd3fc" },
  in_review: { bg: "rgba(168,85,247,0.15)", color: "#c4b5fd" },
  approved: { bg: "rgba(34,197,94,0.15)", color: "#4ade80" },
  partially_approved: { bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
  rejected: { bg: "rgba(239,68,68,0.15)", color: "#f87171" },
  fulfilled: { bg: "rgba(4,120,87,0.15)", color: "#6ee7b7" },
  cancelled: { bg: "rgba(113,113,122,0.15)", color: "#a1a1aa" },
};

const inp = "form-control form-control-sm";
const sel = "form-select form-select-sm";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Requests() {
  const { user, canPerm } = useAuth();
  const { toast } = useToast();
  const isIT = user?.role === "super_admin" || canPerm("inventory", "update");

  const [tab, setTab] = useState(isIT ? "queue" : "mine");
  const [requests, setRequests] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [newModal, setNewModal] = useState(false);
  const [reviewModal, setReviewModal] = useState(null);
  const [fulfillModal, setFulfillModal] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const [newForm, setNewForm] = useState({
    priority: "normal",
    reason: "",
    required_by: "",
  });
  const [cartItems, setCartItems] = useState([
    { item_id: "", qty: 1, notes: "" },
  ]);

  const [reviewDecisions, setReviewDecisions] = useState({});
  const [reviewNotes, setReviewNotes] = useState("");
  const [fulfillForm, setFulfillForm] = useState({
    assignee_id: "",
    notes: "",
    expected_return_date: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isIT) {
        const [queue, mine, all] = await Promise.all([
          api.get("/api/requests/queue"),
          api.get("/api/requests?mine=true"),
          api.get("/api/requests"),
        ]);
        setRequests(queue);
        setMyRequests(mine);
        setAllRequests(all);
      } else {
        const mine = await api.get("/api/requests?mine=true");
        setMyRequests(mine);
      }
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [isIT]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (newModal) {
      api
        .get("/api/inventory/items")
        .then(setItems)
        .catch(() => {});
    }
  }, [newModal]);

  useEffect(() => {
    if (fulfillModal) {
      api
        .get("/api/employees")
        .then(setEmployees)
        .catch(() => {});
    }
  }, [fulfillModal]);

  async function openReview(req) {
    try {
      const full = await api.get(`/api/requests/${req.id}`);
      const decisions = {};
      for (const ri of full.items) {
        decisions[ri.id] = {
          action: ri.item_status === "rejected" ? "rejected" : "approved",
          qty_approved: ri.qty_requested,
          rejection_reason: "",
        };
      }
      setReviewDecisions(decisions);
      setReviewNotes("");
      setReviewModal(full);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function openDetail(req) {
    try {
      const full = await api.get(`/api/requests/${req.id}`);
      setDetailModal(full);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function submitRequest() {
    setSaving(true);
    try {
      const validItems = cartItems.filter((i) => i.item_id && i.qty > 0);
      if (!validItems.length) return toast("Add at least one item", "error");
      await api.post("/api/requests", { ...newForm, items: validItems });
      toast("Request submitted", "success");
      setNewModal(false);
      setNewForm({ priority: "normal", reason: "", required_by: "" });
      setCartItems([{ item_id: "", qty: 1, notes: "" }]);
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function submitReview() {
    setSaving(true);
    try {
      const decisions = Object.entries(reviewDecisions).map(([id, d]) => ({
        request_item_id: parseInt(id),
        ...d,
      }));
      await api.post(`/api/requests/${reviewModal.id}/review`, {
        decisions,
        review_notes: reviewNotes,
      });
      toast("Review submitted", "success");
      setReviewModal(null);
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function submitFulfill() {
    setSaving(true);
    try {
      if (!fulfillForm.assignee_id) return toast("Select an employee", "error");
      await api.post(`/api/requests/${fulfillModal.id}/fulfill`, fulfillForm);
      toast("Request fulfilled — assignment created", "success");
      setFulfillModal(null);
      setFulfillForm({ assignee_id: "", notes: "", expected_return_date: "" });
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function cancelRequest(req) {
    if (!confirm(`Cancel request ${req.req_number}?`)) return;
    try {
      await api.post(`/api/requests/${req.id}/cancel`, {});
      toast("Request cancelled", "success");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  function addCartItem() {
    setCartItems((c) => [...c, { item_id: "", qty: 1, notes: "" }]);
  }
  function removeCartItem(i) {
    setCartItems((c) => c.filter((_, idx) => idx !== i));
  }
  function updateCartItem(i, k, v) {
    setCartItems((c) =>
      c.map((item, idx) => (idx === i ? { ...item, [k]: v } : item)),
    );
  }

  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const fullList =
    tab === "queue" ? requests : tab === "all" ? allRequests : myRequests;
  const displayList = fullList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(fullList.length / PAGE_SIZE));

  React.useEffect(() => {
    setPage(1);
  }, [tab]);

  return (
    <div className="d-flex flex-column gap-4">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between">
        <div>
          <h5 className="fw-bold mb-1">Requests</h5>
          <p className="small text-secondary mb-0">
            Item requests, approvals and fulfillment
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
          <button
            onClick={() => setNewModal(true)}
            className="btn btn-primary btn-sm d-flex align-items-center gap-1"
          >
            <Plus size={14} /> New Request
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="d-flex gap-1 p-1 rounded-3"
        style={{ background: "rgba(113,113,122,0.15)", width: "fit-content" }}
      >
        {isIT && (
          <button
            onClick={() => setTab("queue")}
            className="btn btn-sm rounded-2 fw-medium"
            style={{
              background: tab === "queue" ? "var(--card-bg)" : "transparent",
              color: tab === "queue" ? "inherit" : "#71717a",
              border: "none",
              boxShadow: tab === "queue" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            Request Queue
            {requests.length > 0 && (
              <span
                className="badge bg-primary ms-1 px-1 py-0"
                style={{ fontSize: "11px" }}
              >
                {requests.length}
              </span>
            )}
          </button>
        )}
        <button
          onClick={() => setTab("mine")}
          className="btn btn-sm rounded-2 fw-medium"
          style={{
            background: tab === "mine" ? "var(--card-bg)" : "transparent",
            color: tab === "mine" ? "inherit" : "#71717a",
            border: "none",
            boxShadow: tab === "mine" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}
        >
          My Requests
        </button>
        {isIT && (
          <button
            onClick={() => setTab("all")}
            className="btn btn-sm rounded-2 fw-medium"
            style={{
              background: tab === "all" ? "var(--card-bg)" : "transparent",
              color: tab === "all" ? "inherit" : "#71717a",
              border: "none",
              boxShadow: tab === "all" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            All Requests
          </button>
        )}
      </div>

      {/* Request List */}
      <div className="itms-card overflow-hidden">
        {loading ? (
          <div className="text-center text-secondary py-5 small">Loading…</div>
        ) : displayList.length === 0 ? (
          <div className="text-center text-secondary py-5 small">
            {tab === "queue" ? "No pending requests" : "No requests yet"}
          </div>
        ) : (
          <div>
            {displayList.map((req) => {
              const ss = STATUS_BADGE[req.status] || {};
              const ps = PRIORITY_BADGE[req.priority] || {};
              return (
                <div key={req.id} className="px-3 py-3 border-bottom">
                  <div className="d-flex align-items-start justify-content-between gap-3">
                    <div className="min-w-0 flex-grow-1">
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <span className="font-monospace small fw-semibold">
                          {req.req_number}
                        </span>
                        <span
                          className="badge px-2 py-1"
                          style={{
                            background: ss.bg,
                            color: ss.color,
                            fontSize: "11px",
                          }}
                        >
                          {req.status?.replace("_", " ")}
                        </span>
                        <span
                          className="badge px-2 py-1"
                          style={{
                            background: ps.bg,
                            color: ps.color,
                            fontSize: "11px",
                          }}
                        >
                          {req.priority}
                        </span>
                      </div>
                      <div className="small text-secondary mt-1">
                        {req.requester_name}
                        {req.reason && (
                          <span className="text-secondary ms-2">
                            · {req.reason}
                          </span>
                        )}
                      </div>
                      <div
                        className="text-secondary mt-1"
                        style={{ fontSize: "0.75rem" }}
                      >
                        {fmtDate(req.created_at)}
                      </div>
                    </div>
                    <div className="d-flex align-items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openDetail(req)}
                        className="btn btn-outline-secondary btn-sm px-2 py-1"
                        style={{ fontSize: "0.75rem" }}
                      >
                        View
                      </button>
                      {isIT &&
                        ["submitted", "in_review"].includes(req.status) && (
                          <button
                            onClick={() => openReview(req)}
                            className="btn btn-primary btn-sm px-2 py-1"
                            style={{ fontSize: "0.75rem" }}
                          >
                            Review
                          </button>
                        )}
                      {isIT &&
                        ["approved", "partially_approved"].includes(
                          req.status,
                        ) && (
                          <button
                            onClick={() => {
                              setFulfillModal(req);
                              setFulfillForm({
                                assignee_id: "",
                                notes: "",
                                expected_return_date: "",
                              });
                            }}
                            className="btn btn-success btn-sm px-2 py-1"
                            style={{ fontSize: "0.75rem" }}
                          >
                            Fulfill
                          </button>
                        )}
                      {["submitted", "in_review"].includes(req.status) &&
                        (req.requester_id === user?.id || isIT) && (
                          <button
                            onClick={() => cancelRequest(req)}
                            className="btn btn-outline-danger btn-sm px-2 py-1"
                            style={{ fontSize: "0.75rem" }}
                          >
                            Cancel
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="d-flex align-items-center justify-content-between small text-secondary">
          <span>
            {fullList.length} total · page {page} of {totalPages}
          </span>
          <div className="d-flex align-items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn btn-outline-secondary btn-sm p-1"
              style={{ lineHeight: 1 }}
            >
              <ChevronLeft size={13} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(
                (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
              )
              .reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-1">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      "btn btn-sm",
                      p === page ? "btn-primary" : "btn-outline-secondary",
                    )}
                    style={{
                      width: 28,
                      height: 28,
                      padding: 0,
                      fontSize: "0.75rem",
                    }}
                  >
                    {p}
                  </button>
                ),
              )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn btn-outline-secondary btn-sm p-1"
              style={{ lineHeight: 1 }}
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* New Request Modal */}
      <Modal
        open={newModal}
        onClose={() => setNewModal(false)}
        title="Submit New Request"
      >
        <div className="d-flex flex-column gap-3">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label small fw-medium mb-1">
                Priority
              </label>
              <select
                value={newForm.priority}
                onChange={(e) =>
                  setNewForm((f) => ({ ...f, priority: e.target.value }))
                }
                className={sel}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium mb-1">
                Needed By
              </label>
              <input
                type="date"
                value={newForm.required_by}
                onChange={(e) =>
                  setNewForm((f) => ({ ...f, required_by: e.target.value }))
                }
                className={inp}
              />
            </div>
            <div className="col-12">
              <label className="form-label small fw-medium mb-1">
                Business Reason
              </label>
              <input
                value={newForm.reason}
                onChange={(e) =>
                  setNewForm((f) => ({ ...f, reason: e.target.value }))
                }
                placeholder="Why do you need these items?"
                className={inp}
              />
            </div>
          </div>

          <div>
            <div className="d-flex align-items-center justify-content-between mb-2">
              <label
                className="small fw-semibold text-secondary text-uppercase"
                style={{ letterSpacing: "0.08em" }}
              >
                Items
              </label>
              <button
                onClick={addCartItem}
                className="btn btn-link btn-sm p-0"
                style={{ color: "var(--brand)" }}
              >
                + Add item
              </button>
            </div>
            <div className="d-flex flex-column gap-2">
              {cartItems.map((ci, idx) => (
                <div key={idx} className="d-flex align-items-center gap-2">
                  <select
                    value={ci.item_id}
                    onChange={(e) =>
                      updateCartItem(idx, "item_id", e.target.value)
                    }
                    className={cn(sel, "flex-grow-1")}
                  >
                    <option value="">Select item…</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.qty_available ?? 0} available)
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={ci.qty}
                    onChange={(e) =>
                      updateCartItem(idx, "qty", parseInt(e.target.value) || 1)
                    }
                    className={inp}
                    style={{ width: 80 }}
                  />
                  {cartItems.length > 1 && (
                    <button
                      onClick={() => removeCartItem(idx)}
                      className="btn btn-link text-danger p-1"
                      style={{ lineHeight: 1 }}
                    >
                      <XCircle size={15} />
                    </button>
                  )}
                </div>
              ))}
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
              onClick={submitRequest}
              disabled={saving}
              className="btn btn-primary btn-sm d-flex align-items-center gap-1"
            >
              <Send size={13} /> {saving ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Review Modal */}
      <Modal
        open={!!reviewModal}
        onClose={() => setReviewModal(null)}
        title={`Review — ${reviewModal?.req_number}`}
      >
        {reviewModal && (
          <div className="d-flex flex-column gap-3">
            <div className="small text-secondary">
              From <strong>{reviewModal.requester_name}</strong>
              {reviewModal.reason && <> · {reviewModal.reason}</>}
            </div>
            <div className="d-flex flex-column gap-3">
              {reviewModal.items?.map((ri) => (
                <div
                  key={ri.id}
                  className="rounded-3 p-3 d-flex flex-column gap-2"
                  style={{ border: "1px solid var(--bs-border-color)" }}
                >
                  <div className="d-flex align-items-center justify-content-between">
                    <span className="fw-medium small">{ri.item_name}</span>
                    <span className="small text-secondary">
                      Requested: {ri.qty_requested} {ri.unit}
                    </span>
                  </div>
                  <div className="small text-secondary">
                    Available: <strong>{ri.qty_available ?? "?"}</strong>
                  </div>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <label
                      className="d-flex align-items-center gap-1 small"
                      style={{ cursor: "pointer" }}
                    >
                      <input
                        type="radio"
                        checked={reviewDecisions[ri.id]?.action === "approved"}
                        onChange={() =>
                          setReviewDecisions((d) => ({
                            ...d,
                            [ri.id]: { ...d[ri.id], action: "approved" },
                          }))
                        }
                        style={{ accentColor: "#4ade80" }}
                      />
                      <span className="fw-medium" style={{ color: "#4ade80" }}>
                        Approve
                      </span>
                    </label>
                    {reviewDecisions[ri.id]?.action === "approved" && (
                      <input
                        type="number"
                        min="1"
                        max={ri.qty_requested}
                        value={
                          reviewDecisions[ri.id]?.qty_approved ??
                          ri.qty_requested
                        }
                        onChange={(e) =>
                          setReviewDecisions((d) => ({
                            ...d,
                            [ri.id]: {
                              ...d[ri.id],
                              qty_approved: parseInt(e.target.value),
                            },
                          }))
                        }
                        className={inp}
                        style={{ width: 80 }}
                      />
                    )}
                    <label
                      className="d-flex align-items-center gap-1 small ms-2"
                      style={{ cursor: "pointer" }}
                    >
                      <input
                        type="radio"
                        checked={reviewDecisions[ri.id]?.action === "rejected"}
                        onChange={() =>
                          setReviewDecisions((d) => ({
                            ...d,
                            [ri.id]: { ...d[ri.id], action: "rejected" },
                          }))
                        }
                        style={{ accentColor: "#f87171" }}
                      />
                      <span className="fw-medium text-danger">Reject</span>
                    </label>
                  </div>
                  {reviewDecisions[ri.id]?.action === "rejected" && (
                    <input
                      value={reviewDecisions[ri.id]?.rejection_reason || ""}
                      onChange={(e) =>
                        setReviewDecisions((d) => ({
                          ...d,
                          [ri.id]: {
                            ...d[ri.id],
                            rejection_reason: e.target.value,
                          },
                        }))
                      }
                      placeholder="Reason for rejection…"
                      className={inp}
                      style={{ borderColor: "rgba(239,68,68,0.5)" }}
                    />
                  )}
                </div>
              ))}
            </div>
            <div>
              <label className="form-label small fw-medium mb-1">
                Review Notes
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes for requester…"
                className={inp}
                style={{ resize: "none" }}
              />
            </div>
            <div className="d-flex justify-content-end gap-2 pt-1">
              <button
                onClick={() => setReviewModal(null)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={submitReview}
                disabled={saving}
                className="btn btn-primary btn-sm d-flex align-items-center gap-1"
              >
                <CheckCircle2 size={13} />{" "}
                {saving ? "Submitting…" : "Submit Review"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Fulfill Modal */}
      <Modal
        open={!!fulfillModal}
        onClose={() => setFulfillModal(null)}
        title={`Fulfill — ${fulfillModal?.req_number}`}
      >
        {fulfillModal && (
          <div className="d-flex flex-column gap-3">
            <p className="small text-secondary mb-0">
              Select the employee to assign the approved items to.
            </p>
            <div>
              <label className="form-label small fw-medium mb-1">
                Assign To *
              </label>
              <select
                value={fulfillForm.assignee_id}
                onChange={(e) =>
                  setFulfillForm((f) => ({ ...f, assignee_id: e.target.value }))
                }
                className={sel}
              >
                <option value="">Select employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} — {e.department}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label small fw-medium mb-1">
                Expected Return Date
              </label>
              <input
                type="date"
                value={fulfillForm.expected_return_date}
                onChange={(e) =>
                  setFulfillForm((f) => ({
                    ...f,
                    expected_return_date: e.target.value,
                  }))
                }
                className={inp}
              />
              <p className="small text-secondary mt-1 mb-0">
                Leave blank for consumable items
              </p>
            </div>
            <div>
              <label className="form-label small fw-medium mb-1">Notes</label>
              <input
                value={fulfillForm.notes}
                onChange={(e) =>
                  setFulfillForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Handover notes…"
                className={inp}
              />
            </div>
            <div className="d-flex justify-content-end gap-2 pt-1">
              <button
                onClick={() => setFulfillModal(null)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={submitFulfill}
                disabled={saving || !fulfillForm.assignee_id}
                className="btn btn-success btn-sm d-flex align-items-center gap-1"
              >
                <CheckCircle2 size={13} />{" "}
                {saving ? "Processing…" : "Fulfill & Create Assignment"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Detail Modal */}
      <Modal
        open={!!detailModal}
        onClose={() => setDetailModal(null)}
        title={`Request — ${detailModal?.req_number}`}
      >
        {detailModal &&
          (() => {
            const ss = STATUS_BADGE[detailModal.status] || {};
            const ps = PRIORITY_BADGE[detailModal.priority] || {};
            return (
              <div className="d-flex flex-column gap-3">
                <div className="row g-3 small">
                  <div className="col-6">
                    <span
                      className="text-secondary"
                      style={{ fontSize: "0.75rem" }}
                    >
                      From
                    </span>
                    <p className="fw-medium mb-0">
                      {detailModal.requester_name}
                    </p>
                  </div>
                  <div className="col-6">
                    <span
                      className="text-secondary"
                      style={{ fontSize: "0.75rem" }}
                    >
                      Status
                    </span>
                    <p className="mb-0">
                      <span
                        className="badge px-2 py-1"
                        style={{
                          background: ss.bg,
                          color: ss.color,
                          fontSize: "11px",
                        }}
                      >
                        {detailModal.status?.replace("_", " ")}
                      </span>
                    </p>
                  </div>
                  <div className="col-6">
                    <span
                      className="text-secondary"
                      style={{ fontSize: "0.75rem" }}
                    >
                      Priority
                    </span>
                    <p className="mb-0">
                      <span
                        className="badge px-2 py-1"
                        style={{
                          background: ps.bg,
                          color: ps.color,
                          fontSize: "11px",
                        }}
                      >
                        {detailModal.priority}
                      </span>
                    </p>
                  </div>
                  <div className="col-6">
                    <span
                      className="text-secondary"
                      style={{ fontSize: "0.75rem" }}
                    >
                      Submitted
                    </span>
                    <p className="mb-0">{fmtDate(detailModal.created_at)}</p>
                  </div>
                  {detailModal.reason && (
                    <div className="col-12">
                      <span
                        className="text-secondary"
                        style={{ fontSize: "0.75rem" }}
                      >
                        Reason
                      </span>
                      <p className="mb-0">{detailModal.reason}</p>
                    </div>
                  )}
                  {detailModal.review_notes && (
                    <div className="col-12">
                      <span
                        className="text-secondary"
                        style={{ fontSize: "0.75rem" }}
                      >
                        Review Notes
                      </span>
                      <p className="mb-0">{detailModal.review_notes}</p>
                    </div>
                  )}
                </div>
                <div>
                  <p
                    className="small fw-semibold text-secondary text-uppercase mb-2"
                    style={{ letterSpacing: "0.08em" }}
                  >
                    Items
                  </p>
                  <div className="d-flex flex-column gap-1">
                    {detailModal.items?.map((ri) => (
                      <div
                        key={ri.id}
                        className="d-flex align-items-center justify-content-between py-2 border-bottom small"
                      >
                        <span>{ri.item_name}</span>
                        <div className="text-end">
                          <span className="text-secondary">
                            Requested: {ri.qty_requested}
                          </span>
                          {ri.item_status !== "pending" && (
                            <span
                              className="badge px-2 py-1 ms-2"
                              style={{
                                background:
                                  ri.item_status === "approved"
                                    ? "rgba(34,197,94,0.15)"
                                    : "rgba(239,68,68,0.15)",
                                color:
                                  ri.item_status === "approved"
                                    ? "#4ade80"
                                    : "#f87171",
                                fontSize: "11px",
                              }}
                            >
                              {ri.item_status === "approved"
                                ? `Approved: ${ri.qty_approved}`
                                : "Rejected"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
      </Modal>
    </div>
  );
}
