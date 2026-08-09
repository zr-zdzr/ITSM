import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  RefreshCw,
  Sun,
  Moon,
  LogOut,
  KeyRound,
  ChevronDown,
  Trash2,
  Bell,
  Search,
  AlertTriangle,
  Package,
  RotateCcw,
  Clock,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { api } from "../../lib/api";
import Modal from "../ui/Modal";
import RecycleBinModal from "../ui/RecycleBinModal";
import GlobalSearch from "../ui/GlobalSearch";

const TITLES = {
  "/": { title: "Dashboard", sub: "IT inventory overview" },
  "/systems": {
    title: "System Devices",
    sub: "Laptop, desktop & server inventory",
  },
  "/network": { title: "Network Devices", sub: "Switches, routers, firewalls" },
  "/mobiles": {
    title: "Mobile Devices",
    sub: "Company mobile device inventory",
  },
  "/sims": { title: "SIM Cards", sub: "SIM card management" },
  "/gws": { title: "Cloud IDs", sub: "Cloud account management" },
  "/employees": { title: "Employees", sub: "Company employee directory" },
  "/reports": { title: "Reports", sub: "Analytics and exports" },
  "/users": { title: "User Management", sub: "System access control" },
  "/logs": { title: "Activity Log", sub: "Portal event history" },
  "/inventory": {
    title: "Inventory Stock",
    sub: "Consumables & returnable item stock",
  },
  "/requests": {
    title: "Requests",
    sub: "Item requests, approvals & fulfillment",
  },
  "/assignments": {
    title: "Assignments",
    sub: "Assigned items & return tracking",
  },
  "/vendors": { title: "Vendors", sub: "IT vendors and suppliers" },
  "/tickets": { title: "Support Tickets", sub: "IT complaints & support" },
  "/masterdata/heads": {
    title: "Head & Sub-Head",
    sub: "Master data for cost heads",
  },
};

// Turn "/masterdata/heads" into "Heads" so a route nobody added here still
// shows something true. The old fallback was TITLES["/"], which meant any
// unregistered page confidently announced itself as the Dashboard — /vendors
// and /masterdata/heads had both been doing exactly that.
function deriveTitle(pathname) {
  // Detail routes ending in an id would otherwise derive a bare number.
  if (/^\/inventory\/units\/\d+$/.test(pathname))
    return { title: "Stock Unit", sub: "Serialized unit detail" };
  const slug = pathname.split("/").filter(Boolean).pop() || "";
  if (!slug) return null;
  const title = slug
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { title, sub: "" };
}

