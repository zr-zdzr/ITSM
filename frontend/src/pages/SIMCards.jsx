import { useEffect, useState } from "react";
import ModulePage from "./ModulePage";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";

const inp = "form-control form-control-sm";
const sel = "form-select form-select-sm";

// Employee-backed assignment types that require picking an employee.
const EMPLOYEE_TYPES = ["employee", "wfh", "user"];

const NAMED_ON_LABELS = {
  inventory: "In Stock",
  employee: "Employee",
  user: "Employee",
  wfh: "WFH",
  service: "Service",
};
const PURPOSE_LABELS = { official: "Official", service: "Service" };
const STATUS_LABELS = { active: "Active", suspended: "Suspended" };

function Fld({ label, required, children, half = true }) {
  return (
    <div className={half ? "" : "col-12"}>
      <label className="form-label small fw-medium mb-1">
        {label}
        {required && <span className="text-danger ms-1">*</span>}
      </label>
      {children}
    </div>
  );
}

function SecHead({ title }) {
  return (
    <div className="col-12 form-sec-head">
      <span>{title}</span>
      <hr />
    </div>
  );
}

function SIMCardForm({ vals, setVals }) {
  const [employees, setEmployees] = useState([]);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/employees")
      .then((d) => {
        if (cancelled) return;
        const list = Array.isArray(d) ? d : [];
        setEmployees(list);
        if (vals.assigned_user_id) {
          const emp = list.find(
            (em) => String(em.id) === String(vals.assigned_user_id),
          );
          if (emp)
            setVals((p) => ({
              ...p,
              department: emp.department || p.department,
              location: emp.location || p.location,
            }));
        }
      })
      .catch((e) => {
        if (!cancelled) toast(e.message, "error");
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const set = (k, v) => setVals((p) => ({ ...p, [k]: v }));
  const needEmployee = EMPLOYEE_TYPES.includes(vals.assigned_type);

  return (
    <div
      className="row g-3"
      style={{ maxHeight: "65vh", overflowY: "auto", paddingRight: 4 }}
    >
      <SecHead title="SIM Information" />

      <div className="col-md-6">
        <Fld label="Number" required>
          <input
            className={inp}
            value={vals.phone_number || ""}
            onChange={(e) => set("phone_number", e.target.value)}
            placeholder="0321-1000001"
          />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Named On">
          <select
            className={sel}
            value={vals.assigned_type || "inventory"}
            onChange={(e) => {
              set("assigned_type", e.target.value);
              if (!EMPLOYEE_TYPES.includes(e.target.value))
                set("assigned_user_id", null);
            }}
          >
            <option value="inventory">In Stock</option>
            <option value="employee">Employee</option>
            <option value="wfh">WFH (Work From Home)</option>
            <option value="service">Service</option>
          </select>
        </Fld>
      </div>

      {needEmployee && (
        <div className="col-12">
          <Fld label="Employee Name" half={false}>
            <select
              className={sel}
              value={vals.assigned_user_id || ""}
              onChange={(e) => {
                const id = e.target.value || null;
                set("assigned_user_id", id);
                const emp = employees.find(
                  (em) => String(em.id) === String(id),
                );
                if (emp) {
                  if (emp.department) set("department", emp.department);
                  if (emp.location) set("location", emp.location);
                }
              }}
            >
              <option value="">— Select Employee —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                  {e.designation ? ` — ${e.designation}` : ""}
                </option>
              ))}
            </select>
          </Fld>
        </div>
      )}

      <div className="col-md-6">
        <Fld label="SIM Holder">
          <input
            className={inp}
            value={vals.sim_holder || ""}
            onChange={(e) => set("sim_holder", e.target.value)}
            placeholder="Name on SIM card"
          />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Department">
          <input
            className={inp}
            value={vals.department || ""}
            onChange={(e) => set("department", e.target.value)}
            placeholder="Engineering, HR…"
          />
        </Fld>
      </div>

      <SecHead title="Package &amp; Network" />

      <div className="col-md-6">
        <Fld label="Vendor">
          <select
            className={sel}
            value={vals.vendor || "Jazz"}
            onChange={(e) => set("vendor", e.target.value)}
          >
            <option value="Jazz">Jazz</option>
            <option value="Telenor">Telenor</option>
            <option value="Ufone">Ufone</option>
            <option value="Zong">Zong</option>
            <option value="Other">Other</option>
          </select>
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Calling Package">
          <input
            className={inp}
            value={vals.package_name || ""}
            onChange={(e) => set("package_name", e.target.value)}
            placeholder="e.g. GSM Control - 200"
          />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Data Package">
          <input
            className={inp}
            value={vals.data_limit || ""}
            onChange={(e) => set("data_limit", e.target.value)}
            placeholder="e.g. 10 GB / month"
          />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="User Name">
          <input
            className={inp}
            value={vals.user_name || ""}
            onChange={(e) => set("user_name", e.target.value)}
            placeholder="Name registered with network"
          />
        </Fld>
      </div>

      <SecHead title="Details" />

      <div className="col-md-6">
        <Fld label="Type">
          <select
            className={sel}
            value={vals.sim_type || ""}
            onChange={(e) => set("sim_type", e.target.value)}
          >
            <option value="">— Select Type —</option>
            <option value="Calling">Calling</option>
            <option value="Data">Data</option>
          </select>
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

      <div className="col-md-6">
        <Fld label="Purpose">
          <select
            className={sel}
            value={vals.purpose || ""}
            onChange={(e) => set("purpose", e.target.value)}
          >
            <option value="">— Select Purpose —</option>
            <option value="official">Official</option>
            <option value="service">Service</option>
          </select>
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Location">
          <input
            className={inp}
            value={vals.location || ""}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Karachi HQ, Lahore Office…"
          />
        </Fld>
      </div>

      <div className="col-12">
        <Fld label="Note" half={false}>
          <textarea
            className={inp}
            rows={2}
            value={vals.notes || ""}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Any additional notes…"
            style={{ resize: "none" }}
          />
        </Fld>
      </div>
    </div>
  );
}

