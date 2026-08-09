import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  UserPlus,
  Trash2,
  Shield,
  AlertTriangle,
  Check,
  Users2,
  Download,
} from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import Modal from "../components/ui/Modal";
import { Navigate } from "react-router-dom";

const ROLE_COLORS = {
  super_admin: { bg: "rgba(244,63,94,0.1)", color: "#fb7185" },
  user: { bg: "rgba(0,170,47,0.1)", color: "#4ade80" },
  employee: { bg: "rgba(59,130,246,0.1)", color: "#7dd3fc" },
  viewer: { bg: "rgba(113,113,122,0.15)", color: "#a1a1aa" },
};

const MODULES = [
  { id: "systems", label: "Systems" },
  { id: "network", label: "Network Devices" },
  { id: "mobiles", label: "Mobile Devices" },
  { id: "sims", label: "SIM Cards" },
  { id: "gws", label: "Cloud IDs" },
  { id: "employees", label: "Employees" },
  { id: "reports", label: "Reports" },
  { id: "inventory", label: "Inventory / Requests" },
  { id: "vendors", label: "Vendors" },
  { id: "support", label: "Support Tickets" },
];
const CRUDS = ["create", "read", "update", "delete"];

function emptyPerms() {
  const p = {};
  MODULES.forEach((m) => {
    p[m.id] = {
      can_create: false,
      can_read: false,
      can_update: false,
      can_delete: false,
    };
  });
  return p;
}

const inp = "form-control form-control-sm";
const sel = "form-select form-select-sm";

