import { useEffect, useState } from "react";
import { Wrench, Plus, Trash2, X, PackageMinus } from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import { fmtDate } from "../../lib/utils";

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
  vendor_id: "",
  cost_pkr: "",
  notes: "",
};

const LABEL_STYLE = {
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#71717a",
};

function entryTotal(entry) {
  return Number(entry.cost_pkr || 0) + Number(entry.parts_cost_pkr || 0);
}

export default function MaintenanceLog({ row, assetType }) {
  const { toast } = useToast();
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [parts, setParts] = useState([]);
  const [items, setItems] = useState(null);
  const [vendors, setVendors] = useState(null);
  const [confirming, setConfirming] = useState(null);

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

  // Stock items and vendors are only needed once the form opens.
  useEffect(() => {
    if (!adding) return;
    if (items === null)
      api
        .get("/api/inventory/items")
        .then(setItems)
        .catch(() => setItems([]));
    if (vendors === null)
      api
        .get("/api/vendors")
        .then(setVendors)
        .catch(() => setVendors([]));
  }, [adding, items, vendors]);

  function setPart(idx, patch) {
    setParts((p) => p.map((part, i) => (i === idx ? { ...part, ...patch } : part)));
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        vendor_id: form.vendor_id || null,
        parts: parts
          .filter((p) => p.item_id)
          .map((p) => ({
            item_id: Number(p.item_id),
            qty: Number(p.qty) || 1,
            unit_cost_pkr: p.unit_cost_pkr ? Number(p.unit_cost_pkr) : null,
          })),
      };
      const entry = await api.post(
        `/api/maintenance/${assetType}/${row.id}`,
        payload,
      );
      setLogs((l) => [entry, ...(l || [])]);
      setAdding(false);
      setForm(EMPTY_FORM);
      setParts([]);
      setItems(null); // refetch next time — availabilities changed
      toast("Maintenance event logged", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id, restock) {
    try {
      await api.del(`/api/maintenance/${id}?restock=${restock}`);
      setLogs((l) => l.filter((x) => x.id !== id));
      setConfirming(null);
      setItems(null);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  const lifetimeTotal = (logs || []).reduce((sum, e) => sum + entryTotal(e), 0);

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
        {lifetimeTotal > 0 && (
          <span
            className="badge px-1"
            style={{
              fontSize: "10px",
              background: "rgba(34,197,94,0.1)",
              color: "#4ade80",
              fontWeight: 500,
            }}
          >
            Total PKR {lifetimeTotal.toLocaleString()}
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
              <label className="form-label" style={LABEL_STYLE}>
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
              <label className="form-label" style={LABEL_STYLE}>
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
              <label className="form-label" style={LABEL_STYLE}>
                Vendor
              </label>
              <select
                value={form.vendor_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vendor_id: e.target.value }))
                }
                className="form-select form-select-sm"
              >
                <option value="">— none —</option>
                {(vendors || []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6">
              <label className="form-label" style={LABEL_STYLE}>
                Performed By
              </label>
              <input
                value={form.performed_by}
                onChange={(e) =>
                  setForm((f) => ({ ...f, performed_by: e.target.value }))
                }
                placeholder="Technician (if not a vendor)"
                className="form-control form-control-sm"
              />
            </div>
            <div className="col-6">
              <label className="form-label" style={LABEL_STYLE}>
                Labor / Service Cost (PKR)
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
            <div className="col-6">
              <label className="form-label" style={LABEL_STYLE}>
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

            <div className="col-12">
              <div className="d-flex align-items-center gap-2 mt-1">
                <PackageMinus size={12} style={{ color: "#fbbf24" }} />
                <span style={LABEL_STYLE}>Parts consumed from stock</span>
                <button
                  onClick={() =>
                    setParts((p) => [
                      ...p,
                      { item_id: "", qty: 1, unit_cost_pkr: "" },
                    ])
                  }
                  className="btn btn-link p-0"
                  style={{
                    fontSize: "11px",
                    color: "var(--brand)",
                    textDecoration: "none",
                  }}
                >
                  + Add part
                </button>
              </div>
              {parts.map((part, idx) => {
                const item = (items || []).find(
                  (i) => String(i.id) === String(part.item_id),
                );
                const over =
                  item && Number(part.qty) > Number(item.qty_available ?? 0);
                return (
                  <div key={idx} className="d-flex gap-2 align-items-center mt-2">
                    <select
                      value={part.item_id}
                      onChange={(e) => setPart(idx, { item_id: e.target.value })}
                      className="form-select form-select-sm"
                      style={{ flex: 3 }}
                    >
                      <option value="">Select item…</option>
                      {(items || []).map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.qty_available ?? 0} available)
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      value={part.qty}
                      onChange={(e) => setPart(idx, { qty: e.target.value })}
                      className={`form-control form-control-sm${over ? " is-invalid" : ""}`}
                      style={{ flex: 1 }}
                      title={over ? "Exceeds available stock" : "Quantity"}
                    />
                    <input
                      type="number"
                      min="0"
                      value={part.unit_cost_pkr}
                      onChange={(e) =>
                        setPart(idx, { unit_cost_pkr: e.target.value })
                      }
                      placeholder="Unit PKR"
                      className="form-control form-control-sm"
                      style={{ flex: 2 }}
                    />
                    <button
                      onClick={() =>
                        setParts((p) => p.filter((_, i) => i !== idx))
                      }
                      className="btn btn-link text-secondary p-1"
                      style={{ lineHeight: 1 }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 mt-2">
            <button
              onClick={() => {
                setAdding(false);
                setForm(EMPTY_FORM);
                setParts([]);
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
            const hasParts = entry.parts?.length > 0;
            const total = entryTotal(entry);
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
                    {(entry.vendor_name || entry.performed_by) && (
                      <span
                        className="text-secondary"
                        style={{ fontSize: "0.75rem" }}
                      >
                        · {entry.vendor_name || entry.performed_by}
                      </span>
                    )}
                    {total > 0 && (
                      <span
                        className="fw-medium"
                        style={{ fontSize: "0.75rem", color: "#4ade80" }}
                      >
                        PKR {total.toLocaleString()}
                        {hasParts && Number(entry.cost_pkr) > 0 && (
                          <span
                            className="text-secondary fw-normal"
                            style={{ fontSize: "10px" }}
                          >
                            {" "}
                            (labor {Number(entry.cost_pkr).toLocaleString()} +
                            parts{" "}
                            {Number(entry.parts_cost_pkr).toLocaleString()})
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setConfirming(entry.id)}
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
                {hasParts && (
                  <div className="d-flex flex-wrap gap-1 mt-1">
                    {entry.parts.map((p) => (
                      <span
                        key={p.id}
                        className="badge px-1"
                        style={{
                          fontSize: "10px",
                          background: "rgba(245,158,11,0.08)",
                          color: "#fbbf24",
                          fontWeight: 400,
                        }}
                      >
                        {p.qty} × {p.item_name}
                        {p.unit_cost_pkr
                          ? ` @ PKR ${Number(p.unit_cost_pkr).toLocaleString()}`
                          : ""}
                      </span>
                    ))}
                  </div>
                )}
                {confirming === entry.id && (
                  <div
                    className="d-flex flex-wrap align-items-center gap-2 mt-2 p-2 rounded-2"
                    style={{ background: "rgba(239,68,68,0.08)" }}
                  >
                    <span style={{ fontSize: "11px", color: "#f87171" }}>
                      Delete this entry?
                      {hasParts && " Consumed parts:"}
                    </span>
                    {hasParts ? (
                      <>
                        <button
                          onClick={() => remove(entry.id, false)}
                          className="btn btn-outline-danger btn-sm py-0"
                          style={{ fontSize: "11px" }}
                        >
                          Keep consumed
                        </button>
                        <button
                          onClick={() => remove(entry.id, true)}
                          className="btn btn-outline-warning btn-sm py-0"
                          style={{ fontSize: "11px" }}
                        >
                          Return to stock
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => remove(entry.id, false)}
                        className="btn btn-outline-danger btn-sm py-0"
                        style={{ fontSize: "11px" }}
                      >
                        Delete
                      </button>
                    )}
                    <button
                      onClick={() => setConfirming(null)}
                      className="btn btn-link text-secondary btn-sm py-0"
                      style={{ fontSize: "11px", textDecoration: "none" }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
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
