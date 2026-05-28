import React, { useEffect, useState, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  RotateCcw,
  Package,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Modal from "../components/ui/Modal";
import { cn, fmtDate } from "../lib/utils";

const STATUS_BADGE = {
  active: { bg: "rgba(34,197,94,0.15)", color: "#4ade80" },
  partially_returned: { bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
  fully_returned: { bg: "rgba(113,113,122,0.15)", color: "#a1a1aa" },
};

const inp = "form-control form-control-sm";
const sel = "form-select form-select-sm";

export default function Assignments() {
  const { canPerm } = useAuth();
  const { toast } = useToast();
  const canEdit = canPerm("inventory", "update");

  const [assignments, setAssignments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [empFilter, setEmpFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [detailAsn, setDetailAsn] = useState(null);
  const [returnModal, setReturnModal] = useState(null);
  const [directModal, setDirectModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [returnItems, setReturnItems] = useState([]);
  const [returnNotes, setReturnNotes] = useState("");
  const [returnEmpId, setReturnEmpId] = useState("");

  const [directForm, setDirectForm] = useState({
    assignee_id: "",
    expected_return_date: "",
    notes: "",
  });
  const [directCart, setDirectCart] = useState([{ item_id: "", qty: 1 }]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (empFilter) params.set("employee_id", empFilter);
      const [a, e] = await Promise.all([
        api.get(`/api/assignments?${params}`),
        api.get("/api/employees"),
      ]);
      setAssignments(a);
      setEmployees(e);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, empFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (directModal)
      api
        .get("/api/inventory/items")
        .then(setItems)
        .catch((e) => toast(e.message, "error"));
  }, [directModal, toast]);

  async function openDetail(asn) {
    try {
      const full = await api.get(`/api/assignments/${asn.id}`);
      setDetailAsn(full);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  function openReturn(asn) {
    const activeItems = (asn.items || []).filter((i) => i.status === "active");
    setReturnItems(
      activeItems.map((i) => ({
        assignment_item_id: i.id,
        qty: i.qty,
        condition: "good",
        item_name: i.item_name,
        unit: i.unit,
      })),
    );
    setReturnNotes("");
    setReturnEmpId(String(asn.assignee_id));
    setReturnModal(asn);
  }

  async function openReturnFromDetail() {
    if (!detailAsn) return;
    try {
      const full = await api.get(`/api/assignments/${detailAsn.id}`);
      setDetailAsn(null);
      openReturn(full);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function submitReturn() {
    setSaving(true);
    try {
      if (!returnEmpId) return toast("Returned by employee required", "error");
      const payload = {
        returned_by: returnEmpId,
        items: returnItems,
        notes: returnNotes,
      };
      const res = await api.post(
        `/api/assignments/${returnModal.id}/return`,
        payload,
      );
      toast(
        `Return processed — assignment ${res.assignment_status.replace("_", " ")}`,
        "success",
      );
      setReturnModal(null);
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function submitDirect() {
    setSaving(true);
    try {
      if (!directForm.assignee_id) return toast("Select an employee", "error");
      const validItems = directCart.filter((i) => i.item_id && i.qty > 0);
      if (!validItems.length) return toast("Add at least one item", "error");
      await api.post("/api/assignments/direct", {
        ...directForm,
        items: validItems,
      });
      toast("Items assigned", "success");
      setDirectModal(false);
      setDirectForm({ assignee_id: "", expected_return_date: "", notes: "" });
      setDirectCart([{ item_id: "", qty: 1 }]);
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(assignments.length / PAGE_SIZE));
  const displayAssignments = assignments.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  React.useEffect(() => {
    setPage(1);
  }, [statusFilter, empFilter]);

  function updateReturnItem(i, k, v) {
    setReturnItems((c) =>
      c.map((item, idx) => (idx === i ? { ...item, [k]: v } : item)),
    );
  }
  function addCartItem() {
    setDirectCart((c) => [...c, { item_id: "", qty: 1 }]);
  }
  function removeCartItem(i) {
    setDirectCart((c) => c.filter((_, idx) => idx !== i));
  }
  function updateCartItem(i, k, v) {
    setDirectCart((c) =>
      c.map((item, idx) => (idx === i ? { ...item, [k]: v } : item)),
    );
  }

  return (
    <div className="d-flex flex-column gap-4">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between">
        <div>
          <h5 className="fw-bold mb-1">Assignments</h5>
          <p className="small text-secondary mb-0">
            Assigned items, returns and tracking
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
          {canEdit && (
            <button
              onClick={() => setDirectModal(true)}
              className="btn btn-primary btn-sm d-flex align-items-center gap-1"
            >
              <Plus size={14} /> Direct Assign
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="d-flex align-items-center gap-3 flex-wrap">
        <select
          value={empFilter}
          onChange={(e) => setEmpFilter(e.target.value)}
          className={sel}
          style={{ width: "auto" }}
        >
          <option value="">All Employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={sel}
          style={{ width: "auto" }}
        >
          <option value="">Active only</option>
          <option value="active">Active</option>
          <option value="partially_returned">Partially Returned</option>
          <option value="fully_returned">Fully Returned</option>
        </select>
        {(empFilter || statusFilter) && (
          <button
            onClick={() => {
              setEmpFilter("");
              setStatusFilter("");
            }}
            className="btn btn-link btn-sm text-secondary p-0"
          >
            Clear
          </button>
        )}
        <span className="small text-secondary ms-auto">
          {assignments.length} assignment{assignments.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Assignments Table */}
      <div className="itms-card overflow-hidden">
        {loading ? (
          <div className="text-center text-secondary py-5 small">Loading…</div>
        ) : assignments.length === 0 ? (
          <div className="text-center text-secondary py-5 small">
            No assignments found
          </div>
        ) : (
          <div className="table-responsive">
            <table
              className="table table-hover mb-0"
              style={{ fontSize: "0.8125rem" }}
            >
              <thead>
                <tr>
                  {[
                    "Assignment",
                    "Employee",
                    "Department",
                    "Assigned By",
                    "Date",
                    "Return By",
                    "Status",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-uppercase text-secondary text-nowrap"
                      style={{ fontSize: "11px", letterSpacing: "0.05em" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayAssignments.map((asn) => {
                  const ss = STATUS_BADGE[asn.status] || {};
                  const overdue =
                    asn.expected_return_date &&
                    new Date(asn.expected_return_date) < new Date() &&
                    asn.status === "active";
                  return (
                    <tr key={asn.id}>
                      <td className="font-monospace small fw-semibold align-middle">
                        {asn.asn_number}
                      </td>
                      <td className="align-middle">
                        <div className="fw-medium">{asn.assignee_name}</div>
                        <div className="small text-secondary">
                          {asn.designation}
                        </div>
                      </td>
                      <td className="small text-secondary align-middle">
                        {asn.department || "—"}
                      </td>
                      <td className="small text-secondary align-middle">
                        {asn.assigned_by_name}
                      </td>
                      <td className="small text-secondary align-middle text-nowrap">
                        {fmtDate(asn.assigned_date)}
                      </td>
                      <td
                        className="small align-middle text-nowrap"
                        style={{ color: overdue ? "#f87171" : undefined }}
                      >
                        {asn.expected_return_date
                          ? fmtDate(asn.expected_return_date)
                          : "—"}
                      </td>
                      <td className="align-middle">
                        <span
                          className="badge rounded-pill px-2 py-1"
                          style={{
                            background: ss.bg,
                            color: ss.color,
                            fontSize: "11px",
                          }}
                        >
                          {asn.status?.replace("_", " ")}
                        </span>
                      </td>
                      <td className="align-middle">
                        <div className="d-flex align-items-center gap-1">
                          <button
                            onClick={() => openDetail(asn)}
                            className="btn btn-outline-secondary btn-sm px-2 py-1 text-nowrap"
                            style={{ fontSize: "0.75rem" }}
                          >
                            View
                          </button>
                          {canEdit && asn.status !== "fully_returned" && (
                            <button
                              onClick={async () => {
                                try {
                                  const full = await api.get(
                                    `/api/assignments/${asn.id}`,
                                  );
                                  openReturn(full);
                                } catch (e) {
                                  toast(e.message, "error");
                                }
                              }}
                              className="btn btn-sm px-2 py-1 d-flex align-items-center gap-1 text-nowrap"
                              style={{
                                background: "rgba(245,158,11,0.15)",
                                color: "#fbbf24",
                                border: "1px solid rgba(245,158,11,0.3)",
                                fontSize: "0.75rem",
                              }}
                            >
                              <RotateCcw size={11} /> Return
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="d-flex align-items-center justify-content-between small text-secondary">
          <span>
            {assignments.length} total · page {page} of {totalPages}
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

      {/* Detail Modal */}
      <Modal
        open={!!detailAsn}
        onClose={() => setDetailAsn(null)}
        title={`Assignment — ${detailAsn?.asn_number}`}
      >
        {detailAsn &&
          (() => {
            const ss = STATUS_BADGE[detailAsn.status] || {};
            return (
              <div className="d-flex flex-column gap-3">
                <div className="row g-3 small">
                  <div className="col-6">
                    <span
                      className="text-secondary"
                      style={{ fontSize: "0.75rem" }}
                    >
                      Employee
                    </span>
                    <p className="fw-medium mb-0">{detailAsn.assignee_name}</p>
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
                        {detailAsn.status?.replace("_", " ")}
                      </span>
                    </p>
                  </div>
                  <div className="col-6">
                    <span
                      className="text-secondary"
                      style={{ fontSize: "0.75rem" }}
                    >
                      Department
                    </span>
                    <p className="mb-0">{detailAsn.department || "—"}</p>
                  </div>
                  <div className="col-6">
                    <span
                      className="text-secondary"
                      style={{ fontSize: "0.75rem" }}
                    >
                      Assigned By
                    </span>
                    <p className="mb-0">{detailAsn.assigned_by_name}</p>
                  </div>
                  <div className="col-6">
                    <span
                      className="text-secondary"
                      style={{ fontSize: "0.75rem" }}
                    >
                      Assigned Date
                    </span>
                    <p className="mb-0">{fmtDate(detailAsn.assigned_date)}</p>
                  </div>
                  <div className="col-6">
                    <span
                      className="text-secondary"
                      style={{ fontSize: "0.75rem" }}
                    >
                      Return By
                    </span>
                    <p className="mb-0">
                      {fmtDate(detailAsn.expected_return_date)}
                    </p>
                  </div>
                  {detailAsn.notes && (
                    <div className="col-12">
                      <span
                        className="text-secondary"
                        style={{ fontSize: "0.75rem" }}
                      >
                        Notes
                      </span>
                      <p className="mb-0">{detailAsn.notes}</p>
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
                    {detailAsn.items?.map((item) => {
                      const itemColor =
                        item.status === "active"
                          ? "#4ade80"
                          : item.status === "returned"
                            ? "#a1a1aa"
                            : "#f87171";
                      const itemBg =
                        item.status === "active"
                          ? "rgba(34,197,94,0.15)"
                          : item.status === "returned"
                            ? "rgba(113,113,122,0.15)"
                            : "rgba(239,68,68,0.15)";
                      return (
                        <div
                          key={item.id}
                          className="d-flex align-items-center justify-content-between py-2 border-bottom small"
                        >
                          <div>
                            <span className="fw-medium">{item.item_name}</span>
                            <span className="text-secondary ms-2">
                              × {item.qty} {item.unit}
                            </span>
                          </div>
                          <span
                            className="badge px-2 py-1"
                            style={{
                              background: itemBg,
                              color: itemColor,
                              fontSize: "11px",
                            }}
                          >
                            {item.status}{" "}
                            {item.return_condition
                              ? `· ${item.return_condition}`
                              : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {canEdit && detailAsn.status !== "fully_returned" && (
                  <div className="d-flex justify-content-end pt-1">
                    <button
                      onClick={openReturnFromDetail}
                      className="btn btn-warning btn-sm d-flex align-items-center gap-1"
                    >
                      <RotateCcw size={13} /> Process Return
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
      </Modal>

      {/* Return Modal */}
      <Modal
        open={!!returnModal}
        onClose={() => setReturnModal(null)}
        title={`Process Return — ${returnModal?.asn_number}`}
      >
        {returnModal && (
          <div className="d-flex flex-column gap-3">
            <div>
              <label className="form-label small fw-medium mb-1">
                Returned By *
              </label>
              <select
                value={returnEmpId}
                onChange={(e) => setReturnEmpId(e.target.value)}
                className={sel}
              >
                <option value="">Select employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p
                className="small fw-semibold text-secondary text-uppercase mb-2"
                style={{ letterSpacing: "0.08em" }}
              >
                Items Being Returned
              </p>
              {returnItems.length === 0 ? (
                <p className="small text-secondary mb-0">
                  No active items to return
                </p>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {returnItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-3 p-3 d-flex flex-column gap-2"
                      style={{ border: "1px solid var(--bs-border-color)" }}
                    >
                      <div className="d-flex align-items-center justify-content-between">
                        <span className="fw-medium small">
                          {item.item_name}
                        </span>
                        <span className="small text-secondary">
                          Qty: {item.qty} {item.unit}
                        </span>
                      </div>
                      <div className="d-flex align-items-center gap-3 flex-wrap">
                        <span className="small fw-medium text-secondary">
                          Condition:
                        </span>
                        {["good", "damaged", "lost"].map((c) => {
                          const condColor =
                            c === "good"
                              ? "#4ade80"
                              : c === "damaged"
                                ? "#fbbf24"
                                : "#a1a1aa";
                          return (
                            <label
                              key={c}
                              className="d-flex align-items-center gap-1 small"
                              style={{ cursor: "pointer" }}
                            >
                              <input
                                type="radio"
                                name={`cond-${idx}`}
                                value={c}
                                checked={item.condition === c}
                                onChange={() =>
                                  updateReturnItem(idx, "condition", c)
                                }
                                style={{ accentColor: condColor }}
                              />
                              <span
                                className="fw-medium text-capitalize"
                                style={{ color: condColor }}
                              >
                                {c}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {item.condition !== "good" && (
                        <p className="small mb-0" style={{ color: "#fbbf24" }}>
                          {item.condition === "damaged"
                            ? "Will be marked damaged, not returned to stock"
                            : "Will be marked as lost"}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="form-label small fw-medium mb-1">Notes</label>
              <input
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Return notes…"
                className={inp}
              />
            </div>
            <div className="d-flex justify-content-end gap-2 pt-1">
              <button
                onClick={() => setReturnModal(null)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={submitReturn}
                disabled={saving || !returnEmpId || returnItems.length === 0}
                className="btn btn-warning btn-sm d-flex align-items-center gap-1"
              >
                <RotateCcw size={13} />{" "}
                {saving ? "Processing…" : "Confirm Return"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Direct Assign Modal */}
      <Modal
        open={directModal}
        onClose={() => setDirectModal(false)}
        title="Direct Assignment"
      >
        <div className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small fw-medium mb-1">
              Assign To *
            </label>
            <select
              value={directForm.assignee_id}
              onChange={(e) =>
                setDirectForm((f) => ({ ...f, assignee_id: e.target.value }))
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
              {directCart.map((ci, idx) => (
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
                        {i.name} ({i.qty_available ?? 0} avail.)
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
                  {directCart.length > 1 && (
                    <button
                      onClick={() => removeCartItem(idx)}
                      className="btn btn-link text-danger p-1"
                      style={{ fontSize: "1rem", lineHeight: 1 }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label small fw-medium mb-1">
                Expected Return
              </label>
              <input
                type="date"
                value={directForm.expected_return_date}
                onChange={(e) =>
                  setDirectForm((f) => ({
                    ...f,
                    expected_return_date: e.target.value,
                  }))
                }
                className={inp}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium mb-1">Notes</label>
              <input
                value={directForm.notes}
                onChange={(e) =>
                  setDirectForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Optional"
                className={inp}
              />
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 pt-1">
            <button
              onClick={() => setDirectModal(false)}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              onClick={submitDirect}
              disabled={saving || !directForm.assignee_id}
              className="btn btn-primary btn-sm d-flex align-items-center gap-1"
            >
              <Package size={13} />{" "}
              {saving ? "Assigning…" : "Create Assignment"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
