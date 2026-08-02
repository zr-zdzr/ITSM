import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Monitor,
  Network,
  Smartphone,
  CreditCard,
  Cloud,
  Users,
  BarChart3,
  UserCog,
  ChevronRight,
  Plus,
  FileDown,
  FileUp,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Package,
  ClipboardList,
  PackageCheck,
  Store,
  Layers,
} from "lucide-react";
import BykeaB from "../ui/BykeaB";
import { cn } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/" },
  {
    id: "systems",
    label: "System Devices",
    icon: Monitor,
    path: "/systems",
    sub: [
      { label: "Add System Device", icon: Plus, action: "add" },
      { label: "Import CSV", icon: FileUp, action: "import", perm: "create" },
      { label: "Export CSV", icon: FileDown, action: "export" },
      {
        label: "Delete All",
        icon: Trash2,
        action: "delete-all",
        perm: "delete",
        danger: true,
      },
    ],
  },
  {
    id: "network",
    label: "Network Devices",
    icon: Network,
    path: "/network",
    sub: [
      { label: "Add Device", icon: Plus, action: "add", perm: "create" },
      { label: "Import CSV", icon: FileUp, action: "import", perm: "create" },
      { label: "Export CSV", icon: FileDown, action: "export" },
      {
        label: "Delete All",
        icon: Trash2,
        action: "delete-all",
        perm: "delete",
        danger: true,
      },
    ],
  },
  {
    id: "mobiles",
    label: "Mobile Devices",
    icon: Smartphone,
    path: "/mobiles",
    sub: [
      { label: "Add Device", icon: Plus, action: "add", perm: "create" },
      { label: "Import CSV", icon: FileUp, action: "import", perm: "create" },
      { label: "Export CSV", icon: FileDown, action: "export" },
      {
        label: "Delete All",
        icon: Trash2,
        action: "delete-all",
        perm: "delete",
        danger: true,
      },
    ],
  },
  {
    id: "sims",
    label: "SIM Cards",
    icon: CreditCard,
    path: "/sims",
    sub: [
      { label: "Add SIM", icon: Plus, action: "add", perm: "create" },
      { label: "Import CSV", icon: FileUp, action: "import", perm: "create" },
      { label: "Export CSV", icon: FileDown, action: "export" },
      {
        label: "Delete All",
        icon: Trash2,
        action: "delete-all",
        perm: "delete",
        danger: true,
      },
    ],
  },
  {
    id: "gws",
    label: "Cloud IDs",
    icon: Cloud,
    path: "/gws",
    sub: [
      { label: "Add Cloud ID", icon: Plus, action: "add", perm: "create" },
      { label: "Import CSV", icon: FileUp, action: "import", perm: "create" },
      { label: "Export CSV", icon: FileDown, action: "export" },
      {
        label: "Delete All",
        icon: Trash2,
        action: "delete-all",
        perm: "delete",
        danger: true,
      },
    ],
  },
  {
    id: "employees",
    label: "Employees",
    icon: Users,
    path: "/employees",
    sub: [
      { label: "Add Employee", icon: Plus, action: "add", perm: "create" },
      { label: "Import CSV", icon: FileUp, action: "import", perm: "create" },
      { label: "Export CSV", icon: FileDown, action: "export" },
      {
        label: "Delete All",
        icon: Trash2,
        action: "delete-all",
        perm: "delete",
        danger: true,
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: BarChart3,
    path: "/reports",
    sub: [{ label: "Export Summary", icon: FileDown, action: "export" }],
  },
];

const STOCK_NAV = [
  {
    id: "inventory",
    label: "Inventory Stock",
    icon: Package,
    path: "/inventory",
  },
  { id: "requests", label: "Requests", icon: ClipboardList, path: "/requests" },
  {
    id: "assignments",
    label: "Assignments",
    icon: PackageCheck,
    path: "/assignments",
  },
];

function SectionLabel({ label, collapsed }) {
  if (collapsed)
    return <hr className="my-1 mx-3 border-secondary opacity-25" />;
  return <div className="sidebar-section-label">{label}</div>;
}

function StockNavItem({ item, collapsed, badge }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = location.pathname.startsWith(item.path);
  const Icon = item.icon;
  return (
    <button
      onClick={() => navigate(item.path)}
      className={cn("sidebar-nav-item position-relative", isActive && "active")}
    >
      {isActive && <span className="nav-indicator" />}
      <Icon size={16} className="flex-shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-grow-1 text-start text-truncate">
            {item.label}
          </span>
          {badge > 0 && (
            <span
              className="badge rounded-pill ms-auto"
              style={{
                background: "var(--brand)",
                color: "#fff",
                fontSize: "10px",
              }}
            >
              {badge}
            </span>
          )}
        </>
      )}
    </button>
  );
}

