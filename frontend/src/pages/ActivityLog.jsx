import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Search } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { Navigate } from "react-router-dom";

const ACTION_STYLES = {
  login: { bg: "rgba(34,197,94,0.1)", color: "#4ade80" },
  logout: { bg: "rgba(113,113,122,0.2)", color: "#a1a1aa" },
  login_failed: { bg: "rgba(239,68,68,0.1)", color: "#f87171" },
  login_blocked: { bg: "rgba(239,68,68,0.1)", color: "#f87171" },
  created: { bg: "rgba(0,170,47,0.1)", color: "#4ade80" },
  updated: { bg: "rgba(245,158,11,0.1)", color: "#fbbf24" },
  deleted: { bg: "rgba(239,68,68,0.1)", color: "#f87171" },
  deleted_all: { bg: "rgba(239,68,68,0.15)", color: "#f87171" },
  imported: { bg: "rgba(139,92,246,0.1)", color: "#c4b5fd" },
  password_changed: { bg: "rgba(14,165,233,0.1)", color: "#7dd3fc" },
  password_reset: { bg: "rgba(14,165,233,0.1)", color: "#7dd3fc" },
  STOCK_ADJUST: { bg: "rgba(20,184,166,0.1)", color: "#2dd4bf" },
  CREATE: { bg: "rgba(0,170,47,0.1)", color: "#4ade80" },
  REVIEW: { bg: "rgba(168,85,247,0.1)", color: "#c4b5fd" },
  FULFILL: { bg: "rgba(34,197,94,0.1)", color: "#4ade80" },
  RETURN: { bg: "rgba(245,158,11,0.1)", color: "#fbbf24" },
  ASSIGN: { bg: "rgba(14,165,233,0.1)", color: "#7dd3fc" },
  CANCEL: { bg: "rgba(113,113,122,0.2)", color: "#a1a1aa" },
  DELETE: { bg: "rgba(239,68,68,0.1)", color: "#f87171" },
};

const MODULE_LABELS = {
  auth: "Auth",
  users: "Users",
  systems: "Systems",
  network_devices: "Network",
  mobiles: "Mobiles",
  sims: "SIMs",
  gws_accounts: "Cloud IDs",
  employees: "Employees",
  inventory: "Inventory",
  inv_requests: "Requests",
  inv_assignments: "Assignments",
};

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function ActivityLog() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  if (me?.role !== "super_admin") return <Navigate to="/" replace />;

  async function load() {
    setLoading(true);
    try {
      const data = await api.get("/api/users/activity/log");
      setLogs(data);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    let out = logs;
    if (actionFilter !== "all")
      out = out.filter((l) => l.action === actionFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (l) =>
          l.user_name?.toLowerCase().includes(q) ||
          l.user_email?.toLowerCase().includes(q) ||
          l.action?.toLowerCase().includes(q) ||
          l.record_label?.toLowerCase().includes(q) ||
          l.details?.toLowerCase().includes(q) ||
          l.ip_address?.includes(q),
      );
    }
    setFiltered(out);
  }, [logs, search, actionFilter]);

  const actions = [
    "all",
    ...Array.from(new Set(logs.map((l) => l.action))).sort(),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="d-flex flex-column gap-4"
    >
      <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap">
        <p className="small text-secondary mb-0">
          {filtered.length} event{filtered.length !== 1 ? "s" : ""}
        </p>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <div className="position-relative">
            <Search
              size={12}
              className="position-absolute text-secondary"
              style={{
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
              }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="form-control form-control-sm"
              style={{ paddingLeft: 28, width: 192 }}
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="form-select form-select-sm"
            style={{ width: "auto" }}
          >
            {actions.map((a) => (
              <option key={a} value={a}>
                {a === "all" ? "All actions" : a.replace("_", " ")}
              </option>
            ))}
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
          >
            <RefreshCw
              size={12}
              className={loading ? "spin" : ""}
              style={loading ? { animation: "spin 1s linear infinite" } : {}}
            />
            Refresh
          </button>
        </div>
      </div>

      <div className="itms-card overflow-hidden">
        <div className="table-responsive">
          <table
            className="table table-hover mb-0"
            style={{ fontSize: "0.8125rem" }}
          >
            <thead>
              <tr>
                {[
                  "Time",
                  "User",
                  "Action",
                  "Module",
                  "Record",
                  "Details",
                  "IP",
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
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center text-secondary py-5">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-secondary py-5">
                    No events found
                  </td>
                </tr>
              ) : (
                filtered.map((l) => {
                  const s = ACTION_STYLES[l.action] || {
                    bg: "rgba(113,113,122,0.2)",
                    color: "#a1a1aa",
                  };
                  return (
                    <tr key={l.id}>
                      <td
                        className="text-secondary text-nowrap align-middle"
                        style={{ fontSize: "0.75rem" }}
                      >
                        {fmt(l.created_at)}
                      </td>
                      <td className="align-middle">
                        <div className="small fw-medium">
                          {l.user_name || (
                            <span className="text-secondary">—</span>
                          )}
                        </div>
                        <div
                          className="text-secondary"
                          style={{ fontSize: "10px" }}
                        >
                          {l.user_email || "Unknown"}
                        </div>
                      </td>
                      <td className="align-middle">
                        <span
                          className="badge px-2 py-1"
                          style={{
                            background: s.bg,
                            color: s.color,
                            fontSize: "11px",
                          }}
                        >
                          {l.action?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="small text-secondary align-middle">
                        {MODULE_LABELS[l.table_name] || l.table_name || "—"}
                      </td>
                      <td
                        className="small text-secondary align-middle text-truncate"
                        style={{ maxWidth: 140 }}
                        title={l.record_label}
                      >
                        {l.record_label || "—"}
                      </td>
                      <td
                        className="small text-secondary align-middle text-truncate"
                        style={{ maxWidth: 180 }}
                        title={l.details}
                      >
                        {l.details || "—"}
                      </td>
                      <td
                        className="font-monospace text-secondary align-middle"
                        style={{ fontSize: "0.75rem" }}
                      >
                        {l.ip_address || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
