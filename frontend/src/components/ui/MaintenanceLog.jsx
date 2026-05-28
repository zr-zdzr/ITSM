import React, { useEffect, useState } from "react";
import { Wrench, Plus, Trash2, X } from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import { cn, fmtDate } from "../../lib/utils";

const EVENT_TYPES = [
  "repair_sent",
  "repaired",
  "upgraded",
  "serviced",
  "replaced_part",
  "inspected",
  "other",
];

const EVENT_COLOR = {
  repair_sent: { bg: "rgba(239,68,68,0.1)", color: "#f87171" },
  repaired: { bg: "rgba(34,197,94,0.1)", color: "#4ade80" },
  upgraded: { bg: "rgba(0,170,47,0.1)", color: "#4ade80" },
  serviced: { bg: "rgba(14,165,233,0.1)", color: "#7dd3fc" },
  replaced_part: { bg: "rgba(245,158,11,0.1)", color: "#fbbf24" },
  inspected: { bg: "rgba(113,113,122,0.2)", color: "#a1a1aa" },
  other: { bg: "rgba(113,113,122,0.2)", color: "#a1a1aa" },
};

const EMPTY_FORM = {
  event_type: "serviced",
  event_date: "",
  performed_by: "",
  cost_pkr: "",
  notes: "",
};

export default function MaintenanceLog({ row, assetType }) {
  const { toast } = useToast();
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!row?.id) return;
    let cancelled = false;
    setLoading(true);
    api
      .get(`/api/maintenance/${assetType}/${row.id}`)
      .then((d) => {
        if (!cancelled) setLogs(d);
      })
      .catch((e) => {
        if (!cancelled) {
          toast(e.message, "error");
          setLogs([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row?.id, assetType, toast]);

  async function save() {
    setSaving(true);
    try {
      const entry = await api.post(
        `/api/maintenance/${assetType}/${row.id}`,
        form,
      );
      setLogs((l) => [entry, ...(l || [])]);
      setAdding(false);
      setForm(EMPTY_FORM);
      toast("Maintenance event logged", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    try {
      await api.del(`/api/maintenance/${id}`);
      setLogs((l) => l.filter((x) => x.id !== id));
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-3">
        <Wrench size={13} style={{ color: "#f59e0b" }} />
        <span
          className="fw-semibold text-secondary text-uppercase"
          style={{ fontSize: "0.7rem", letterSpacing: "0.1em" }}
        >
          Maintenance Log
        </span>
        {!loading && logs !== null && (
          <span
            className="badge bg-secondary bg-opacity-25 text-secondary"
            style={{ fontSize: "10px" }}
          >
            {logs.length} events
          </span>
        )}
        <button
          onClick={() => setAdding((a) => !a)}
          className="btn btn-link ms-auto p-0 d-flex align-items-center gap-1"
          style={{
            fontSize: "11px",
            color: "var(--brand)",
            textDecoration: "none",
          }}
        >
          {adding ? <X size={11} /> : <Plus size={11} />}
          {adding ? "Cancel" : "Log Event"}
        </button>
      </div>

      {adding && (
        <div
          className="mb-3 p-3 rounded-3"
          style={{
            border: "1px solid var(--bs-border-color)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div className="row g-2">
            <div className="col-6">
              <label
                className="form-label"
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#71717a",
                }}
              >
                Event Type *
              </label>
              <select
                value={form.event_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, event_type: e.target.value }))
                }
                className="form-select form-select-sm"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6">
              <label
                className="form-label"
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#71717a",
                }}
              >
                Date
              </label>
              <input
                type="date"
                value={form.event_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, event_date: e.target.value }))
                }
                className="form-control form-control-sm"
              />
            </div>
            <div className="col-6">
              <label
                className="form-label"
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#71717a",
                }}
              >
                Performed By
              </label>
              <input
                value={form.performed_by}
                onChange={(e) =>
                  setForm((f) => ({ ...f, performed_by: e.target.value }))
                }
                placeholder="Vendor or technician"
                className="form-control form-control-sm"
              />
            </div>
            <div className="col-6">
              <label
                className="form-label"
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#71717a",
                }}
              >
                Cost (PKR)
              </label>
              <input
                type="number"
                min="0"
                value={form.cost_pkr}
                onChange={(e) =>
                  setForm((f) => ({ ...f, cost_pkr: e.target.value }))
                }
                placeholder="0"
                className="form-control form-control-sm"
              />
            </div>
            <div className="col-12">
              <label
                className="form-label"
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#71717a",
                }}
              >
                Notes
              </label>
              <input
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="What was done?"
                className="form-control form-control-sm"
              />
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 mt-2">
            <button
              onClick={() => {
                setAdding(false);
                setForm(EMPTY_FORM);
              }}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="btn btn-primary btn-sm"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="small text-secondary py-2 mb-0">Loading…</p>
      ) : !logs?.length ? (
        <p className="small text-secondary py-2 mb-0">
          No maintenance events recorded
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {logs.map((entry) => {
            const s = EVENT_COLOR[entry.event_type] || EVENT_COLOR.other;
            return (
              <div
                key={entry.id}
                className="rounded-3 px-3 py-2"
                style={{
                  border: "1px solid var(--bs-border-color)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div className="d-flex align-items-center justify-content-between gap-2">
                  <div className="d-flex align-items-center flex-wrap gap-2">
                    <span
                      className="badge px-1"
                      style={{
                        fontSize: "10px",
                        background: s.bg,
                        color: s.color,
                        fontWeight: 500,
                      }}
                    >
                      {entry.event_type.replace(/_/g, " ")}
                    </span>
                    <span
                      className="text-secondary"
                      style={{ fontSize: "0.75rem" }}
                    >
                      {fmtDate(entry.event_date)}
                    </span>
                    {entry.performed_by && (
                      <span
                        className="text-secondary"
                        style={{ fontSize: "0.75rem" }}
                      >
                        · {entry.performed_by}
                      </span>
                    )}
                    {entry.cost_pkr && (
                      <span
                        className="fw-medium"
                        style={{ fontSize: "0.75rem", color: "#4ade80" }}
                      >
                        PKR {Number(entry.cost_pkr).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => remove(entry.id)}
                    className="btn btn-link text-secondary p-1 flex-shrink-0"
                    style={{ lineHeight: 1 }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "#f87171")
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.color = "")}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                {entry.notes && (
                  <p className="small text-secondary mt-1 mb-0">
                    {entry.notes}
                  </p>
                )}
                {entry.logged_by_name && (
                  <p
                    className="text-secondary mt-1 mb-0"
                    style={{ fontSize: "10px" }}
                  >
                    Logged by {entry.logged_by_name}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
