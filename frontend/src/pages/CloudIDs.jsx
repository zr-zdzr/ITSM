import React, { useEffect, useState } from "react";
import ModulePage from "./ModulePage";
import Badge from "../components/ui/Badge";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";

const VALID_LICENSES = ["Starter", "Standard", "Vault", "Not Assigned"];

const LIC_STYLE = {
  Starter: { bg: "rgba(99,102,241,0.12)", color: "#818cf8" },
  Standard: { bg: "rgba(34,197,94,0.12)", color: "#4ade80" },
  Vault: { bg: "rgba(139,92,246,0.12)", color: "#c4b5fd" },
  "Not Assigned": { bg: "rgba(113,113,122,0.18)", color: "#a1a1aa" },
};

function LicenseBadge({ value }) {
  if (!value) return <span className="text-secondary">—</span>;
  const s = LIC_STYLE[value] || LIC_STYLE["Not Assigned"];
  return (
    <span
      className="badge rounded-pill px-2 py-1"
      style={{ fontSize: "10px", background: s.bg, color: s.color }}
    >
      {value}
    </span>
  );
}

function Fld({ label, required, children }) {
  return (
    <div>
      <label className="form-label small fw-medium mb-1">
        {label}
        {required && <span className="text-danger ms-1">*</span>}
      </label>
      {children}
    </div>
  );
}
const inp = "form-control form-control-sm";
const sel = "form-select form-select-sm";

