import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Eye,
  EyeOff,
  LogIn,
  Monitor,
  Users,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import BykeaB from "../components/ui/BykeaB";

const FEATURES = [
  { icon: Monitor, text: "Full device lifecycle management" },
  { icon: Users, text: "Employee & assignment tracking" },
  { icon: BarChart3, text: "Analytics, reports & warranty alerts" },
  { icon: ShieldCheck, text: "Role-based access control" },
];

export default function Login() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/login", form);
      const user = await api.get("/auth/me");
      setUser(user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="d-flex min-vh-100" style={{ background: "#09090b" }}>
      {/* Left branding panel (desktop only) */}
      <div
        className="d-none d-lg-flex flex-column login-brand-panel position-relative overflow-hidden p-5"
        style={{ width: 440, minWidth: 440 }}
      >
        {/* Decorations */}
        <div
          className="position-absolute rounded-circle"
          style={{
            top: -80,
            left: -80,
            width: 320,
            height: 320,
            background: "rgba(0,170,47,0.07)",
            filter: "blur(40px)",
            pointerEvents: "none",
          }}
        />
        <div
          className="position-absolute rounded-circle"
          style={{
            bottom: 0,
            right: 0,
            width: 200,
            height: 200,
            background: "rgba(0,170,47,0.04)",
            filter: "blur(40px)",
            pointerEvents: "none",
          }}
        />

        {/* Logo */}
        <div className="d-flex align-items-center gap-3 mb-5 position-relative">
          <BykeaB
            size={34}
            color="#00AA2F"
            style={{ filter: "drop-shadow(0 0 12px rgba(0,170,47,0.5))" }}
          />
          <div>
            <div
              className="fw-bold text-light"
              style={{ fontSize: "1rem", letterSpacing: "0.05em" }}
            >
              ITMS
            </div>
            <div className="text-secondary" style={{ fontSize: "0.75rem" }}>
              Bykea IT Department
            </div>
          </div>
        </div>

        {/* Hero text */}
        <div className="position-relative flex-grow-1">
          <h2
            className="fw-bold text-white lh-sm mb-3"
            style={{ fontSize: "1.75rem" }}
          >
            Manage your IT assets{" "}
            <span style={{ color: "var(--brand)" }}>intelligently</span>
          </h2>
          <p
            className="text-secondary mb-5"
            style={{ fontSize: "0.875rem", lineHeight: 1.7 }}
          >
            Track devices, employees and inventory — everything your IT team
            needs in one unified platform.
          </p>

          <div className="d-flex flex-column gap-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="d-flex align-items-center gap-3">
                <div
                  className="d-flex align-items-center justify-content-center flex-shrink-0 rounded-2"
                  style={{
                    width: 32,
                    height: 32,
                    background: "rgba(0,170,47,0.1)",
                    border: "1px solid rgba(0,170,47,0.2)",
                  }}
                >
                  <Icon size={14} style={{ color: "var(--brand)" }} />
                </div>
                <span
                  className="text-secondary"
                  style={{ fontSize: "0.875rem" }}
                >
                  {text}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="position-relative mt-auto pt-4">
          <hr style={{ borderColor: "#27272a", opacity: 1 }} />
          <p className="text-secondary mb-0" style={{ fontSize: "11px" }}>
            © {new Date().getFullYear()} Bykea Technologies · IT Asset
            Management System
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-grow-1 d-flex align-items-center justify-content-center p-4 p-lg-5 position-relative">
        <div
          className="position-absolute rounded-circle"
          style={{
            top: "30%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            width: 384,
            height: 384,
            background: "rgba(0,170,47,0.04)",
            filter: "blur(40px)",
            pointerEvents: "none",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="position-relative w-100"
          style={{ maxWidth: 360 }}
        >
          {/* Mobile logo */}
          <div className="d-lg-none d-flex flex-column align-items-center mb-4">
            <BykeaB
              size={36}
              color="#00AA2F"
              className="mb-3"
              style={{ filter: "drop-shadow(0 0 12px rgba(0,170,47,0.4))" }}
            />
            <h1 className="fw-bold text-light" style={{ fontSize: "1.1rem" }}>
              IT Management System
            </h1>
            <p
              className="text-secondary mt-1 mb-0"
              style={{ fontSize: "0.875rem" }}
            >
              Bykea IT Department
            </p>
          </div>

          {/* Form card */}
          <div className="itms-card p-4 shadow-lg">
            <div className="mb-4">
              <h2
                className="fw-bold text-light mb-1"
                style={{ fontSize: "1.25rem" }}
              >
                Welcome back
              </h2>
              <p
                className="text-secondary mb-0"
                style={{ fontSize: "0.875rem" }}
              >
                Sign in to your ITMS account
              </p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="alert alert-danger d-flex align-items-start gap-2 py-2 mb-3"
                style={{ fontSize: "0.875rem" }}
              >
                <span className="flex-shrink-0">⚠</span>
                {error}
              </motion.div>
            )}

            <form onSubmit={submit}>
              <div className="mb-3">
                <label
                  className="form-label small fw-semibold text-secondary text-uppercase"
                  style={{ letterSpacing: "0.05em", fontSize: "0.7rem" }}
                >
                  Username
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  required
                  value={form.username}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, username: e.target.value }))
                  }
                  className="form-control"
                  placeholder="Enter your username"
                />
              </div>

              <div className="mb-4">
                <label
                  className="form-label small fw-semibold text-secondary text-uppercase"
                  style={{ letterSpacing: "0.05em", fontSize: "0.7rem" }}
                >
                  Password
                </label>
                <div className="position-relative">
                  <input
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={form.password}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, password: e.target.value }))
                    }
                    className="form-control pe-5"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="btn btn-link text-secondary position-absolute top-50 end-0 translate-middle-y pe-2 p-0"
                    style={{ zIndex: 5 }}
                  >
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2 fw-semibold"
              >
                {loading ? (
                  <>
                    <div
                      className="spinner-border spinner-border-sm"
                      role="status"
                      style={{ width: "1rem", height: "1rem" }}
                    />
                    Signing in…
                  </>
                ) : (
                  <>
                    <LogIn size={15} /> Sign In
                  </>
                )}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
