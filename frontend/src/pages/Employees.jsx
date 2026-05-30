import React, { useEffect, useState } from "react";
import ModulePage from "./ModulePage";
import Badge from "../components/ui/Badge";
import { api } from "../lib/api";
import {
  PackageCheck,
  RotateCcw,
  History,
  Monitor,
  Smartphone,
  Network,
  UserX,
  Users,
  FileDown,
  AlertTriangle,
} from "lucide-react";
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

const ASSET_ICON = { system: Monitor, mobile: Smartphone, network: Network };
const ASSET_COLOR = {
  system: "#60a5fa",
  mobile: "#4ade80",
  network: "#fb923c",
};

function EmployeeHardwareHistory({ row }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!row?.id) return;
    setLoading(true);
    api
      .get(`/api/asset-history/employee/${row.id}`)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [row?.id]);

  return (
    <div className="mt-4 pt-3 border-top">
      <div className="d-flex align-items-center gap-2 mb-3">
        <History size={13} style={{ color: "#a78bfa" }} />
        <span
          className="fw-semibold text-secondary text-uppercase"
          style={{ fontSize: "0.7rem", letterSpacing: "0.1em" }}
        >
          Hardware History
        </span>
        {!loading && events.length > 0 && (
          <span
            className="badge bg-secondary bg-opacity-25 text-secondary"
            style={{ fontSize: "10px" }}
          >
            {events.length} events
          </span>
        )}
      </div>
      {loading ? (
        <p className="small text-secondary py-2 mb-0">Loading…</p>
      ) : events.length === 0 ? (
        <p className="small text-secondary py-2 mb-0">
          No hardware history recorded.
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {events.map((ev) => {
            const Icon = ASSET_ICON[ev.asset_type] || Monitor;
            const color = ASSET_COLOR[ev.asset_type] || "#60a5fa";
            return (
              <div
                key={ev.id}
                className="d-flex align-items-start gap-2 p-2 rounded-2"
                style={{
                  background: "var(--bs-secondary-bg)",
                  fontSize: "0.78rem",
                }}
              >
                <Icon
                  size={13}
                  style={{ color, marginTop: 2, flexShrink: 0 }}
                />
                <div className="flex-grow-1">
                  <span className="fw-semibold">
                    {ev.asset_label || ev.asset_type}
                  </span>
                  <span className="text-secondary ms-2 text-capitalize">
                    {ev.event_type?.replace("_", " ")}
                  </span>
                  {ev.reason && (
                    <span className="text-secondary ms-1">· {ev.reason}</span>
                  )}
                </div>
                <span
                  className="text-secondary flex-shrink-0"
                  style={{ fontSize: "11px" }}
                >
                  {fmtDate(ev.created_at)}
                </span>
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
            <option value="inactive">Inactive / Ex-Employee</option>
          </select>
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="Leaving Date">
          <input
            type="date"
            className={inp}
            value={vals.leaving_date || ""}
            onChange={(e) => set("leaving_date", e.target.value)}
          />
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
      {row.leaving_date && (
        <DetailCell label="Leaving Date" value={fmtDate(row.leaving_date)} />
      )}
      <div className="col-6">
        <dt
          className="text-secondary fw-semibold text-uppercase mb-1"
          style={{ fontSize: "11px", letterSpacing: "0.05em" }}
        >
          Status
        </dt>
        <dd className="small mb-0">
          <Badge status={row.is_active ? "active" : "inactive"}>
            {row.is_active ? "Active" : "Ex-Employee"}
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

// ── Employee Clearance Panel ──────────────────────────────────
function EmployeeClearance({ row }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/employees/${row.id}/clearance`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row.id]);

  async function exportPDF() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF();
    const emp = data.employee;
    doc.setFontSize(14);
    doc.text("Employee Asset Clearance Report", 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `${emp.full_name} · ${emp.designation} · ${emp.department} · ${emp.location}`,
      14,
      23,
    );
    doc.text(
      `Leaving Date: ${emp.leaving_date ? fmtDate(emp.leaving_date) : "N/A"} · Generated: ${new Date().toLocaleString("en-GB")}`,
      14,
      29,
    );
    let y = 36;
    if (data.hardware.length > 0) {
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      doc.text("Hardware Assets (Currently Assigned)", 14, y);
      autoTable(doc, {
        startY: y + 3,
        head: [["Type", "Asset Tag", "Brand", "Model", "Serial No.", "Status"]],
        body: data.hardware.map((h) => [
          h.asset_type,
          h.asset_tag || "—",
          h.manufacturer || "—",
          h.model || "—",
          h.serial_number || "—",
          h.status || "—",
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [239, 68, 68] },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
    if (data.inventoryItems.length > 0) {
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      doc.text("Inventory Items (Outstanding)", 14, y);
      autoTable(doc, {
        startY: y + 3,
        head: [["ASN #", "Item", "Qty", "Issued Date"]],
        body: data.inventoryItems.map((i) => [
          i.asn_number,
          i.item_name,
          `${i.qty} ${i.unit}`,
          fmtDate(i.assigned_date),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [245, 158, 11] },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
    if (data.assetHistory.length > 0) {
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      doc.text("Asset History", 14, y);
      autoTable(doc, {
        startY: y + 3,
        head: [["Asset", "Event", "From", "To", "Date"]],
        body: data.assetHistory.map((h) => [
          h.asset_label || "—",
          h.event_type?.replace(/_/g, " "),
          h.from_name || "—",
          h.to_name || "—",
          fmtDate(h.created_at),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [100, 100, 100] },
        margin: { left: 14, right: 14 },
      });
    }
    doc.save(
      `clearance-${emp.full_name.replace(/\s+/g, "-").toLowerCase()}.pdf`,
    );
  }

  if (loading)
    return (
      <div className="text-center text-secondary py-3 small">
        Loading clearance data…
      </div>
    );
  if (!data) return null;

  const hasHardware = data.hardware.length > 0;
  const hasInv = data.inventoryItems.length > 0;

  return (
    <div className="mt-2">
      {/* Header */}
      <div
        className="px-4 py-3 d-flex align-items-center justify-content-between"
        style={{ borderTop: "1px solid var(--bs-border-color)" }}
      >
        <span
          className="small fw-semibold d-flex align-items-center gap-2"
          style={{ color: hasHardware || hasInv ? "#f87171" : "#4ade80" }}
        >
          {hasHardware || hasInv ? (
            <>
              <AlertTriangle size={14} /> Clearance Pending —{" "}
              {data.hardware.length + data.inventoryItems.length} item(s) to
              recover
            </>
          ) : (
            <>✓ Clearance Complete — no outstanding assets</>
          )}
        </span>
        <button
          onClick={exportPDF}
          className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
        >
          <FileDown size={13} /> Clearance PDF
        </button>
      </div>

      {/* Hardware still assigned */}
      {hasHardware && (
        <div style={{ borderTop: "1px solid var(--bs-border-color)" }}>
          <p
            className="px-4 pt-3 pb-1 small fw-semibold text-uppercase mb-0"
            style={{ fontSize: "11px", color: "#f87171" }}
          >
            <Monitor size={11} className="me-1" />
            Hardware to Recover ({data.hardware.length})
          </p>
          <div className="table-responsive">
            <table
              className="table table-hover mb-0"
              style={{ fontSize: "0.78rem" }}
            >
              <thead>
                <tr>
                  {[
                    "Type",
                    "Asset Tag",
                    "Brand",
                    "Model",
                    "Serial No.",
                    "Status",
                    "Condition",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-uppercase text-secondary text-nowrap"
                      style={{
                        fontSize: "10px",
                        letterSpacing: "0.05em",
                        padding: "0.5rem 0.75rem",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.hardware.map((h, i) => (
                  <tr key={i}>
                    <td
                      className="align-middle small text-capitalize"
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      {h.asset_type}
                    </td>
                    <td
                      className="align-middle font-monospace"
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      {h.asset_tag || "—"}
                    </td>
                    <td
                      className="align-middle small text-secondary"
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      {h.manufacturer || "—"}
                    </td>
                    <td
                      className="align-middle small text-secondary"
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      {h.model || "—"}
                    </td>
                    <td
                      className="align-middle font-monospace small"
                      style={{ padding: "0.45rem 0.75rem", color: "#fbbf24" }}
                    >
                      {h.serial_number || "—"}
                    </td>
                    <td
                      className="align-middle"
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      <span
                        className="badge px-1"
                        style={{
                          background: "rgba(239,68,68,0.12)",
                          color: "#f87171",
                          fontSize: "10px",
                        }}
                      >
                        {h.status || "—"}
                      </span>
                    </td>
                    <td
                      className="align-middle small text-secondary"
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      {h.condition || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inventory items outstanding */}
      {hasInv && (
        <div style={{ borderTop: "1px solid var(--bs-border-color)" }}>
          <p
            className="px-4 pt-3 pb-1 small fw-semibold text-uppercase mb-0"
            style={{ fontSize: "11px", color: "#fbbf24" }}
          >
            <PackageCheck size={11} className="me-1" />
            Inventory Items to Return ({data.inventoryItems.length})
          </p>
          <div className="table-responsive">
            <table
              className="table table-hover mb-0"
              style={{ fontSize: "0.78rem" }}
            >
              <thead>
                <tr>
                  {["ASN #", "Item", "Qty", "Issued Date"].map((h) => (
                    <th
                      key={h}
                      className="text-uppercase text-secondary text-nowrap"
                      style={{
                        fontSize: "10px",
                        letterSpacing: "0.05em",
                        padding: "0.5rem 0.75rem",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.inventoryItems.map((item, i) => (
                  <tr key={i}>
                    <td
                      className="align-middle font-monospace small"
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      {item.asn_number}
                    </td>
                    <td
                      className="align-middle small fw-medium"
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      {item.item_name}
                    </td>
                    <td
                      className="align-middle small"
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      {item.qty} {item.unit}
                    </td>
                    <td
                      className="align-middle small text-secondary"
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      {fmtDate(item.assigned_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Asset history */}
      {data.assetHistory.length > 0 && (
        <div style={{ borderTop: "1px solid var(--bs-border-color)" }}>
          <p
            className="px-4 pt-3 pb-1 small fw-semibold text-uppercase mb-0"
            style={{ fontSize: "11px", color: "#71717a" }}
          >
            <History size={11} className="me-1" />
            Asset History ({data.assetHistory.length} events)
          </p>
          <div className="table-responsive">
            <table
              className="table table-hover mb-0"
              style={{ fontSize: "0.78rem" }}
            >
              <thead>
                <tr>
                  {["Asset", "Event", "From", "To", "Date"].map((h) => (
                    <th
                      key={h}
                      className="text-uppercase text-secondary text-nowrap"
                      style={{
                        fontSize: "10px",
                        letterSpacing: "0.05em",
                        padding: "0.5rem 0.75rem",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.assetHistory.map((h, i) => (
                  <tr key={i}>
                    <td
                      className="align-middle font-monospace small"
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      {h.asset_label || "—"}
                    </td>
                    <td
                      className="align-middle small text-capitalize"
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      {h.event_type?.replace(/_/g, " ")}
                    </td>
                    <td
                      className="align-middle small text-secondary"
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      {h.from_name || "—"}
                    </td>
                    <td
                      className="align-middle small text-secondary"
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      {h.to_name || "—"}
                    </td>
                    <td
                      className="align-middle small text-secondary"
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      {fmtDate(h.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
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
};

function makeConfig(exMode) {
  return {
    ...config,
    apiPath: exMode
      ? "/api/employees?status=inactive"
      : "/api/employees?status=active",
    title: exMode ? "Ex-Employee" : "Employee",
    viewExtra: exMode
      ? (row) => <EmployeeClearance row={row} />
      : (row) => (
          <>
            <EmployeeAssignments row={row} />
            <EmployeeHardwareHistory row={row} />
          </>
        ),
  };
}

export default function Employees() {
  const [exMode, setExMode] = useState(false);
  return (
    <ModulePage
      key={exMode ? "ex" : "active"}
      config={makeConfig(exMode)}
      headerExtra={
        <div className="d-flex rounded-2 overflow-hidden border border-secondary">
          <button
            onClick={() => setExMode(false)}
            className="btn btn-sm px-3 py-1 d-flex align-items-center gap-1"
            style={{
              borderRadius: 0,
              background: !exMode ? "var(--brand)" : "transparent",
              color: !exMode ? "#fff" : "#71717a",
              fontSize: "12px",
            }}
          >
            <Users size={12} /> Active
          </button>
          <button
            onClick={() => setExMode(true)}
            className="btn btn-sm px-3 py-1 d-flex align-items-center gap-1"
            style={{
              borderRadius: 0,
              background: exMode ? "#ef4444" : "transparent",
              color: exMode ? "#fff" : "#71717a",
              fontSize: "12px",
            }}
          >
            <UserX size={12} /> Ex-Employees
          </button>
        </div>
      }
    />
  );
}