function CloudForm({ vals, setVals }) {
  const [employees, setEmployees] = useState([]);
  const { toast } = useToast();
  const set = (k, v) => setVals((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/employees?status=active")
      .then((d) => {
        if (!cancelled) setEmployees(d);
      })
      .catch((e) => {
        if (!cancelled) toast(e.message, "error");
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  function handleEmployeeSelect(e) {
    const emp = employees.find((x) => String(x.id) === e.target.value);
    if (emp) {
      const parts = (emp.full_name || "").trim().split(/\s+/);
      const first = parts[0] || "";
      const last = parts.slice(1).join(" ") || "";
      setVals((p) => ({
        ...p,
        _emp_id: emp.id,
        email: emp.email || "",
        first_name: first,
        last_name: last,
      }));
    } else {
      setVals((p) => ({ ...p, _emp_id: "", email: "" }));
    }
  }

  const selectedEmpId =
    vals._emp_id ||
    (employees.find(
      (e) =>
        e.email && e.email.toLowerCase() === (vals.email || "").toLowerCase(),
    )?.id ??
      "");

  return (
    <div
      className="row g-3"
      style={{ maxHeight: "65vh", overflowY: "auto", paddingRight: 4 }}
    >
      <div className="col-12 form-sec-head">
        <span>Employee Link</span>
        <hr />
      </div>

      <div className="col-12">
        <Fld label="Employee Name (auto-fills Email)">
          <select
            className={sel}
            value={selectedEmpId}
            onChange={handleEmployeeSelect}
          >
            <option value="">— Select employee to auto-fill email —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
                {e.email ? ` — ${e.email}` : ""}
              </option>
            ))}
          </select>
          <div
            className="form-text text-secondary"
            style={{ fontSize: "10px" }}
          >
            Selecting an employee auto-fills the email. The Employee Name column
            in the table is derived from this link.
          </div>
        </Fld>
      </div>

      <div className="col-12 form-sec-head">
        <span>Identity</span>
        <hr />
      </div>

      <div className="col-md-6">
        <Fld label="First Name" required>
          <input
            className={inp}
            value={vals.first_name || ""}
            onChange={(e) => set("first_name", e.target.value)}
            placeholder="Ali"
          />
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="Last Name" required>
          <input
            className={inp}
            value={vals.last_name || ""}
            onChange={(e) => set("last_name", e.target.value)}
            placeholder="Raza"
          />
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="Email" required>
          <input
            type="email"
            className={inp}
            value={vals.email || ""}
            onChange={(e) => set("email", e.target.value)}
            placeholder="user@bykea.com"
          />
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="License" required>
          <select
            className={sel}
            value={vals.license || ""}
            onChange={(e) => set("license", e.target.value)}
          >
            <option value="">— Select License —</option>
            {VALID_LICENSES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Fld>
      </div>

      <div className="col-12 form-sec-head">
        <span>Account Details</span>
        <hr />
      </div>

      <div className="col-md-6">
        <Fld label="Org Unit">
          <input
            className={inp}
            value={vals.org_unit || ""}
            onChange={(e) => set("org_unit", e.target.value)}
            placeholder="/Engineering"
          />
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="Phone Number">
          <input
            className={inp}
            value={vals.phone_number || ""}
            onChange={(e) => set("phone_number", e.target.value)}
            placeholder="0321-0000000"
          />
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="Status">
          <select
            className={sel}
            value={vals.status || "active"}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </Fld>
      </div>
    </div>
  );
}

function CloudView({ row }) {
  const DT = ({ label, value }) => (
    <div className="col-6">
      <dt
        className="text-secondary fw-semibold text-uppercase mb-1"
        style={{ fontSize: "11px", letterSpacing: "0.05em" }}
      >
        {label}
      </dt>
      <dd className="small mb-0">
        {value || <span className="text-secondary">—</span>}
      </dd>
    </div>
  );
  return (
    <dl className="row g-3">
      <DT label="Employee Name" value={row.employee_name} />
      <DT label="Email" value={row.email} />
      <DT label="First Name" value={row.first_name} />
      <DT label="Last Name" value={row.last_name} />
      <DT label="Org Unit" value={row.org_unit} />
      <DT label="Phone Number" value={row.phone_number} />
      <div className="col-6">
        <dt
          className="text-secondary fw-semibold text-uppercase mb-1"
          style={{ fontSize: "11px", letterSpacing: "0.05em" }}
        >
          License
        </dt>
        <dd className="small mb-0">
          <LicenseBadge value={row.license} />
        </dd>
      </div>
      <div className="col-6">
        <dt
          className="text-secondary fw-semibold text-uppercase mb-1"
          style={{ fontSize: "11px", letterSpacing: "0.05em" }}
        >
          Status
        </dt>
        <dd className="small mb-0">
          <Badge status={row.status}>{row.status || "—"}</Badge>
        </dd>
      </div>
    </dl>
  );
}

const config = {
  title: "Cloud ID",
  module: "gws",
  apiPath: "/api/gws",
  exportFile: "cloud_ids_export.csv",
  sampleFile: "cloud_ids_sample.csv",
  searchPlaceholder: "Search by name, email, org unit…",

  columns: [
    {
      key: "employee_name",
      label: "Employee Name",
      sortable: true,
      render: (v) =>
        v ? (
          <span className="fw-medium">{v}</span>
        ) : (
          <span className="text-secondary">—</span>
        ),
    },
    { key: "first_name", label: "First Name", sortable: true },
    { key: "last_name", label: "Last Name", sortable: true },
    {
      key: "email",
      label: "Email",
      sortable: true,
      render: (v) => (
        <span className="font-monospace" style={{ fontSize: "0.75rem" }}>
          {v}
        </span>
      ),
    },
    {
      key: "org_unit",
      label: "Org Unit",
      render: (v) => v || <span className="text-secondary">—</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (v) => <Badge status={v}>{v || "—"}</Badge>,
    },
    {
      key: "phone_number",
      label: "Phone",
      render: (v) => v || <span className="text-secondary">—</span>,
    },
    {
      key: "license",
      label: "License",
      render: (v) => <LicenseBadge value={v} />,
    },
  ],

  fields: [],

  validate: (vals) => {
    if (!vals.first_name?.trim()) return "First Name is required";
    if (!vals.last_name?.trim()) return "Last Name is required";
    if (!vals.email?.trim()) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vals.email))
      return "Enter a valid email address";
    if (!vals.license) return "License is required";
    if (!VALID_LICENSES.includes(vals.license))
      return `License must be one of: ${VALID_LICENSES.join(", ")}`;
    return null;
  },

  renderForm: (vals, setVals) => <CloudForm vals={vals} setVals={setVals} />,
  renderView: (row) => <CloudView row={row} />,
};

export default function CloudIDs() {
  return <ModulePage config={config} />;
}
