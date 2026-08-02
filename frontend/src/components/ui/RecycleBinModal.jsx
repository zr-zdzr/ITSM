import { useEffect, useState } from "react";
import { Trash2, RotateCcw, Clock, AlertTriangle } from "lucide-react";
import Modal from "./Modal";
import { api } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import { cn } from "../../lib/utils";

const MODULE_LABELS = {
  systems: "System",
  network: "Network Device",
  mobiles: "Mobile Device",
  sims: "SIM Card",
  gws: "Cloud ID",
  employees: "Employee",
};

const MODULE_COLORS = {
  systems: { bg: "rgba(0,170,47,0.1)", color: "#4ade80" },
  network: { bg: "rgba(14,165,233,0.1)", color: "#7dd3fc" },
  mobiles: { bg: "rgba(34,197,94,0.1)", color: "#4ade80" },
  sims: { bg: "rgba(168,85,247,0.1)", color: "#c4b5fd" },
  gws: { bg: "rgba(6,182,212,0.1)", color: "#67e8f9" },
  employees: { bg: "rgba(245,158,11,0.1)", color: "#fcd34d" },
};

const ACTION_STYLES = {
  created: { bg: "rgba(0,170,47,0.1)", color: "#4ade80" },
  updated: { bg: "rgba(245,158,11,0.1)", color: "#fbbf24" },
  imported: { bg: "rgba(139,92,246,0.1)", color: "#c4b5fd" },
  password_reset: { bg: "rgba(14,165,233,0.1)", color: "#7dd3fc" },
  password_changed: { bg: "rgba(14,165,233,0.1)", color: "#7dd3fc" },
};

function daysLeft(expires_at) {
  const ms = new Date(expires_at) - new Date();
  return Math.max(0, Math.ceil(ms / 86400000));
}

function fmtRelative(ts) {
  if (!ts) return null;
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function RecycleBinModal({ open, onClose, onCountChange }) {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmPermanent, setConfirmPermanent] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get("/api/recycle-bin");
      setItems(data);
      onCountChange?.(data.length);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load();
  }, [open]); // load is stable (no external deps), so omitting is intentional

  async function restore(item) {
    try {
      await api.post(`/api/recycle-bin/${item.id}/restore`);
      toast(`Restored: ${item.record_name}`, "success");
      const updated = items.filter((i) => i.id !== item.id);
      setItems(updated);
      onCountChange?.(updated.length);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function permanentDelete(item) {
    try {
      await api.del(`/api/recycle-bin/${item.id}`);
      toast("Permanently deleted", "success");
      setConfirmPermanent(null);
      const updated = items.filter((i) => i.id !== item.id);
      setItems(updated);
      onCountChange?.(updated.length);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Recycle Bin" size="xl">
        <div className="d-flex align-items-center gap-2 small text-secondary mb-3">
          <Clock size={12} />
          Items are automatically purged after 30 days.
        </div>

        {loading ? (
          <div className="py-5 d-flex align-items-center justify-content-center">
            <div
              className="spinner-border spinner-border-sm text-primary"
              role="status"
            />
          </div>
        ) : items.length === 0 ? (
          <div className="py-5 text-center">
            <Trash2 size={32} className="mb-3 text-secondary opacity-50" />
            <p className="small text-secondary mb-0">Recycle bin is empty</p>
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
                    "Module",
                    "Record",
                    "Last Action",
                    "Deleted by",
                    "Expires in",
                    "",
                  ].map((h) => (
                    <th key={h} style={{ whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const days = daysLeft(item.expires_at);
                  const modStyle = MODULE_COLORS[item.module] || {
                    bg: "rgba(113,113,122,0.2)",
                    color: "#a1a1aa",
                  };
                  return (
                    <tr key={item.id}>
                      <td className="align-middle">
                        <span
                          className="badge rounded-pill px-2 py-1"
                          style={{
                            background: modStyle.bg,
                            color: modStyle.color,
                            fontSize: "11px",
                          }}
                        >
                          {MODULE_LABELS[item.module] || item.module}
                        </span>
                      </td>

                      <td
                        className="align-middle fw-medium text-truncate"
                        style={{ maxWidth: 160 }}
                        title={item.record_name}
                      >
                        {item.record_name}
                      </td>

                      <td className="align-middle">
                        {item.last_action ? (
                          (() => {
                            const s = ACTION_STYLES[item.last_action] || {
                              bg: "rgba(113,113,122,0.2)",
                              color: "#a1a1aa",
                            };
                            return (
                              <div>
                                <span
                                  className="badge px-1 d-inline-block mb-1"
                                  style={{
                                    background: s.bg,
                                    color: s.color,
                                    fontSize: "10px",
                                  }}
                                >
                                  {item.last_action.replace(/_/g, " ")}
                                </span>
                                <div
                                  className="text-secondary"
                                  style={{ fontSize: "10px" }}
                                >
                                  {item.last_action_by && (
                                    <span>{item.last_action_by} · </span>
                                  )}
                                  {fmtRelative(item.last_action_at)}
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <span
                            className="text-secondary fst-italic"
                            style={{ fontSize: "10px" }}
                          >
                            No prior log
                          </span>
                        )}
                      </td>

                      <td
                        className="align-middle text-secondary small"
                        style={{ whiteSpace: "nowrap" }}
                      >
                        {item.deleted_by_name || "—"}
                      </td>

                      <td className="align-middle">
                        <span
                          className={cn(
                            "small fw-medium",
                            days <= 3
                              ? "text-danger"
                              : days <= 7
                                ? "text-warning"
                                : "text-secondary",
                          )}
                        >
                          {days}d
                        </span>
                      </td>

                      <td className="align-middle">
                        <div className="d-flex align-items-center gap-1 justify-content-end">
                          <button
                            onClick={() => restore(item)}
                            title="Restore"
                            className="btn btn-link text-success p-1 d-flex align-items-center gap-1"
                            style={{ fontSize: "0.75rem", lineHeight: 1 }}
                          >
                            <RotateCcw size={12} /> Restore
                          </button>
                          <button
                            onClick={() => setConfirmPermanent(item)}
                            title="Delete permanently"
                            className="btn btn-link text-danger p-1 d-flex align-items-center gap-1"
                            style={{ fontSize: "0.75rem", lineHeight: 1 }}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="d-flex justify-content-end mt-4 pt-3 border-top">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </Modal>

      {/* Permanent delete confirm */}
      <Modal
        open={!!confirmPermanent}
        onClose={() => setConfirmPermanent(null)}
        title="Permanently Delete"
        size="sm"
      >
        <div className="d-flex gap-3">
          <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-1" />
          <div>
            <p className="small mb-1">
              <strong>{confirmPermanent?.record_name}</strong> will be
              permanently deleted and cannot be recovered.
            </p>
            <p className="small text-secondary mb-0">
              This bypasses the 30-day recovery window.
            </p>
          </div>
        </div>
        <div className="d-flex justify-content-end gap-2 mt-4">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setConfirmPermanent(null)}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => permanentDelete(confirmPermanent)}
          >
            Delete Permanently
          </button>
        </div>
      </Modal>
    </>
  );
}
