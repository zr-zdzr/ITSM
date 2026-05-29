import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import Layout from "./components/layout/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Systems from "./pages/SystemDevices";
import NetworkDevices from "./pages/NetworkDevices";
import MobileDevices from "./pages/MobileDevices";
import SIMCards from "./pages/SIMCards";
import CloudIDs from "./pages/CloudIDs";
import Employees from "./pages/Employees";
import Reports from "./pages/Reports";
import UserManagement from "./pages/UserManagement";
import ActivityLog from "./pages/ActivityLog";
import Inventory from "./pages/Inventory";
import Requests from "./pages/Requests";
import Assignments from "./pages/Assignments";
import Vendors from "./pages/Vendors";

function Guard({ children }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div
        className="d-flex align-items-center justify-content-center"
        style={{ minHeight: "100vh", background: "var(--bs-body-bg, #09090b)" }}
      >
        <div
          className="spinner-border text-primary"
          role="status"
          style={{ width: 28, height: 28, borderWidth: 2 }}
        />
      </div>
    );
  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/"
        element={
          <Guard>
            <Layout />
          </Guard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="systems" element={<Systems />} />
        <Route path="network" element={<NetworkDevices />} />
        <Route path="mobiles" element={<MobileDevices />} />
        <Route path="sims" element={<SIMCards />} />
        <Route path="gws" element={<CloudIDs />} />
        <Route path="employees" element={<Employees />} />
        <Route path="reports" element={<Reports />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="logs" element={<ActivityLog />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="requests" element={<Requests />} />
        <Route path="assignments" element={<Assignments />} />
        <Route path="vendors" element={<Vendors />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
