import React, { useEffect, useState } from "react";
import ModulePage from "./ModulePage";
import Badge from "../components/ui/Badge";
import { api } from "../lib/api";
import { PackageCheck, RotateCcw } from "lucide-react";
import { cn, fmtDate } from "../lib/utils";

const ASN_STATUS = {
  active: { bg: "rgba(34,197,94,0.1)", color: "#4ade80" },
  partially_returned: { bg: "rgba(245,158,11,0.1)", color: "#fbbf24" },
  fully_returned: { bg: "rgba(113,113,122,0.2)", color: "#a1a1aa" },
};

function EmployeeAssignments({ row }) {
  const [assignments, setAssignments] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!row?.id) return;
    setLoading(true);
    api
      .get(`/api/assignments/employee/${row.id}`)
      .then(setAssignments)
      .catch((e) => {
        console.error("Failed to load employee assignments:", e.message);
        setAssignments([]);
      })
      .finally(() => setLoading(false));
  }, [row?.id]);

  const active =
    assignments?.filter((a) => a.status !== "fully_returned") || [];

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-3">
        <PackageCheck size={13} style={{ color: "#2dd4bf" }} />
        <span
          className="fw-semibold text-secondary text-uppercase"
          style={{ fontSize: "0.7rem", letterSpacing: "0.1em" }}
        >
          Inventory Assignments
        </span>
        {!loading && (
          <span
            className="badge bg-secondary bg-opacity-25 text-secondary"
            style={{ fontSize: "10px" }}
          >
            {active.length} active
          </span>
        )}
      </div>

      {loading ? (
        <p className="small text-secondary py-2 mb-0">Loading…</p>
      ) : active.length === 0 ? (
        <p className="small text-secondary py-2 mb-0">
          No active inventory assignments
        </p>
      ) : (
        <div className="d-flex flex-column gap-3">
          {active.map((asn) => {
            const s = ASN_STATUS[asn.status] || ASN_STATUS.fully_returned;
            return (
              <div
                key={asn.id}
                className="rounded-3 overflow-hidden"
                style={{ border: "1px solid var(--bs-border-color)" }}
              >
                <div
                  className="d-flex align-items-center justify-content-between px-3 py-2"
                  style={{
                    borderBottom: "1px solid var(--bs-border-color)",
                    background: "var(--surface-subtle)",
                  }}
                >
                  <span className="font-monospace small text-secondary">
                    {asn.asn_number}
                  </span>
                  <div className="d-flex align-items-center gap-2">
                    <span className="small text-secondary">
                      {fmtDate(asn.assigned_date)}
                    </span>
                    <span
                      className="badge px-2 py-1"
                      style={{
                        background: s.bg,
                        color: s.color,
                        fontSize: "10px",
                      }}
                    >
                      {asn.status?.replace("_", " ")}
                    </span>
                  </div>
                </div>
                <div className="px-3 py-2">
                  {(asn.items || [])
                    .filter((i) => i.status === "active")
                    .map((item) => (
                      <div
                        key={item.id}
                        className="d-flex align-items-center justify-content-between"
                        style={{ fontSize: "0.75rem" }}
                      >
                        <span>{item.item_name}</span>
                        <span className="text-secondary">
                          × {item.qty} {item.unit}
                        </span>
                      </div>
                    ))}
                  {asn.expected_return_date && (
                    <p
                      className={cn(
                        "mt-1 mb-0",
                        new Date(asn.expected_return_date) < new Date()
                          ? "text-danger"
                          : "text-secondary",
                      )}
                      style={{ fontSize: "10px" }}
                    >
                      <RotateCcw size={9} className="me-1" />
                      Return by {fmtDate(asn.expected_return_date)}
                      {new Date(asn.expected_return_date) < new Date() &&
                        " · OVERDUE"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────
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

// ── Custom Form ───────────────────────────────────────────────
function EmployeeForm({ vals, setVals }) {
  const set = (k, v) => setVals((p) => ({ ...p, [k]: v }));
  return (
    <div
      className="row g-3"
      style={{ maxHeight: "65vh", overflowY: "auto", paddingRight: 4 }}
    >
      <div className="col-12 form-sec-head">
        <span>Personal Information</span>
        <hr />
      </div>

      <div className="col-12">
        <Fld label="Employee Name (Full Name)" required>
          <input
            className={inp}
            value={vals.full_name || ""}
            onChange={(e) => set("full_name", e.target.value.slice(0, 50))}
            placeholder="e.g. Muhammad Ali Khan"
            maxLength={50}
          />
          <div
            className="form-text text-secondary"
            style={{ fontSize: "10px" }}
          >
            Max 50 characters · spaces allowed · do not abbreviate
          </div>
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="Email">
          <input
            type="email"
            className={inp}
            value={vals.email || ""}
            onChange={(e) => set("email", e.target.value)}
            placeholder="name@bykea.com"
          />
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="Mobile Number">
          <input
            className={inp}
            value={vals.mobile_number || ""}
            onChange={(e) => set("mobile_number", e.target.value)}
            placeholder="0321-0000000"
          />
        </Fld>
      </div>

      <div className="col-12 form-sec-head">
        <span>Employment Details</span>
        <hr />
      </div>

      <div className="col-md-6">
        <Fld label="Designation" required>
          <input
            className={inp}
            value={vals.designation || ""}
            onChange={(e) => set("designation", e.target.value)}
            placeholder="Software Engineer"
          />
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="Department" required>
          <input
            className={inp}
            value={vals.department || ""}
            onChange={(e) => set("department", e.target.value)}
            placeholder="Engineering, HR…"
          />
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="Business Unit">
          <input
            className={inp}
            value={vals.business_unit || ""}
            onChange={(e) => set("business_unit", e.target.value)}
            placeholder="Technology, Corporate…"
          />
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="Type">
          <select
            className={sel}
            value={vals.employment_type || ""}
            onChange={(e) => set("employment_type", e.target.value)}
          >
            <option value="">— Select Type —</option>
            <option value="Permanent">Permanent (Full Time)</option>
            <option value="Contractual">Contractual</option>
          </select>
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="Location" required>
          <select
            className={sel}
            value={vals.location || ""}
            onChange={(e) => set("location", e.target.value)}
          >
            <option value="">— Select Location —</option>
            {[
              "Karachi",
              "Lahore",
              "Islamabad",
              "Multan",
              "Peshawar",
              "Other",
            ].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="Joining Date">
          <input
            type="date"
            className={inp}
            value={vals.joining_date || ""}
            onChange={(e) => set("joining_date", e.target.value)}
          />
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="Status">
          <select
            className={sel}
            value={vals.is_active === false ? "inactive" : "active"}
            onChange={(e) => set("is_active", e.target.value === "active")}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Fld>
      </div>
    </div>
  );
}

function DetailCell({ label, value }) {
  return (
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
}

// ── View Renderer ─────────────────────────────────────────────
function EmployeeView({ row }) {
  return (
    <dl className="row g-3">
      <DetailCell label="Employee Name" value={row.full_name} />
      <DetailCell label="Email" value={row.email} />
      <DetailCell label="Mobile" value={row.mobile_number} />
      <DetailCell label="Designation" value={row.designation} />
      <DetailCell label="Department" value={row.department} />
      <DetailCell label="Business Unit" value={row.business_unit} />
      <DetailCell label="Location" value={row.location} />
      <DetailCell
        label="Type"
        value={
          row.employment_type === "Permanent"
            ? "Permanent (Full Time)"
            : row.employment_type
        }
      />
      <DetailCell label="Joining Date" value={fmtDate(row.joining_date)} />
      <div className="col-6">
        <dt
          className="text-secondary fw-semibold text-uppercase mb-1"
          style={{ fontSize: "11px", letterSpacing: "0.05em" }}
        >
          Status
        </dt>
        <dd className="small mb-0">
          <Badge status={row.is_active ? "active" : "inactive"}>
            {row.is_active ? "Active" : "Inactive"}
          </Badge>
        </dd>
      </div>
    </dl>
  );
}

// ── Type badge ────────────────────────────────────────────────
function TypeBadge({ value }) {
  if (!value) return <span className="text-secondary">—</span>;
  const isPerm = value === "Permanent";
  return (
    <span
      className="badge rounded-pill px-2 py-1"
      style={{
        fontSize: "10px",
        background: isPerm ? "rgba(0,170,47,0.12)" : "rgba(139,92,246,0.12)",
        color: isPerm ? "#4ade80" : "#c4b5fd",
      }}
    >
      {isPerm ? "Permanent" : "Contractual"}
    </span>
  );
}

// ── Module Config ─────────────────────────────────────────────
const config = {
  title: "Employee",
  module: "employees",
  apiPath: "/api/employees",
  exportFile: "employees-export.csv",
  searchPlaceholder: "Search by name, email, designation, department…",

  columns: [
    {
      key: "full_name",
      label: "Employee Name",
      sortable: true,
      render: (v, row) => (
        <div>
          <span className="fw-medium">
            {v || <span className="text-secondary">—</span>}
          </span>
          {row.email && (
            <div className="text-secondary" style={{ fontSize: "10px" }}>
              {row.email}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "business_unit",
      label: "Business Unit",
      sortable: true,
      render: (v) => v || <span className="text-secondary">—</span>,
    },
    { key: "department", label: "Department", sortable: true },
    { key: "designation", label: "Designation", sortable: true },
    {
      key: "location",
      label: "Location",
      sortable: true,
      render: (v) => v || <span className="text-secondary">—</span>,
    },
    {
      key: "is_active",
      label: "Status",
      render: (v) =>
        v ? (
          <Badge status="active">Active</Badge>
        ) : (
          <Badge status="inactive">Inactive</Badge>
        ),
    },
    {
      key: "joining_date",
      label: "Joining Date",
      render: (v) =>
        v ? fmtDate(v) : <span className="text-secondary">—</span>,
    },
    {
      key: "employment_type",
      label: "Type",
      render: (v) => <TypeBadge value={v} />,
    },
  ],

  fields: [],

  validate: (vals) => {
    if (!vals.full_name?.trim()) return "Employee Name is required";
    if (vals.full_name.trim().length > 50)
      return "Employee Name must be 50 characters or less";
    if (!vals.designation) return "Designation is required";
    if (!vals.department) return "Department is required";
    if (!vals.location) return "Location is required";
    return null;
  },

  renderForm: (vals, setVals) => <EmployeeForm vals={vals} setVals={setVals} />,
  renderView: (row) => <EmployeeView row={row} />,
  viewExtra: (row) => <EmployeeAssignments row={row} />,
};

export default function Employees() {
  return <ModulePage config={config} />;
}
