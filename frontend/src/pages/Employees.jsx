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
  CreditCard,
  Cloud,
  Printer,
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

// ── Employee Profile ──────────────────────────────────────────
function StatusPill({ status }) {
  const map = {
    active: ["rgba(34,197,94,0.12)", "#4ade80"],
    "in use": ["rgba(34,197,94,0.12)", "#4ade80"],
    assigned: ["rgba(34,197,94,0.12)", "#4ade80"],
    inactive: ["rgba(113,113,122,0.15)", "#a1a1aa"],
    suspended: ["rgba(245,158,11,0.12)", "#fbbf24"],
    deleted: ["rgba(248,113,113,0.12)", "#f87171"],
    maintenance: ["rgba(245,158,11,0.12)", "#fbbf24"],
    available: ["rgba(96,165,250,0.12)", "#60a5fa"],
  };
  const s = (status || "").toLowerCase();
  const [bg, color] = map[s] || ["rgba(113,113,122,0.15)", "#a1a1aa"];
  return (
    <span
      className="badge px-2 py-1"
      style={{
        background: bg,
        color,
        fontSize: 10,
        textTransform: "capitalize",
      }}
    >
      {status || "—"}
    </span>
  );
}

function MiniTable({ headers, rows }) {
  return (
    <div className="table-responsive">
      <table className="table table-sm mb-0" style={{ fontSize: "0.75rem" }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="text-secondary text-nowrap"
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  padding: "0.3rem 0.6rem",
                  borderBottom: "1px solid var(--bs-border-color)",
                  fontWeight: 600,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cols, i) => (
            <tr key={i}>
              {cols.map((val, j) => (
                <td
                  key={j}
                  className="align-middle"
                  style={{ padding: "0.35rem 0.6rem" }}
                >
                  {val}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssetSection({ icon: Icon, title, color, count, empty, children }) {
  return (
    <div
      className="rounded-3 overflow-hidden"
      style={{ border: "1px solid var(--bs-border-color)" }}
    >
      <div
        className="d-flex align-items-center gap-2 px-3 py-2"
        style={{
          background: "var(--surface-subtle)",
          borderBottom: count > 0 ? "1px solid var(--bs-border-color)" : "none",
        }}
      >
        <Icon size={13} style={{ color }} />
        <span
          className="fw-semibold text-uppercase"
          style={{ fontSize: "11px", letterSpacing: "0.05em", color }}
        >
          {title}
        </span>
        <span
          className="badge ms-1"
          style={{ background: `${color}22`, color, fontSize: 10 }}
        >
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="text-secondary small mb-0 px-3 py-2">{empty}</p>
      ) : (
        children
      )}
    </div>
  );
}

function EmployeeProfile({ row, onReactivated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/employees/${row.id}/profile`)
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

  async function reactivate() {
    setReactivating(true);
    try {
      await api.patch(`/api/employees/${row.id}/reactivate`);
      onReactivated?.();
    } catch {
      setReactivating(false);
    }
  }

  async function exportPDF() {
    if (!data) return;
    setPrinting(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF();
      const emp = data.employee;
      const BRAND = [0, 170, 47];

      doc.setFillColor(...BRAND);
      doc.rect(0, 0, 210, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont(undefined, "bold");
      doc.text("Employee Asset Profile", 14, 12);
      doc.setFontSize(9);
      doc.setFont(undefined, "normal");
      doc.text(
        `${emp.full_name}  ·  ${emp.designation || ""}  ·  ${emp.department || ""}`,
        14,
        19,
      );
      doc.text(`Generated: ${new Date().toLocaleString("en-GB")}`, 14, 25);

      let y = 34;

      autoTable(doc, {
        startY: y,
        head: [["Field", "Value", "Field", "Value"]],
        body: [
          ["Email", emp.email || "—", "Location", emp.location || "—"],
          [
            "Mobile",
            emp.mobile_number || "—",
            "Business Unit",
            emp.business_unit || "—",
          ],
          [
            "Type",
            emp.employment_type || "—",
            "Joining Date",
            fmtDate(emp.joining_date),
          ],
          [
            "Status",
            emp.is_active ? "Active" : "Ex-Employee",
            "Leaving Date",
            emp.leaving_date ? fmtDate(emp.leaving_date) : "—",
          ],
        ],
        styles: { fontSize: 8 },
        headStyles: { fillColor: BRAND },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 38 },
          2: { fontStyle: "bold", cellWidth: 38 },
        },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;

      const section = (title, head, body, color) => {
        if (body.length === 0) return;
        if (y > 240) {
          doc.addPage();
          y = 16;
        }
        doc.setFontSize(10);
        doc.setFont(undefined, "bold");
        doc.setTextColor(40, 40, 40);
        doc.text(title, 14, y);
        autoTable(doc, {
          startY: y + 3,
          head: [head],
          body,
          styles: { fontSize: 8 },
          headStyles: { fillColor: color },
          margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 8;
      };

      section(
        `Systems / Computers (${data.systems.length})`,
        [
          "Asset Tag",
          "Type",
          "Brand / Model",
          "Serial No.",
          "Status",
          "Condition",
        ],
        data.systems.map((s) => [
          s.asset_tag || "—",
          s.type || "—",
          [s.manufacturer, s.model].filter(Boolean).join(" ") || "—",
          s.serial_number || "—",
          s.status || "—",
          s.condition || "—",
        ]),
        [96, 165, 250],
      );

      section(
        `Mobile Phones (${data.mobiles.length})`,
        [
          "Asset Tag",
          "Brand / Model",
          "Serial No.",
          "IMEI",
          "Status",
          "Condition",
        ],
        data.mobiles.map((m) => [
          m.asset_tag || "—",
          [m.manufacturer, m.model].filter(Boolean).join(" ") || "—",
          m.serial_number || "—",
          m.imei || "—",
          m.status || "—",
          m.condition || "—",
        ]),
        [74, 222, 128],
      );

      section(
        `SIM Cards (${data.sims.length})`,
        ["Phone Number", "Vendor", "Package", "Purpose", "Status"],
        data.sims.map((s) => [
          s.phone_number || "—",
          s.vendor || "—",
          s.package_name || "—",
          s.purpose || "—",
          s.status || "—",
        ]),
        [168, 85, 247],
      );

      section(
        `Cloud IDs / Google Workspace (${data.gws.length})`,
        ["Display Name", "Email", "Role", "License", "2FA", "Status"],
        data.gws.map((g) => [
          g.display_name || "—",
          g.email || "—",
          g.gws_role || "—",
          g.license || "—",
          g.two_fa ? "Enabled" : "Disabled",
          g.status || "—",
        ]),
        [6, 182, 212],
      );

      section(
        `Inventory / Accessories (${data.inventory.length})`,
        ["Item", "Category", "Qty", "ASN #", "Issued Date"],
        data.inventory.map((i) => [
          i.item_name || "—",
          i.category_name || "—",
          `${i.qty} ${i.unit}`,
          i.asn_number || "—",
          fmtDate(i.assigned_date),
        ]),
        [20, 184, 166],
      );

      if (y > 230) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(8);
      doc.setFont(undefined, "normal");
      doc.setTextColor(130, 130, 130);
      doc.text(
        "Employee Signature: _______________________________   Date: ______________",
        14,
        y + 12,
      );
      doc.text(
        "IT Manager Signature: ____________________________   Date: ______________",
        14,
        y + 22,
      );

      doc.save(
        `asset-profile-${emp.full_name.replace(/\s+/g, "-").toLowerCase()}.pdf`,
      );
    } finally {
      setPrinting(false);
    }
  }

  if (loading)
    return (
      <div className="text-center text-secondary py-5 small">
        Loading profile…
      </div>
    );
  if (!data) return null;

  const { employee: emp, systems, mobiles, sims, gws, inventory } = data;
  const initials = emp.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const totalAssets =
    systems.length +
    mobiles.length +
    sims.length +
    gws.length +
    inventory.length;

  return (
    <div>
      {/* Employee header card */}
      <div
        className="d-flex align-items-start gap-3 mb-4 p-3 rounded-3"
        style={{ background: "var(--surface-subtle)" }}
      >
        <div
          className="d-flex align-items-center justify-content-center rounded-3 flex-shrink-0 fw-bold"
          style={{
            width: 52,
            height: 52,
            background: "rgba(0,170,47,0.15)",
            color: "var(--brand)",
            fontSize: 18,
          }}
        >
          {initials}
        </div>
        <div className="flex-grow-1 min-w-0">
          <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
            <span className="fw-bold" style={{ fontSize: "1rem" }}>
              {emp.full_name}
            </span>
            <span
              className={`badge rounded-pill px-2 ${
                emp.is_active
                  ? "bg-success-subtle text-success"
                  : "bg-secondary-subtle text-secondary"
              }`}
              style={{ fontSize: 10 }}
            >
              {emp.is_active ? "Active" : "Ex-Employee"}
            </span>
            <span
              className="badge rounded-pill px-2"
              style={{
                background: "rgba(0,170,47,0.12)",
                color: "var(--brand)",
                fontSize: 10,
              }}
            >
              {totalAssets} asset{totalAssets !== 1 ? "s" : ""} assigned
            </span>
          </div>
          <div className="text-secondary" style={{ fontSize: "0.78rem" }}>
            {[emp.designation, emp.department, emp.business_unit, emp.location]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div
            className="d-flex gap-3 mt-1 flex-wrap text-secondary"
            style={{ fontSize: "0.73rem" }}
          >
            {emp.email && <span>{emp.email}</span>}
            {emp.mobile_number && <span>{emp.mobile_number}</span>}
            {emp.joining_date && (
              <span>Joined {fmtDate(emp.joining_date)}</span>
            )}
          </div>
        </div>
        {!emp.is_active && (
          <button
            className="btn btn-sm btn-outline-success flex-shrink-0 d-flex align-items-center gap-1"
            onClick={reactivate}
            disabled={reactivating}
          >
            <RotateCcw size={12} />
            {reactivating ? "Reactivating…" : "Reactivate"}
          </button>
        )}
      </div>

      {/* Asset sections */}
      <div className="d-flex flex-column gap-2">
        <AssetSection
          icon={Monitor}
          title="Systems / Computers"
          color="#60a5fa"
          count={systems.length}
          empty="No system assigned"
        >
          <MiniTable
            headers={[
              "Asset Tag",
              "Type",
              "Brand / Model",
              "Serial No.",
              "Status",
              "Condition",
            ]}
            rows={systems.map((s) => [
              <code key="t" style={{ fontSize: 11 }}>
                {s.asset_tag || "—"}
              </code>,
              s.type || "—",
              [s.manufacturer, s.model].filter(Boolean).join(" ") || "—",
              <code key="sn" style={{ fontSize: 11 }}>
                {s.serial_number || "—"}
              </code>,
              <StatusPill key="st" status={s.status} />,
              s.condition || "—",
            ])}
          />
        </AssetSection>

        <AssetSection
          icon={Smartphone}
          title="Mobile Phones"
          color="#4ade80"
          count={mobiles.length}
          empty="No mobile assigned"
        >
          <MiniTable
            headers={[
              "Asset Tag",
              "Brand / Model",
              "Serial No.",
              "IMEI",
              "Status",
              "Condition",
            ]}
            rows={mobiles.map((m) => [
              <code key="t" style={{ fontSize: 11 }}>
                {m.asset_tag || "—"}
              </code>,
              [m.manufacturer, m.model].filter(Boolean).join(" ") || "—",
              <code key="sn" style={{ fontSize: 11 }}>
                {m.serial_number || "—"}
              </code>,
              <code key="im" style={{ fontSize: 11 }}>
                {m.imei || "—"}
              </code>,
              <StatusPill key="st" status={m.status} />,
              m.condition || "—",
            ])}
          />
        </AssetSection>

        <AssetSection
          icon={CreditCard}
          title="SIM Cards"
          color="#a78bfa"
          count={sims.length}
          empty="No SIM card assigned"
        >
          <MiniTable
            headers={["Phone Number", "Vendor", "Package", "Purpose", "Status"]}
            rows={sims.map((s) => [
              <code key="ph" style={{ fontSize: 11 }}>
                {s.phone_number || "—"}
              </code>,
              s.vendor || "—",
              s.package_name || "—",
              s.purpose || "—",
              <StatusPill key="st" status={s.status} />,
            ])}
          />
        </AssetSection>

        <AssetSection
          icon={Cloud}
          title="Cloud IDs / Google Workspace"
          color="#22d3ee"
          count={gws.length}
          empty="No Cloud ID linked — email address not found in GWS accounts"
        >
          <MiniTable
            headers={[
              "Display Name",
              "Email",
              "Role",
              "License",
              "2FA",
              "Status",
            ]}
            rows={gws.map((g) => [
              g.display_name || "—",
              g.email || "—",
              g.gws_role || "—",
              g.license || "—",
              g.two_fa ? (
                <span key="2fa" style={{ color: "#4ade80", fontSize: 11 }}>
                  ✓ Enabled
                </span>
              ) : (
                <span key="2fa" style={{ color: "#f87171", fontSize: 11 }}>
                  ✗ Disabled
                </span>
              ),
              <StatusPill key="st" status={g.status} />,
            ])}
          />
        </AssetSection>

        <AssetSection
          icon={PackageCheck}
          title="Inventory / Accessories"
          color="#2dd4bf"
          count={inventory.length}
          empty="No inventory items currently assigned"
        >
          <MiniTable
            headers={["Item", "Category", "Qty", "ASN #", "Issued Date"]}
            rows={inventory.map((i) => [
              i.item_name || "—",
              i.category_name || "—",
              `${i.qty} ${i.unit}`,
              <code key="asn" style={{ fontSize: 11 }}>
                {i.asn_number}
              </code>,
              fmtDate(i.assigned_date),
            ])}
          />
        </AssetSection>
      </div>

      {/* Footer actions */}
      <div className="d-flex justify-content-end mt-4 pt-3 border-top">
        <button
          className="btn btn-sm btn-success d-flex align-items-center gap-2"
          onClick={exportPDF}
          disabled={printing}
        >
          <Printer size={13} />
          {printing ? "Generating PDF…" : "Print / Export PDF"}
        </button>
      </div>
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
function EmployeeClearance({ row, onReactivated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reactivating, setReactivating] = useState(false);

  async function reactivate() {
    setReactivating(true);
    try {
      await api.patch(`/api/employees/${row.id}/reactivate`);
      onReactivated?.();
    } catch (e) {
      setReactivating(false);
    }
  }

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
        <div className="d-flex gap-2">
          <button
            onClick={exportPDF}
            className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
          >
            <FileDown size={13} /> Clearance PDF
          </button>
          <button
            onClick={reactivate}
            disabled={reactivating}
            className="btn btn-sm btn-outline-success d-flex align-items-center gap-1"
          >
            <RotateCcw size={13} />
            {reactivating ? "Reactivating…" : "Reactivate Employee"}
          </button>
        </div>
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
  renderView: null,
  viewSize: "2xl",
};

function makeConfig(exMode, onReactivated) {
  return {
    ...config,
    apiPath: exMode
      ? "/api/employees?status=inactive"
      : "/api/employees?status=active",
    title: exMode ? "Ex-Employee" : "Employee",
    renderView: (row) => (
      <EmployeeProfile row={row} onReactivated={onReactivated} />
    ),
    viewExtra: null,
  };
}

export default function Employees() {
  const [exMode, setExMode] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  function onReactivated() {
    setReloadKey((k) => k + 1);
  }

  return (
    <ModulePage
      key={`${exMode ? "ex" : "active"}-${reloadKey}`}
      config={makeConfig(exMode, onReactivated)}
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
