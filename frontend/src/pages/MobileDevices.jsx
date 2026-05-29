import React, { useEffect, useState } from "react";
import ModulePage from "./ModulePage";
import Badge from "../components/ui/Badge";
import { api } from "../lib/api";
import { genAssetTag } from "../lib/utils";
import { useToast } from "../contexts/ToastContext";

const inp = "form-control form-control-sm";
const sel = "form-select form-select-sm";

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

function MobileDeviceForm({ vals, setVals }) {
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
  const needEmployee = ["employee", "wfh", "user"].includes(vals.assigned_type);

  return (
    <div
      className="row g-3"
      style={{ maxHeight: "65vh", overflowY: "auto", paddingRight: 4 }}
    >
      <SecHead title="Basic Information" />

      <div className="col-md-6">
        <Fld label="Asset Tag" required>
          <input
            className={inp}
            value={vals.asset_tag || ""}
            onChange={(e) => set("asset_tag", e.target.value)}
            placeholder="IT-MB-0001"
          />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Type" required>
          <select
            className={sel}
            value={vals.type || ""}
            onChange={(e) => set("type", e.target.value)}
          >
            <option value="">— Select Type —</option>
            <option value="Mobile">Mobile</option>
            <option value="Pad">Pad</option>
          </select>
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Manufacturer" required>
          <input
            className={inp}
            value={vals.manufacturer || ""}
            onChange={(e) => set("manufacturer", e.target.value)}
            placeholder="Samsung, Apple, Xiaomi…"
          />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Model" required>
          <input
            className={inp}
            value={vals.model || ""}
            onChange={(e) => set("model", e.target.value)}
            placeholder="Galaxy S23, iPhone 14…"
          />
        </Fld>
      </div>

      <div className="col-12">
        <Fld label="Serial No." required half={false}>
          <input
            className={inp}
            value={vals.serial_number || ""}
            onChange={(e) => set("serial_number", e.target.value)}
            onBlur={(e) => set("serial_number", e.target.value.toUpperCase())}
            placeholder="Device serial number"
            autoCapitalize="characters"
            style={{ textTransform: "uppercase" }}
          />
        </Fld>
      </div>

      <SecHead title="Assignment" />

      <div className="col-md-6">
        <Fld label="Assigned To">
          <select
            className={sel}
            value={vals.assigned_type || "inventory"}
            onChange={(e) => {
              set("assigned_type", e.target.value);
              if (!["employee", "wfh", "user"].includes(e.target.value))
                set("assigned_user_id", null);
            }}
          >
            <option value="inventory">Inventory</option>
            <option value="employee">Employee</option>
            <option value="wfh">WFH (Work From Home)</option>
            <option value="damaged">Damaged</option>
          </select>
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

      <SecHead title="Device Details" />

      <div className="col-md-6">
        <Fld label="IMEI 1">
          <input
            className={inp}
            value={vals.imei1 || ""}
            onChange={(e) => set("imei1", e.target.value)}
            onBlur={(e) => set("imei1", e.target.value.toUpperCase())}
            placeholder="15-digit IMEI"
            autoCapitalize="characters"
            style={{ textTransform: "uppercase" }}
          />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="IMEI 2">
          <input
            className={inp}
            value={vals.imei2 || ""}
            onChange={(e) => set("imei2", e.target.value)}
            onBlur={(e) => set("imei2", e.target.value.toUpperCase())}
            placeholder="Dual-SIM IMEI"
            autoCapitalize="characters"
            style={{ textTransform: "uppercase" }}
          />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="OS">
          <select
            className={sel}
            value={vals.os || ""}
            onChange={(e) => set("os", e.target.value)}
          >
            <option value="">— Select OS —</option>
            <option value="Android">Android</option>
            <option value="iOS">iOS</option>
            <option value="Other">Other</option>
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

      <div className="col-md-6">
        <Fld label="Purpose of Use">
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
        <Fld label="Warranty Expiry">
          <input
            type="date"
            className={inp}
            value={vals.warranty_expiry || ""}
            onChange={(e) => set("warranty_expiry", e.target.value)}
          />
        </Fld>
      </div>

      <div className="col-12">
        <Fld label="Notes" half={false}>
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

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div className="col-6">
      <dt
        className="text-secondary fw-semibold text-uppercase mb-1"
        style={{ fontSize: "11px", letterSpacing: "0.05em" }}
      >
        {label}
      </dt>
      <dd className="small mb-0">{value}</dd>
    </div>
  );
}

