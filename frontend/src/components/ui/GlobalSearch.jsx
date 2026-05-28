import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  Monitor,
  Network,
  Smartphone,
  CreditCard,
  Cloud,
  Users,
  Package,
} from "lucide-react";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";

const MODULE_META = {
  systems: {
    label: "Systems",
    icon: Monitor,
    color: "#00AA2F",
    bg: "rgba(0,170,47,0.1)",
  },
  network: {
    label: "Network",
    icon: Network,
    color: "#0ea5e9",
    bg: "rgba(14,165,233,0.1)",
  },
  mobiles: {
    label: "Mobile",
    icon: Smartphone,
    color: "#22c55e",
    bg: "rgba(34,197,94,0.1)",
  },
  sims: {
    label: "SIM",
    icon: CreditCard,
    color: "#a855f7",
    bg: "rgba(168,85,247,0.1)",
  },
  gws: {
    label: "Cloud ID",
    icon: Cloud,
    color: "#06b6d4",
    bg: "rgba(6,182,212,0.1)",
  },
  employees: {
    label: "Employee",
    icon: Users,
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
  },
  inventory: {
    label: "Inventory",
    icon: Package,
    color: "#14b8a6",
    bg: "rgba(20,184,166,0.1)",
  },
};

export default function GlobalSearch({ open, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const search = useCallback((q) => {
    clearTimeout(timerRef.current);
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const data = await api.get(`/api/search?q=${encodeURIComponent(q)}`);
        setResults(data);
        setActiveIdx(0);
      } catch (e) {
        console.error("Global search error:", e.message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);
  }, []);

  function handleChange(e) {
    const q = e.target.value;
    setQuery(q);
    search(q);
  }

  function go(result) {
    navigate(result.path);
    onClose();
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter" && results[activeIdx]) go(results[activeIdx]);
  }

  const grouped = results.reduce((acc, r) => {
    if (!acc[r.module]) acc[r.module] = [];
    acc[r.module].push(r);
    return acc;
  }, {});

  if (!open) return null;

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-start justify-content-center pt-5 px-3"
      style={{ zIndex: 1060 }}
      onClick={onClose}
    >
      <div
        className="position-absolute top-0 start-0 w-100 h-100"
        style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      />
      <div
        className="itms-card w-100 overflow-hidden position-relative"
        style={{ maxWidth: 576, zIndex: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="d-flex align-items-center gap-3 px-3 py-2 border-bottom">
          <Search size={16} className="text-secondary flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search across all modules…"
            className="flex-grow-1 bg-transparent border-0 outline-0 small"
            style={{ outline: "none", color: "inherit" }}
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setResults([]);
                inputRef.current?.focus();
              }}
              className="btn btn-link text-secondary p-0"
              style={{ lineHeight: 1 }}
            >
              <X size={14} />
            </button>
          )}
          <kbd
            className="d-none d-sm-block bg-secondary bg-opacity-25 px-1 rounded text-secondary"
            style={{ fontSize: "10px", fontFamily: "monospace" }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="overflow-auto" style={{ maxHeight: "60vh" }}>
          {loading && (
            <div className="px-3 py-5 text-center small text-secondary">
              Searching…
            </div>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-3 py-5 text-center small text-secondary">
              No results for <strong>"{query}"</strong>
            </div>
          )}
          {!loading && query.length < 2 && (
            <div
              className="px-3 py-4 text-center text-secondary"
              style={{ fontSize: "0.75rem" }}
            >
              Type at least 2 characters to search
            </div>
          )}
          {!loading &&
            Object.entries(grouped).map(([module, items]) => {
              const meta = MODULE_META[module] || {
                label: module,
                icon: Package,
                color: "#71717a",
                bg: "rgba(113,113,122,0.15)",
              };
              const Icon = meta.icon;
              return (
                <div key={module}>
                  <div
                    className="d-flex align-items-center gap-2 px-3 py-2 border-bottom"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      fontSize: "10px",
                    }}
                  >
                    <Icon size={11} style={{ color: meta.color }} />
                    <span
                      className="fw-semibold text-uppercase text-secondary"
                      style={{ letterSpacing: "0.05em" }}
                    >
                      {meta.label}
                    </span>
                    <span className="ms-auto text-secondary">
                      {items.length}
                    </span>
                  </div>
                  {items.map((r) => {
                    const globalIdx = results.indexOf(r);
                    return (
                      <button
                        key={`${r.module}-${r.id}`}
                        onClick={() => go(r)}
                        className="w-100 d-flex align-items-center gap-3 px-3 py-2 border-bottom border-0 text-start"
                        style={{
                          background:
                            globalIdx === activeIdx
                              ? "rgba(0,170,47,0.08)"
                              : "transparent",
                          transition: "background 0.1s",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          if (globalIdx !== activeIdx)
                            e.currentTarget.style.background =
                              "rgba(255,255,255,0.03)";
                        }}
                        onMouseLeave={(e) => {
                          if (globalIdx !== activeIdx)
                            e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <span
                          className="rounded flex-shrink-0 px-1 py-0"
                          style={{
                            fontSize: "10px",
                            background: meta.bg,
                            color: meta.color,
                            fontWeight: 500,
                          }}
                        >
                          {meta.label}
                        </span>
                        <div className="min-w-0 flex-grow-1">
                          <div className="small fw-medium text-truncate">
                            {r.label}
                          </div>
                          {r.sub && (
                            <div
                              className="text-secondary text-truncate"
                              style={{ fontSize: "10px" }}
                            >
                              {r.sub}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
        </div>

        {results.length > 0 && (
          <div
            className="px-3 py-2 border-top d-flex align-items-center gap-3 text-secondary"
            style={{ fontSize: "10px" }}
          >
            <span>
              <kbd
                className="bg-secondary bg-opacity-25 px-1 rounded"
                style={{ fontFamily: "monospace" }}
              >
                ↑↓
              </kbd>{" "}
              navigate
            </span>
            <span>
              <kbd
                className="bg-secondary bg-opacity-25 px-1 rounded"
                style={{ fontFamily: "monospace" }}
              >
                ↵
              </kbd>{" "}
              go to module
            </span>
            <span className="ms-auto">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