export default function UserManagement() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [form, setForm] = useState({
    employee_id: "",
    role: "user",
    password: "",
  });
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);

  const [permTarget, setPermTarget] = useState(null);
  const [perms, setPerms] = useState(() => emptyPerms());
  const [permSaving, setPermSaving] = useState(false);

  const [provisionConfirm, setProvisionConfirm] = useState(false);
  const [provisionResult, setProvisionResult] = useState(null);
  const [provisioning, setProvisioning] = useState(false);
  const [ssoMode, setSsoMode] = useState(false);

  useEffect(() => {
    api
      .get("/auth/config")
      .then((c) => setSsoMode(c.google === true))
      .catch(() => setSsoMode(false));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const userList = await api.get("/api/users");
      setUsers(userList);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  function loadAvailableEmployees() {
    api
      .get("/api/users/employees/available")
      .then(setEmployees)
      .catch((e) => toast(e.message, "error"));
  }

  useEffect(() => {
    if (me?.role !== "super_admin") return;
    load();
    loadAvailableEmployees();
    // loadAvailableEmployees is defined in component scope and only uses stable refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, me?.role]);

  if (me?.role !== "super_admin") return <Navigate to="/" replace />;

  async function runProvision() {
    setProvisioning(true);
    try {
      const result = await api.post("/api/users/bulk-provision");
      setProvisionConfirm(false);
      setProvisionResult(result);
      await load();
      loadAvailableEmployees();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setProvisioning(false);
    }
  }

  function downloadProvisionCsv() {
    const rows = ssoMode
      ? [
          "name,email",
          ...provisionResult.created.map((c) => `"${c.name}","${c.email}"`),
        ].join("\n")
      : [
          "name,email,temp_password",
          ...provisionResult.created.map(
            (c) => `"${c.name}","${c.email}","${c.temp_password}"`,
          ),
        ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows], { type: "text/csv" }));
    a.download = "employee-accounts.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function addUser() {
    if (!form.employee_id) return toast("Select an employee", "error");
    // Under Google SSO accounts are passwordless — the person signs in with
    // their company Google account.
    if (!ssoMode && (!form.password || form.password.length < 6))
      return toast("Password must be at least 6 characters", "error");
    setSaving(true);
    try {
      await api.post("/api/users", form);
      toast("User created", "success");
      setAddModal(false);
      setForm({ employee_id: "", role: "user", password: "" });
      await load();
      loadAvailableEmployees();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(u) {
    try {
      await api.del(`/api/users/${u.id}`);
      toast("User removed", "success");
      setDelTarget(null);
      setUsers((p) => p.filter((x) => x.id !== u.id));
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function openPerms(u) {
    setPermTarget(u);
    try {
      const data = await api.get(`/api/users/${u.id}/permissions`);
      setPerms(data);
    } catch (e) {
      toast(e.message, "error");
      setPerms(emptyPerms());
    }
  }

  function togglePerm(mod, action) {
    setPerms((p) => ({
      ...p,
      [mod]: { ...p[mod], [`can_${action}`]: !p[mod]?.[`can_${action}`] },
    }));
  }

  async function savePerms() {
    setPermSaving(true);
    try {
      await api.put(`/api/users/${permTarget.id}/permissions`, {
        permissions: perms,
      });
      toast("Permissions saved", "success");
      setPermTarget(null);
      await load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setPermSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="d-flex flex-column gap-4"
    >
      <div className="d-flex align-items-center justify-content-between">
        <p className="small text-secondary mb-0">
          {users.length} portal user{users.length !== 1 ? "s" : ""}
        </p>
        <div className="d-flex align-items-center gap-2">
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-2"
            onClick={() => setProvisionConfirm(true)}
          >
            <Users2 size={14} /> Provision Employee Accounts
          </button>
          <button
            className="btn btn-primary btn-sm d-flex align-items-center gap-2"
            onClick={() => setAddModal(true)}
          >
            <UserPlus size={14} /> Add User
          </button>
        </div>
      </div>

      <div className="itms-card overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="table table-hover mb-0"
            style={{ fontSize: "0.8125rem" }}
          >
            <thead>
              <tr>
                {["Name", "Email", "Role", "Modules with Access", ""].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-uppercase text-secondary"
                      style={{ fontSize: "11px", letterSpacing: "0.05em" }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center text-secondary py-5">
                    Loading…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-secondary py-5">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const rs = ROLE_COLORS[u.role] || ROLE_COLORS.user;
                  return (
                    <tr key={u.id}>
                      <td className="fw-medium align-middle">{u.name}</td>
                      <td className="small text-secondary align-middle">
                        {u.email}
                      </td>
                      <td className="align-middle">
                        <span
                          className="badge rounded-pill px-2 py-1"
                          style={{
                            background: rs.bg,
                            color: rs.color,
                            fontSize: "11px",
                          }}
                        >
                          {u.role?.replace("_", " ")}
                        </span>
                      </td>
                      <td className="align-middle">
                        {u.role === "super_admin" ? (
                          <span className="small text-secondary">
                            All modules (full access)
                          </span>
                        ) : u.permissions ? (
                          <div className="d-flex flex-wrap gap-1">
                            {Object.keys(u.permissions)
                              .filter((k) => u.permissions[k].can_read)
                              .map((k) => (
                                <span
                                  key={k}
                                  className="badge bg-secondary bg-opacity-25 text-secondary"
                                  style={{ fontSize: "10px" }}
                                >
                                  {k}
                                </span>
                              ))}
                            {Object.keys(u.permissions).every(
                              (k) => !u.permissions[k].can_read,
                            ) && (
                              <span className="small text-secondary">
                                No access
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="small text-secondary">—</span>
                        )}
                      </td>
                      <td className="align-middle text-end">
                        <div className="d-flex align-items-center gap-1 justify-content-end">
                          {u.role !== "super_admin" && (
                            <button
                              onClick={() => openPerms(u)}
                              title="Edit Permissions"
                              className="btn btn-link text-secondary p-1"
                              style={{ lineHeight: 1 }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.color = "var(--brand)")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.color = "")
                              }
                            >
                              <Shield size={13} />
                            </button>
                          )}
                          {u.id !== me?.id && (
                            <button
                              onClick={() => setDelTarget(u)}
                              className="btn btn-link text-secondary p-1"
                              style={{ lineHeight: 1 }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.color = "#f87171")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.color = "")
                              }
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title="Add Portal User"
        size="sm"
      >
        <div className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small fw-medium mb-1">
              Employee<span className="text-danger ms-1">*</span>
            </label>
            <select
              value={form.employee_id}
              onChange={(e) =>
                setForm((p) => ({ ...p, employee_id: e.target.value }))
              }
              className={sel}
            >
              <option value="">— Select employee —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} — {e.designation}
                </option>
              ))}
            </select>
          </div>
          {ssoMode ? (
            <p className="small text-secondary mb-0">
              No password needed — they will sign in with their company Google
              account.
            </p>
          ) : (
            <div>
              <label className="form-label small fw-medium mb-1">
                Password<span className="text-danger ms-1">*</span>
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm((p) => ({ ...p, password: e.target.value }))
                }
                className={inp}
                placeholder="Min. 6 characters"
              />
            </div>
          )}
          <div>
            <label className="form-label small fw-medium mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              className={sel}
            >
              <option value="user">User</option>
              <option value="employee">
                Employee (self-service tickets &amp; requests only)
              </option>
              <option value="super_admin">Super Admin (full access)</option>
            </select>
          </div>
        </div>
        <div className="d-flex justify-content-end gap-2 mt-4">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setAddModal(false)}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={addUser}
            disabled={saving}
          >
            {saving ? "Creating…" : "Create User"}
          </button>
        </div>
      </Modal>

      {/* Permissions Modal */}
      <Modal
        open={!!permTarget}
        onClose={() => setPermTarget(null)}
        title={`Permissions — ${permTarget?.name}`}
        size="lg"
      >
        <div className="table-responsive">
          <table
            className="table table-hover mb-0"
            style={{ fontSize: "0.8125rem" }}
          >
            <thead>
              <tr>
                <th
                  className="text-uppercase text-secondary"
                  style={{ fontSize: "11px", width: 160 }}
                >
                  Module
                </th>
                {CRUDS.map((c) => (
                  <th
                    key={c}
                    className="text-uppercase text-secondary text-center"
                    style={{ fontSize: "11px" }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m.id}>
                  <td className="fw-medium align-middle">{m.label}</td>
                  {CRUDS.map((action) => (
                    <td key={action} className="text-center align-middle">
                      <button
                        onClick={() => togglePerm(m.id, action)}
                        className="d-flex align-items-center justify-content-center mx-auto rounded-2 border-0"
                        style={{
                          width: 20,
                          height: 20,
                          background: perms[m.id]?.[`can_${action}`]
                            ? "var(--brand)"
                            : "rgba(113,113,122,0.2)",
                          color: perms[m.id]?.[`can_${action}`]
                            ? "#fff"
                            : "transparent",
                          cursor: "pointer",
                          transition: "background 0.15s",
                        }}
                      >
                        <Check size={11} />
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setPermTarget(null)}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={savePerms}
            disabled={permSaving}
          >
            {permSaving ? "Saving…" : "Save Permissions"}
          </button>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        title="Remove User"
        size="sm"
      >
        <div className="d-flex gap-3">
          <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-1" />
          <p className="small mb-0">
            Remove <strong>{delTarget?.name}</strong> from portal access?
          </p>
        </div>
        <div className="d-flex justify-content-end gap-2 mt-4">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setDelTarget(null)}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => deleteUser(delTarget)}
          >
            Remove
          </button>
        </div>
      </Modal>

      {/* Provision confirm */}
      <Modal
        open={provisionConfirm}
        onClose={() => setProvisionConfirm(false)}
        title="Provision Employee Accounts"
      >
        <p className="small text-secondary">
          This creates a portal login (role <b>employee</b>) for every active
          employee that has an email address and no account yet.{" "}
          {ssoMode ? (
            <>
              Accounts are passwordless — each person signs in with their
              company Google account.
            </>
          ) : (
            <>
              Each account gets a one-time temporary password shown{" "}
              <b>only once</b> on the next screen, and the employee must change
              it on first login.
            </>
          )}
        </p>
        <div className="d-flex justify-content-end gap-2">
          <button
            onClick={() => setProvisionConfirm(false)}
            className="btn btn-secondary btn-sm"
          >
            Cancel
          </button>
          <button
            onClick={runProvision}
            disabled={provisioning}
            className="btn btn-primary btn-sm"
          >
            {provisioning ? "Provisioning…" : "Create Accounts"}
          </button>
        </div>
      </Modal>

      {/* Provision results — the only time the temp passwords are visible */}
      <Modal
        open={!!provisionResult}
        onClose={() => setProvisionResult(null)}
        title="Accounts Created"
      >
        {provisionResult && (
          <div className="d-flex flex-column gap-3">
            {!ssoMode && (
              <div
                className="p-2 rounded-2 small"
                style={{ background: "rgba(245,158,11,0.1)", color: "#fbbf24" }}
              >
                These temporary passwords are shown only once — download or copy
                them now. They are not stored anywhere.
              </div>
            )}
            {!provisionResult.created.length ? (
              <p className="small text-secondary mb-0">
                No eligible employees — everyone active with an email already
                has an account.
              </p>
            ) : (
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                <table
                  className="table table-sm mb-0"
                  style={{ fontSize: "0.8rem" }}
                >
                  <thead>
                    <tr className="small text-secondary">
                      <th>Name</th>
                      <th>Email</th>
                      {!ssoMode && <th>Temp Password</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {provisionResult.created.map((c) => (
                      <tr key={c.email}>
                        <td>{c.name}</td>
                        <td className="text-secondary">{c.email}</td>
                        {!ssoMode && (
                          <td className="font-monospace">{c.temp_password}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {provisionResult.skipped.length > 0 && (
              <p className="small text-secondary mb-0">
                Skipped:{" "}
                {provisionResult.skipped.map((s) => s.email).join(", ")}
              </p>
            )}
            <div className="d-flex justify-content-end gap-2">
              {provisionResult.created.length > 0 && (
                <button
                  onClick={downloadProvisionCsv}
                  className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
                >
                  <Download size={13} /> Download CSV
                </button>
              )}
              <button
                onClick={() => setProvisionResult(null)}
                className="btn btn-primary btn-sm"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </motion.div>
  );
}