function MobileDeviceView(row) {
  const assignLabel = {
    employee: "Employee",
    user: "Employee",
    wfh: "WFH",
    inventory: "Inventory",
    damaged: "Damaged",
  };
  const purposeLabel = {
    official: "Official",
    service: "Service",
    personal: "Personal",
    qa_testing: "QA Testing",
  };
  return (
    <dl className="row g-3">
      <Field label="Asset Tag" value={row.asset_tag} />
      <Field label="Type" value={row.type} />
      <Field label="Manufacturer" value={row.manufacturer} />
      <Field label="Model" value={row.model} />
      <Field label="Serial No." value={row.serial_number?.toUpperCase()} />
      <Field
        label="Assigned To"
        value={assignLabel[row.assigned_type] || row.assigned_type}
      />
      {row.assigned_user_name && (
        <Field label="Employee" value={row.assigned_user_name} />
      )}
      <Field label="Department" value={row.department} />
      <Field label="IMEI 1" value={row.imei1?.toUpperCase()} />
      <Field label="IMEI 2" value={row.imei2?.toUpperCase()} />
      <Field label="OS" value={row.os} />
      <Field label="Location" value={row.location} />
      <Field label="Purpose" value={purposeLabel[row.purpose] || row.purpose} />
      <Field
        label="Warranty Expiry"
        value={
          row.warranty_expiry
            ? new Date(row.warranty_expiry).toLocaleDateString()
            : null
        }
      />
      {row.notes && (
        <div className="col-12">
          <dt
            className="text-secondary fw-semibold text-uppercase mb-1"
            style={{ fontSize: "11px", letterSpacing: "0.05em" }}
          >
            Notes
          </dt>
          <dd className="small mb-0">{row.notes}</dd>
        </div>
      )}
    </dl>
  );
}

function AssignedBadge({ row }) {
  const map = {
    employee: {
      label: row.assigned_user_name || "Employee",
      cls: "badge-assign-employee",
    },
    user: {
      label: row.assigned_user_name || "Employee",
      cls: "badge-assign-employee",
    },
    wfh: { label: row.assigned_user_name || "WFH", cls: "badge-assign-wfh" },
    inventory: { label: "Inventory", cls: "badge-assign-inventory" },
    damaged: { label: "Damaged", cls: "badge-assign-damaged" },
  };
  const { label, cls } = map[row.assigned_type] || {
    label: row.assigned_type,
    cls: "badge-assign-default",
  };
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
  title: "Mobile Device",
  module: "mobiles",
  apiPath: "/api/mobiles",
  exportFile: "mobiles-export.csv",
  searchPlaceholder: "Search by manufacturer, model, serial, IMEI, asset tag…",

  qrData: (row) => {
    const tag =
      row.asset_tag ||
      genAssetTag(row.purchase_date, "MB") ||
      `${row.manufacturer || ""} ${row.model || ""}`.trim() ||
      "Mobile Device";
    return {
      label: tag,
      value: `Tag:${tag}\nType:${row.type || ""}\nBrand:${row.manufacturer || ""}\nModel:${row.model || ""}\nSN:${row.serial_number || ""}\nIMEI:${row.imei1 || ""}\nAssigned:${row.assigned_user_name || row.assigned_type || "Unassigned"}`,
      details: [
        row.type && `Type: ${row.type}`,
        (row.manufacturer || row.model) &&
          `${row.manufacturer || ""} ${row.model || ""}`.trim(),
        row.serial_number && `S/N: ${row.serial_number}`,
        row.imei1 && `IMEI: ${row.imei1}`,
        row.assigned_user_name
          ? `Assigned: ${row.assigned_user_name}`
          : row.assigned_type === "inventory"
            ? "Inventory"
            : row.assigned_type,
      ].filter(Boolean),
    };
  },

  columns: [
    { key: "asset_tag", label: "Asset Tag", sortable: true },
    {
      key: "assigned_type",
      label: "Assigned To",
      render: (_, row) => <AssignedBadge row={row} />,
    },
    { key: "department", label: "Department" },
    { key: "type", label: "Type", sortable: true },
    { key: "manufacturer", label: "Manufacturer", sortable: true },
    { key: "model", label: "Model" },
    {
      key: "serial_number",
      label: "Serial No.",
      render: (v) => (v ? v.toUpperCase() : "—"),
    },
    {
      key: "imei1",
      label: "IMEI 1",
      render: (v) => (v ? v.toUpperCase() : "—"),
    },
    {
      key: "imei2",
      label: "IMEI 2",
      render: (v) => (v ? v.toUpperCase() : "—"),
    },
    { key: "location", label: "Location" },
    {
      key: "purpose",
      label: "Purpose",
      render: (v) =>
        v
          ? v === "official"
            ? "Official"
            : v === "service"
              ? "Service"
              : v
          : "—",
    },
    {
      key: "warranty_expiry",
      label: "Warranty",
      render: (v) => (v ? new Date(v).toLocaleDateString() : "—"),
    },
    {
      key: "notes",
      label: "Note",
      render: (v) =>
        v ? (
          <span
            className="text-secondary small text-truncate d-block"
            style={{ maxWidth: 120 }}
            title={v}
          >
            {v}
          </span>
        ) : (
          "—"
        ),
    },
  ],

  validate: (vals) => {
    if (!vals.asset_tag) return "Asset Tag is required";
    if (!vals.type) return "Type is required";
    if (!vals.manufacturer) return "Manufacturer is required";
    if (!vals.model) return "Model is required";
    if (!vals.serial_number) return "Serial Number is required";
    return null;
  },

  renderForm: (vals, setVals) => (
    <MobileDeviceForm vals={vals} setVals={setVals} />
  ),
  renderView: (row) => <MobileDeviceView {...row} />,
};

export default function MobileDevices() {
  return <ModulePage config={config} />;
}