function NavItem({ item, collapsed, canPerm }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive =
    item.path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(item.path);
  const [open, setOpen] = useState(isActive && !!item.sub);
  const Icon = item.icon;

  const visibleSubs = item.sub?.filter(
    (s) => !s.perm || canPerm(item.id, s.perm),
  );

  function handleNav(e) {
    e.preventDefault();
    navigate(item.path);
    if (item.sub) setOpen((o) => !o);
  }

  function handleSubAction(action) {
    navigate(item.path);
    setTimeout(
      () =>
        window.dispatchEvent(
          new CustomEvent("module-action", { detail: { action } }),
        ),
      80,
    );
  }

  return (
    <div>
      <button
        onClick={handleNav}
        className={cn(
          "sidebar-nav-item position-relative",
          isActive && "active",
        )}
      >
        {isActive && <span className="nav-indicator" />}
        <Icon size={16} className="flex-shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-grow-1 text-start text-truncate">
              {item.label}
            </span>
            {item.sub && (
              <ChevronRight
                size={13}
                className="flex-shrink-0 text-secondary"
                style={{
                  transition: "transform 0.2s",
                  transform: open ? "rotate(90deg)" : "none",
                }}
              />
            )}
          </>
        )}
      </button>

      {!collapsed && item.sub && (
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="ms-3 ps-3 border-start border-secondary border-opacity-25 pb-1 mt-1">
                {visibleSubs?.map((s) => {
                  const SIcon = s.icon;
                  return (
                    <button
                      key={s.action}
                      onClick={() => handleSubAction(s.action)}
                      className={cn(
                        "w-100 d-flex align-items-center gap-2 px-2 py-1 rounded text-start border-0 bg-transparent",
                        s.danger ? "text-danger opacity-75" : "text-secondary",
                      )}
                      style={{
                        fontSize: "0.75rem",
                        transition: "color 0.15s, background 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = s.danger
                          ? "rgba(239,68,68,0.1)"
                          : "var(--surface-hover)";
                        e.currentTarget.style.color = s.danger
                          ? "#f87171"
                          : "var(--bs-body-color)";
                        e.currentTarget.style.opacity = "1";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "";
                        e.currentTarget.style.opacity = "";
                      }}
                    >
                      <SIcon size={11} className="flex-shrink-0" />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

export default function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}) {
  const { user, canPerm } = useAuth();
  const isSA = user?.role === "super_admin";
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    function fetchCount() {
      api
        .get("/api/requests/count")
        .then((r) => setPendingCount(r.count || 0))
        .catch((e) => console.error("Requests count error:", e.message));
    }
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [user]);

  return (
    <aside
      id="sidebar"
      className={[collapsed ? "collapsed" : "", mobileOpen ? "mobile-open" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Brand header */}
      <div
        className="position-relative d-flex align-items-center gap-3 px-3 flex-shrink-0 overflow-hidden"
        style={{
          height: 56,
          background:
            "linear-gradient(135deg, rgba(0,170,47,0.08) 0%, transparent 60%)",
        }}
      >
        <BykeaB
          size={26}
          color="#00AA2F"
          className="flex-shrink-0 position-relative"
          style={{
            filter: "drop-shadow(0 0 8px rgba(0,170,47,0.4))",
            zIndex: 1,
          }}
        />
        {!collapsed && (
          <div className="overflow-hidden" style={{ zIndex: 1 }}>
            <div
              className="fw-bold text-light"
              style={{ fontSize: "0.875rem", letterSpacing: "0.05em" }}
            >
              ITMS
            </div>
            <div className="text-secondary" style={{ fontSize: "10px" }}>
              Bykea IT Department
            </div>
          </div>
        )}
        <div
          className="position-absolute bottom-0 start-0 end-0"
          style={{
            height: 1,
            background:
              "linear-gradient(to right, rgba(0,170,47,0.2), transparent)",
          }}
        />
      </div>

      {/* Nav */}
      <nav
        className="flex-grow-1 overflow-y-auto overflow-x-hidden py-2 px-2"
        style={{ overflowX: "hidden" }}
      >
        <SectionLabel label="Overview" collapsed={collapsed} />
        <NavItem item={NAV[0]} collapsed={collapsed} canPerm={canPerm} />

        <SectionLabel label="Inventory" collapsed={collapsed} />
        {NAV.slice(1, 7)
          .filter((item) => canPerm(item.id, "read"))
          .map((item) => (
            <NavItem
              key={item.id}
              item={item}
              collapsed={collapsed}
              canPerm={canPerm}
            />
          ))}

        <SectionLabel label="Stock & Requests" collapsed={collapsed} />
        {STOCK_NAV.filter(
          (item) => canPerm("inventory", "read") || item.id === "requests",
        ).map((item) => (
          <StockNavItem
            key={item.id}
            item={item}
            collapsed={collapsed}
            badge={item.id === "requests" ? pendingCount : 0}
          />
        ))}

        <SectionLabel label="Analytics" collapsed={collapsed} />
        {canPerm("reports", "read") && (
          <NavItem item={NAV[7]} collapsed={collapsed} canPerm={canPerm} />
        )}

        {canPerm("vendors", "read") && (
          <>
            <SectionLabel label="Procurement" collapsed={collapsed} />
            <StockNavItem
              item={{
                id: "vendors",
                label: "Vendors",
                icon: Store,
                path: "/vendors",
              }}
              collapsed={collapsed}
              badge={0}
            />
          </>
        )}

        {isSA && (
          <>
            <SectionLabel label="Master Data" collapsed={collapsed} />
            <StockNavItem
              item={{
                id: "masterdata-heads",
                label: "Head & Sub-Head",
                icon: Layers,
                path: "/masterdata/heads",
              }}
              collapsed={collapsed}
              badge={0}
            />
          </>
        )}

        {isSA && (
          <>
            <SectionLabel label="Management" collapsed={collapsed} />
            <NavItem
              item={{
                id: "users",
                label: "User Management",
                icon: UserCog,
                path: "/users",
              }}
              collapsed={collapsed}
              canPerm={canPerm}
            />
            <NavItem
              item={{
                id: "logs",
                label: "Activity Log",
                icon: ScrollText,
                path: "/logs",
              }}
              collapsed={collapsed}
              canPerm={canPerm}
            />
          </>
        )}
      </nav>

      {/* Toggle */}
      <div className="flex-shrink-0 p-2 border-top border-secondary border-opacity-25">
        <button
          onClick={onToggle}
          className="sidebar-nav-item justify-content-center"
          style={{ color: "#71717a" }}
        >
          {collapsed ? (
            <PanelLeftOpen size={15} />
          ) : (
            <>
              <PanelLeftClose size={15} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
