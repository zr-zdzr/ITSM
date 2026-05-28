import React, { useEffect, useState } from "react";
import {
  Monitor,
  Network,
  Smartphone,
  CreditCard,
  Cloud,
  Users,
  Package,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
  RefreshCw,
} from "lucide-react";
import Modal from "./Modal";
import { api } from "../../lib/api";

const MODULES = [
  {
    key: "employees",
    label: "Employees",
    icon: Users,
    count: 10,
    color: "#f59e0b",
  },
  {
    key: "systems",
    label: "System Devices",
    icon: Monitor,
    count: 10,
    color: "#6366f1",
  },
  {
    key: "network",
    label: "Network Devices",
    icon: Network,
    count: 6,
    color: "#0ea5e9",
  },
  {
    key: "mobiles",
    label: "Mobile Devices",
    icon: Smartphone,
    count: 6,
    color: "#22c55e",
  },
  {
    key: "sims",
    label: "SIM Cards",
    icon: CreditCard,
    count: 6,
    color: "#a855f7",
  },
  {
    key: "cloudIds",
    label: "Cloud IDs",
    icon: Cloud,
    count: 7,
    color: "#06b6d4",
  },
  {
    key: "inventory",
    label: "Inventory Items",
    icon: Package,
    count: 8,
    color: "#f97316",
  },
];

export default function SeedModal({ open, onClose }) {
  const [status, setStatus] = useState(null); // current DB counts
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [force, setForce] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResults(null);
    setError("");
    setLoading(true);
    api
      .get("/api/seed/status")
      .then(setStatus)
      .catch((e) => {
        console.error("Failed to load seed status:", e.message);
        setStatus(null);
      })
      .finally(() => setLoading(false));
  }, [open]);

  async function handleSeed() {
    setSeeding(true);
    setError("");
    setResults(null);
    try {
      const r = await api.post("/api/seed", { force });
      setResults(r.results);
      // refresh status
      const s = await api.get("/api/seed/status").catch((e) => {
        console.error("Failed to refresh seed status:", e.message);
        return null;
      });
      if (s) setStatus(s);
    } catch (e) {
      setError(e.message || "Seed failed");
    } finally {
      setSeeding(false);
    }
  }

  const allEmpty = status && MODULES.every((m) => (status[m.key] || 0) === 0);
  const hasData = status && MODULES.some((m) => (status[m.key] || 0) > 0);

  return (
    <Modal open={open} onClose={onClose} title="Load Sample Data" size="md">
      <div style={{ fontSize: "0.875rem" }}>
        {/* Info banner */}
        <div
          className="d-flex align-items-start gap-3 p-3 rounded-3 mb-4"
          style={{
            background: "rgba(0,170,47,0.08)",
            border: "1px solid rgba(0,170,47,0.2)",
          }}
        >
          <Database
            size={18}
            style={{ color: "var(--brand)", marginTop: 2, flexShrink: 0 }}
          />
          <div>
            <p className="mb-1 fw-semibold" style={{ color: "var(--brand)" }}>
              One-click demo data
            </p>
            <p className="mb-0 text-secondary" style={{ fontSize: "0.8rem" }}>
              Populates all modules with realistic Bykea sample records so you
              can explore the portal immediately. Modules that already have data
              are skipped unless you enable Force mode.
            </p>
          </div>
        </div>

        {/* Module list */}
        <div className="row g-2 mb-4">
          {MODULES.map((m) => {
            const Icon = m.icon;
            const current = status?.[m.key] ?? null;
            const res = results?.[m.key];
            const skipped = res === "skipped";
            const done = typeof res === "number";
            return (
              <div key={m.key} className="col-6">
                <div
                  className="d-flex align-items-center gap-2 p-2 rounded-3"
                  style={{
                    background: "var(--bs-secondary-bg)",
                    border: "1px solid var(--bs-border-color)",
                  }}
                >
                  <div
                    className="d-flex align-items-center justify-content-center rounded-2 flex-shrink-0"
                    style={{
                      width: 32,
                      height: 32,
                      background: `${m.color}18`,
                    }}
                  >
                    <Icon size={15} style={{ color: m.color }} />
                  </div>
                  <div className="overflow-hidden flex-grow-1">
                    <p
                      className="mb-0 fw-medium text-truncate"
                      style={{ fontSize: "0.8rem" }}
                    >
                      {m.label}
                    </p>
                    <p
                      className="mb-0 text-secondary"
                      style={{ fontSize: "0.72rem" }}
                    >
                      {loading
                        ? "…"
                        : current !== null
                          ? `${current} existing`
                          : ""}{" "}
                      <span style={{ color: m.color }}>+{m.count} sample</span>
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {done && <CheckCircle2 size={15} color="#4ade80" />}
                    {skipped && (
                      <span style={{ fontSize: "0.7rem", color: "#71717a" }}>
                        skipped
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Force toggle — only show when data exists */}
        {hasData && !results && (
          <div
            className="d-flex align-items-center gap-2 mb-3 p-2 rounded-3"
            style={{
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.2)",
            }}
          >
            <input
              type="checkbox"
              className="form-check-input mt-0 flex-shrink-0"
              id="seed-force"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              style={{ accentColor: "#f59e0b" }}
            />
            <label
              htmlFor="seed-force"
              className="mb-0"
              style={{ fontSize: "0.8rem", cursor: "pointer" }}
            >
              <span className="fw-semibold" style={{ color: "#f59e0b" }}>
                Force mode
              </span>
              <span className="text-secondary ms-1">
                — re-seed modules that already have data
              </span>
            </label>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="d-flex align-items-center gap-2 p-2 rounded-3 mb-3"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#f87171",
              fontSize: "0.8rem",
            }}
          >
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* Results summary */}
        {results && (
          <div
            className="d-flex align-items-center gap-2 p-2 rounded-3 mb-3"
            style={{
              background: "rgba(0,170,47,0.08)",
              border: "1px solid rgba(0,170,47,0.2)",
              color: "#4ade80",
              fontSize: "0.8rem",
            }}
          >
            <CheckCircle2 size={14} />
            Done!{" "}
            {Object.entries(results)
              .filter(([, v]) => typeof v === "number")
              .map(([k, v]) => `${v} ${k}`)
              .join(", ")}{" "}
            inserted.
          </div>
        )}

        {/* Actions */}
        <div
          className="d-flex justify-content-end gap-2 pt-2"
          style={{ borderTop: "1px solid var(--bs-border-color)" }}
        >
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={onClose}
            disabled={seeding}
          >
            {results ? "Close" : "Cancel"}
          </button>
          {!results && (
            <button
              className="btn btn-primary btn-sm d-flex align-items-center gap-2"
              onClick={handleSeed}
              disabled={seeding || loading}
            >
              {seeding ? (
                <>
                  <Loader2 size={14} className="spin" /> Loading data…
                </>
              ) : (
                <>
                  <Database size={14} /> Load Sample Data
                </>
              )}
            </button>
          )}
          {results && (
            <button
              className="btn btn-outline-primary btn-sm d-flex align-items-center gap-2"
              onClick={() => {
                onClose();
                window.location.reload();
              }}
            >
              <RefreshCw size={14} /> Refresh Portal
            </button>
          )}
        </div>
      </div>

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Modal>
  );
}