export default function Header({ onRefresh, onMobileMenuToggle }) {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { title, sub } =
    TITLES[location.pathname] || deriveTitle(location.pathname) || TITLES["/"];
  const [open, setOpen] = useState(false);
  const [cpModal, setCpModal] = useState(false);
  const [cpData, setCpData] = useState({ cur: "", nw: "", con: "" });
  const [darkMode, setDarkMode] = useState(
    document.documentElement.getAttribute("data-bs-theme") !== "light",
  );
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [recycleBinCount, setRecycleBinCount] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [alertData, setAlertData] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const dropRef = useRef(null);
  const alertRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (!dropRef.current?.contains(e.target)) setOpen(false);
      if (!alertRef.current?.contains(e.target)) setAlertsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Employees can't reach the alerts / recycle-bin APIs (support-only
  // whitelist), so don't poll on their behalf.
  const isEmployee = user?.role === "employee";

  useEffect(() => {
    if (isEmployee) return;
    api
      .get("/api/recycle-bin/count")
      .then((d) => setRecycleBinCount(d.count || 0))
      .catch((e) => console.error("Recycle bin count error:", e.message));
  }, [isEmployee]);

  useEffect(() => {
    if (isEmployee) return;
    function loadAlerts() {
      api
        .get("/api/alerts/count")
        .then((d) => setAlertCount(d.count || 0))
        .catch((e) => console.error("Alerts count error:", e.message));
    }
    loadAlerts();
    const interval = setInterval(loadAlerts, 60000);
    return () => clearInterval(interval);
  }, [isEmployee]);

  async function openAlerts() {
    setAlertsOpen((o) => !o);
    if (!alertData) {
      try {
        const data = await api.get("/api/alerts");
        setAlertData(data);
      } catch (e) {
        console.error("Failed to load alerts:", e.message);
        setAlertData({
          totalCount: 0,
          inventory: [],
          overdueReturns: [],
          warranties: [],
        });
      }
    }
  }

  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  function toggleTheme() {
    const isDark =
      document.documentElement.getAttribute("data-bs-theme") !== "light";
    const newTheme = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-bs-theme", newTheme);
    setDarkMode(!isDark);
    localStorage.setItem("itms-theme", newTheme);
    setOpen(false);
  }

  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }

  async function changePassword() {
    const { cur, nw, con } = cpData;
    if (!cur || !nw || !con) return toast("All fields are required", "error");
    if (nw.length < 6)
      return toast("New password must be at least 6 characters", "error");
    if (nw !== con) return toast("Passwords do not match", "error");
    try {
      await api.post("/auth/change-password", {
        current_password: cur,
        new_password: nw,
      });
      toast("Password changed", "success");
      setCpModal(false);
      setCpData({ cur: "", nw: "", con: "" });
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <>
      <header
        id="app-header"
        className="d-flex align-items-center gap-2 px-3 px-md-4"
      >
        {/* Hamburger — mobile only */}
        <button
          className="btn btn-link text-secondary p-1 d-md-none flex-shrink-0"
          onClick={onMobileMenuToggle}
          aria-label="Toggle menu"
        >
          <svg
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="3" y1="6" x2="17" y2="6" />
            <line x1="3" y1="11" x2="17" y2="11" />
            <line x1="3" y1="16" x2="17" y2="16" />
          </svg>
        </button>
        <div className="flex-grow-1 min-w-0">
          <h1
            className="fw-semibold mb-0 text-truncate"
            style={{ fontSize: "1rem" }}
          >
            {title}
          </h1>
          <p
            className="mb-0 text-secondary text-truncate d-none d-sm-block"
            style={{ fontSize: "11px" }}
          >
            {sub}
          </p>
        </div>

        <div className="d-flex align-items-center gap-1">
          {/* Search, alerts and the recycle bin all read IT data the employee
              role cannot reach — hide the whole toolbar cluster for them. */}
          {!isEmployee && (
            <>
              {/* Global Search */}
              <button
                onClick={() => setSearchOpen(true)}
                title="Search (Ctrl+K)"
                className="d-none d-sm-flex align-items-center gap-2 btn btn-outline-secondary btn-sm px-2 py-1"
                style={{ fontSize: "0.75rem" }}
              >
                <Search size={13} />
                <span className="text-secondary">Search…</span>
                <kbd
                  className="ms-1 bg-secondary bg-opacity-25 px-1 rounded"
                  style={{ fontSize: "9px", fontFamily: "monospace" }}
                >
                  ⌘K
                </kbd>
              </button>
              <button
                onClick={() => setSearchOpen(true)}
                title="Search"
                className="btn btn-link text-secondary d-sm-none p-1"
              >
                <Search size={15} />
              </button>

              {/* Alerts bell */}
              <div className="position-relative" ref={alertRef}>
                <button
                  onClick={openAlerts}
                  title="Alerts"
                  className="btn btn-link text-secondary position-relative p-1"
                >
                  <Bell size={15} />
                  {alertCount > 0 && (
                    <span
                      className="position-absolute top-0 end-0 badge rounded-pill bg-warning text-dark"
                      style={{
                        fontSize: "9px",
                        minWidth: 16,
                        padding: "2px 4px",
                      }}
                    >
                      {alertCount > 99 ? "99+" : alertCount}
                    </span>
                  )}
                </button>
                {alertsOpen && (
                  <div
                    className="itms-card shadow-lg alerts-dropdown animate-scale-in"
                    style={{ overflow: "hidden" }}
                  >
                    <div className="px-3 py-2 border-bottom d-flex align-items-center justify-content-between">
                      <span className="fw-semibold small">Alerts</span>
                      <span
                        className="text-secondary"
                        style={{ fontSize: "10px" }}
                      >
                        {alertData?.totalCount ?? "…"} active
                      </span>
                    </div>
                    <div className="overflow-auto" style={{ maxHeight: 320 }}>
                      {!alertData ? (
                        <div className="px-3 py-4 text-center text-secondary small">
                          Loading…
                        </div>
                      ) : alertData.totalCount === 0 ? (
                        <div className="px-3 py-4 text-center text-secondary small">
                          No active alerts
                        </div>
                      ) : (
                        <>
                          {alertData.inventory?.length > 0 && (
                            <div>
                              <div
                                className="px-3 py-1 d-flex align-items-center gap-1 border-bottom"
                                style={{
                                  fontSize: "10px",
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                  background: "var(--surface-subtle)",
                                }}
                              >
                                <Package size={10} className="text-secondary" />{" "}
                                Inventory Stock
                              </div>
                              {alertData.inventory.map((a, i) => (
                                <button
                                  key={i}
                                  onClick={() => {
                                    navigate("/inventory");
                                    setAlertsOpen(false);
                                  }}
                                  className="w-100 d-flex align-items-start gap-2 px-3 py-2 border-bottom border-0 bg-transparent text-start"
                                  style={{ transition: "background 0.15s" }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.background =
                                      "var(--surface-subtle)")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.background =
                                      "transparent")
                                  }
                                >
                                  <AlertTriangle
                                    size={12}
                                    className={
                                      a.alert_type === "out_of_stock"
                                        ? "text-danger mt-1 flex-shrink-0"
                                        : "text-warning mt-1 flex-shrink-0"
                                    }
                                  />
                                  <div>
                                    <p className="small fw-medium mb-0">
                                      {a.item_name}
                                    </p>
                                    <p
                                      className="text-secondary mb-0"
                                      style={{ fontSize: "10px" }}
                                    >
                                      {a.alert_type === "out_of_stock"
                                        ? "Out of stock"
                                        : `Low stock — ${a.current_value} ${a.unit || ""} remaining`}
                                    </p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          {alertData.overdueReturns?.length > 0 && (
                            <div>
                              <div
                                className="px-3 py-1 d-flex align-items-center gap-1 border-bottom"
                                style={{
                                  fontSize: "10px",
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                  background: "var(--surface-subtle)",
                                }}
                              >
                                <RotateCcw
                                  size={10}
                                  className="text-secondary"
                                />{" "}
                                Overdue Returns
                              </div>
                              {alertData.overdueReturns.map((a, i) => (
                                <button
                                  key={i}
                                  onClick={() => {
                                    navigate("/assignments");
                                    setAlertsOpen(false);
                                  }}
                                  className="w-100 d-flex align-items-start gap-2 px-3 py-2 border-bottom border-0 bg-transparent text-start"
                                  style={{ transition: "background 0.15s" }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.background =
                                      "var(--surface-subtle)")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.background =
                                      "transparent")
                                  }
                                >
                                  <RotateCcw
                                    size={12}
                                    className="text-danger mt-1 flex-shrink-0"
                                  />
                                  <div>
                                    <p className="small fw-medium mb-0">
                                      {a.asn_number} · {a.assignee_name}
                                    </p>
                                    <p
                                      className="text-danger mb-0"
                                      style={{ fontSize: "10px" }}
                                    >
                                      Due{" "}
                                      {new Date(
                                        a.expected_return_date,
                                      ).toLocaleDateString("en-GB", {
                                        day: "numeric",
                                        month: "short",
                                      })}
                                    </p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          {alertData.warranties?.length > 0 && (
                            <div>
                              <div
                                className="px-3 py-1 d-flex align-items-center gap-1 border-bottom"
                                style={{
                                  fontSize: "10px",
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                  background: "var(--surface-subtle)",
                                }}
                              >
                                <Clock size={10} className="text-secondary" />{" "}
                                Expiring Warranties
                              </div>
                              {alertData.warranties.map((a, i) => (
                                <button
                                  key={i}
                                  onClick={() => {
                                    navigate("/reports");
                                    setAlertsOpen(false);
                                  }}
                                  className="w-100 d-flex align-items-start gap-2 px-3 py-2 border-bottom border-0 bg-transparent text-start"
                                  style={{ transition: "background 0.15s" }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.background =
                                      "var(--surface-subtle)")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.background =
                                      "transparent")
                                  }
                                >
                                  <Clock
                                    size={12}
                                    className="text-warning mt-1 flex-shrink-0"
                                  />
                                  <div>
                                    <p className="small fw-medium mb-0">
                                      {a.label} · {a.manufacturer} {a.model}
                                    </p>
                                    <p
                                      className="text-warning mb-0"
                                      style={{ fontSize: "10px" }}
                                    >
                                      {a.category} · {a.days_remaining}d
                                      remaining
                                    </p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setRecycleBinOpen(true)}
                title="Recycle Bin"
                className="btn btn-link text-secondary position-relative p-1"
              >
                <Trash2 size={15} />
                {recycleBinCount > 0 && (
                  <span
                    className="position-absolute top-0 end-0 badge rounded-pill bg-danger"
                    style={{
                      fontSize: "9px",
                      minWidth: 16,
                      padding: "2px 4px",
                    }}
                  >
                    {recycleBinCount > 99 ? "99+" : recycleBinCount}
                  </span>
                )}
              </button>
            </>
          )}

          <button
            onClick={onRefresh}
            title="Refresh"
            className="btn btn-link text-secondary p-1"
          >
            <RefreshCw size={15} />
          </button>

          <div className="position-relative" ref={dropRef}>
            <button
              onClick={() => setOpen((o) => !o)}
              className="btn btn-link text-body d-flex align-items-center gap-2 px-2 py-1 text-decoration-none"
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  className="rounded-circle"
                  style={{
                    width: 26,
                    height: 26,
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                />
              ) : (
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center fw-bold"
                  style={{
                    width: 26,
                    height: 26,
                    background: "rgba(0,170,47,0.2)",
                    color: "var(--brand)",
                    fontSize: "0.75rem",
                  }}
                >
                  {(user?.name || "U")[0].toUpperCase()}
                </div>
              )}
              <span
                className="small fw-medium d-none d-md-block text-truncate"
                style={{ maxWidth: 120 }}
              >
                {user?.name}
              </span>
              <ChevronDown size={13} className="text-secondary" />
            </button>

            {open && (
              <div
                className="itms-card shadow-lg animate-scale-in"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 8px)",
                  width: 220,
                  zIndex: 1050,
                  overflow: "hidden",
                }}
              >
                {/* User info */}
                <div
                  className="d-flex align-items-center gap-3 px-3 py-3"
                  style={{ borderBottom: "1px solid var(--bs-border-color)" }}
                >
                  {user?.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
                      className="rounded-circle flex-shrink-0"
                      style={{ width: 36, height: 36 }}
                    />
                  ) : (
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
                      style={{
                        width: 36,
                        height: 36,
                        background: "rgba(0,170,47,0.2)",
                        color: "var(--brand)",
                        fontSize: "0.875rem",
                      }}
                    >
                      {(user?.name || "U")[0].toUpperCase()}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <p
                      className="fw-semibold mb-0 text-truncate"
                      style={{ fontSize: "0.875rem" }}
                    >
                      {user?.name}
                    </p>
                    <p
                      className="text-secondary mb-0 text-capitalize"
                      style={{ fontSize: "0.7rem" }}
                    >
                      {user?.role?.replace("_", " ")}
                    </p>
                  </div>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <button
                    onClick={toggleTheme}
                    className="w-100 d-flex align-items-center gap-3 px-3 py-2 btn btn-link text-decoration-none text-start"
                    style={{
                      color: "var(--bs-body-color)",
                      fontSize: "0.8125rem",
                      whiteSpace: "nowrap",
                      borderRadius: 0,
                    }}
                  >
                    <span className="text-secondary flex-shrink-0">
                      {darkMode ? <Sun size={15} /> : <Moon size={15} />}
                    </span>
                    {darkMode ? "Light mode" : "Dark mode"}
                  </button>
                  <button
                    onClick={() => {
                      setCpModal(true);
                      setOpen(false);
                    }}
                    className="w-100 d-flex align-items-center gap-3 px-3 py-2 btn btn-link text-decoration-none text-start"
                    style={{
                      color: "var(--bs-body-color)",
                      fontSize: "0.8125rem",
                      whiteSpace: "nowrap",
                      borderRadius: 0,
                    }}
                  >
                    <span className="text-secondary flex-shrink-0">
                      <KeyRound size={15} />
                    </span>
                    Change Password
                  </button>
                </div>

                {/* Sign out */}
                <div
                  style={{ borderTop: "1px solid var(--bs-border-color)" }}
                  className="py-1"
                >
                  <button
                    onClick={handleLogout}
                    className="w-100 d-flex align-items-center gap-3 px-3 py-2 btn btn-link text-decoration-none text-start"
                    style={{
                      color: "#f87171",
                      fontSize: "0.8125rem",
                      whiteSpace: "nowrap",
                      borderRadius: 0,
                    }}
                  >
                    <span className="flex-shrink-0">
                      <LogOut size={15} />
                    </span>
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <RecycleBinModal
        open={recycleBinOpen}
        onClose={() => setRecycleBinOpen(false)}
        onCountChange={setRecycleBinCount}
      />

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      <Modal
        open={cpModal}
        onClose={() => setCpModal(false)}
        title="Change Password"
        size="sm"
      >
        <div className="d-flex flex-column gap-3">
          {["cur", "nw", "con"].map((k, i) => (
            <div key={k}>
              <label className="form-label small fw-medium mb-1">
                {
                  ["Current Password", "New Password", "Confirm New Password"][
                    i
                  ]
                }
              </label>
              <input
                type="password"
                value={cpData[k]}
                onChange={(e) =>
                  setCpData((p) => ({ ...p, [k]: e.target.value }))
                }
                className="form-control"
                placeholder="••••••••"
              />
            </div>
          ))}
        </div>
        <div className="d-flex justify-content-end gap-2 mt-4">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setCpModal(false)}
          >
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={changePassword}>
            Change Password
          </button>
        </div>
      </Modal>
    </>
  );
}