const dtStyle = { fontSize: "11px", letterSpacing: "0.05em" };

function Field({ label, value, full = false }) {
  return (
    <div className={full ? "col-12" : "col-6"}>
      <dt
        className="text-secondary fw-semibold text-uppercase mb-1"
        style={dtStyle}
      >
        {label}
      </dt>
      <dd className="small mb-0">{value || "—"}</dd>
    </div>
  );
}

function SIMCardView(row) {
  return (
    <dl className="row g-3">
      <Field label="Number" value={row.phone_number} />
      <Field
        label="Named On"
        value={NAMED_ON_LABELS[row.assigned_type] || row.assigned_type}
      />
      <Field label="Employee" value={row.assigned_user_name} />
      <Field label="SIM Holder" value={row.sim_holder} />
      <Field label="User Name" value={row.user_name} />
      <Field label="Department" value={row.department} />
      <Field label="Location" value={row.location} />
      <Field label="Vendor" value={row.vendor} />
      <Field label="Calling Package" value={row.package_name} />
      <Field label="Data Package" value={row.data_limit} />
      <Field label="Type" value={row.sim_type} />
      <Field label="Status" value={STATUS_LABELS[row.status] || row.status} />
      <Field
        label="Purpose"
        value={PURPOSE_LABELS[row.purpose] || row.purpose}
      />
      {row.notes && <Field label="Notes" value={row.notes} full />}
    </dl>
  );
}

const NAMED_ON_BADGE_CLASS = {
  employee: "badge-assign-employee",
  user: "badge-assign-employee",
  inventory: "badge-assign-inventory",
  wfh: "badge-assign-wfh",
  service: "badge-assign-service",
};

function NamedOnBadge({ row }) {
  const cls = NAMED_ON_BADGE_CLASS[row.assigned_type] || "badge-assign-default";
  // Employee-backed types show the assignee's name; others show the type label.
  const label = EMPLOYEE_TYPES.includes(row.assigned_type)
    ? row.assigned_user_name || NAMED_ON_LABELS[row.assigned_type]
    : NAMED_ON_LABELS[row.assigned_type] || row.assigned_type;
  return (
    <span
      className={`badge rounded-pill px-2 py-1 ${cls}`}
      style={{ fontSize: "11px" }}
    >
      {label}
    </span>
  );
}

const config = {
  title: "SIM Card",
  module: "sims",
  apiPath: "/api/sims",
  exportFile: "sims-export.csv",
  searchPlaceholder: "Search by number, holder, type, location, department…",

  columns: [
    { key: "phone_number", label: "Number", sortable: true },
    {
      key: "assigned_type",
      label: "Named On",
      render: (_, row) => <NamedOnBadge row={row} />,
    },
    { key: "sim_holder", label: "SIM Holder", render: (v) => v || "—" },
    { key: "package_name", label: "Calling Package", render: (v) => v || "—" },
    { key: "department", label: "Department", render: (v) => v || "—" },
    { key: "location", label: "Location", render: (v) => v || "—" },
    {
      key: "purpose",
      label: "Purpose",
      render: (v) => PURPOSE_LABELS[v] || "—",
    },
  ],

  validate: (vals) => {
    if (!vals.phone_number) return "Number is required";
    return null;
  },

  renderForm: (vals, setVals) => <SIMCardForm vals={vals} setVals={setVals} />,
  renderView: (row) => <SIMCardView {...row} />,
};

export default function SIMCards() {
  return <ModulePage config={config} />;
}
