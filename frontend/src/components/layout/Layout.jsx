import React, { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import ChatBot from "../ui/ChatBot";

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;

  // Close mobile sidebar on route change
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function handleRefresh() {
    navigate(location.pathname + location.search, { replace: true });
    window.dispatchEvent(
      new CustomEvent("module-action", { detail: { action: "refresh" } }),
    );
  }

  return (
    <div>
      {/* Mobile backdrop */}
      <div
        id="sidebar-backdrop"
        className={mobileOpen ? "show" : ""}
        onClick={() => setMobileOpen(false)}
      />
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div id="main-content" className={collapsed ? "sidebar-collapsed" : ""}>
        <Header
          onRefresh={handleRefresh}
          onMobileMenuToggle={() => setMobileOpen((o) => !o)}
        />
        <main className="flex-grow-1 p-3 p-md-4">
          <Outlet />
        </main>
        <footer
          className="text-center py-2 text-muted border-top"
          style={{ fontSize: "11px" }}
        >
          © {new Date().getFullYear()} Bykea IT Department · Created by Zeeshan
          Rafiq · v2.0
        </footer>
      </div>
      <ChatBot />
    </div>
  );
}
