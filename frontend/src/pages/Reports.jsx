import React, { useCallback, useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileDown,
  AlertTriangle,
  Package,
  Users,
  Monitor,
  Smartphone,
  CreditCard,
  ChevronDown,
  Search,
  Building2,
  Wrench,
  FileText,
  PackageCheck,
  Network,
  DollarSign,
} from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { cn, fmtDate } from "../lib/utils";

// ── PDF export helper ─────────────────────────────────────
async function exportPDF(title, head, body) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({
    orientation: body[0]?.length > 6 ? "landscape" : "portrait",
  });
  doc.setFontSize(13);
  doc.setTextColor(40, 40, 40);
  doc.text(title, 14, 16);
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Bykea IT  ·  Generated ${new Date().toLocaleString("en-GB")}`,
    14,
    23,
  );
  autoTable(doc, {
    startY: 28,
    head: [head],
    body,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [0, 170, 47], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 252] },
    margin: { left: 14, right: 14 },
  });
  doc.save(`${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}

// ── Status badge ──────────────────────────────────────────
const STATUS_STYLE = {
  in_use: { bg: "rgba(34,197,94,0.1)", color: "#4ade80" },
  available: { bg: "rgba(14,165,233,0.1)", color: "#7dd3fc" },
  repair: { bg: "rgba(245,158,11,0.1)", color: "#fbbf24" },
  retired: { bg: "rgba(113,113,122,0.2)", color: "#a1a1aa" },
  active: { bg: "rgba(34,197,94,0.1)", color: "#4ade80" },
  inactive: { bg: "rgba(239,68,68,0.1)", color: "#f87171" },
  suspended: { bg: "rgba(245,158,11,0.1)", color: "#fbbf24" },
};
function StatusBadge({ v }) {
  const s = STATUS_STYLE[v] || {
    bg: "rgba(113,113,122,0.2)",
    color: "#a1a1aa",
  };
  return (
    <span
      className="badge px-1"
      style={{
        background: s.bg,
        color: s.color,
        fontSize: "10px",
        fontWeight: 500,
      }}
    >
      {v?.replace("_", " ") || "—"}
    </span>
  );
}

// ── Th / Td helpers ───────────────────────────────────────
const Th = ({ children }) => (
  <th
    className="text-secondary text-nowrap text-uppercase"
    style={{
      fontSize: "10px",
      letterSpacing: "0.05em",
      fontWeight: 600,
      padding: "0.5rem 0.75rem",
    }}
  >
    {children}
  </th>
);
const Td = ({ children, mono, dim }) => (
  <td
    className={cn(
      "align-middle text-nowrap",
      mono ? "font-monospace text-secondary" : dim ? "text-secondary" : "",
    )}
    style={{ fontSize: "0.75rem", padding: "0.5rem 0.75rem" }}
  >
    {children ?? "—"}
  </td>
);

// ── Search + filter bar ───────────────────────────────────
function FilterBar({ search, onSearch, children }) {
  return (
    <div className="d-flex align-items-center gap-2 flex-wrap">
      <div
        className="position-relative flex-grow-1"
        style={{ minWidth: 180, maxWidth: 240 }}
      >
        <Search
          size={13}
          className="position-absolute text-secondary"
          style={{
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
          }}
        />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search…"
          className="form-control form-control-sm"
          style={{ paddingLeft: 28 }}
        />
      </div>
      {children}
    </div>
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="form-select form-select-sm"
      style={{ minWidth: 140 }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function ExportBtn({
  label,
  icon: Icon = FileDown,
  onClick,
  variant = "secondary",
}) {
  return (
    <button
      onClick={onClick}
      className={`btn btn-${variant === "primary" ? "primary" : "outline-secondary"} btn-sm d-flex align-items-center gap-1`}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

// ── Tab bar ───────────────────────────────────────────────
const TABS = [
  { id: "employee-assets", label: "Employee Assets", icon: Users },
  { id: "warranty", label: "Warranty", icon: AlertTriangle },
  { id: "unassigned", label: "Unassigned", icon: Package },
  { id: "damage", label: "Damage & Repair", icon: Wrench },
  { id: "department", label: "Department Summary", icon: Building2 },
  { id: "inv-stock", label: "Inventory Stock", icon: Network },
  { id: "inv-assignments", label: "Inv. Assignments", icon: PackageCheck },
  { id: "sim-costs", label: "SIM Costs", icon: CreditCard },
  { id: "cost-analytics", label: "Cost Analytics", icon: DollarSign },
  { id: "full-export", label: "Full Export", icon: FileText },
];

// ── EMPLOYEE ASSETS TAB ───────────────────────────────────
function EmployeeAssetsTab({ filterOpts, toast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [loc, setLoc] = useState("");
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dept) params.set("department", dept);
    if (loc) params.set("location", loc);
    try {
      const data = await api.get(`/api/reports/employee-assets?${params}`);
      setRows(data);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [dept, loc, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.full_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.designation?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  function csvExport() {
    const params = new URLSearchParams();
    if (dept) params.set("department", dept);
    if (loc) params.set("location", loc);
    api
      .download(
        `/api/reports/employee-assets/csv?${params}`,
        "employee-assets.csv",
      )
      .catch((e) => toast(e.message, "error"));
  }

  async function pdfExport() {
    const head = [
      "Employee",
      "Designation",
      "Department",
      "Location",
      "Asset Type",
      "Asset Tag / Number",
      "Brand",
      "Model",
      "Status",
    ];
    const body = [];
    filtered.forEach((emp) => {
      const name = emp.full_name || "";
      const base = [
        name,
        emp.designation || "",
        emp.department || "",
        emp.location || "",
      ];
      (emp.systems || []).forEach((s) =>
        body.push([
          ...base,
          s.type || "System",
          s.asset_tag || "",
          s.manufacturer || "",
          s.model || "",
          s.status || "",
        ]),
      );
      (emp.mobiles || []).forEach((m) =>
        body.push([
          ...base,
          "Mobile",
          m.asset_tag || "",
          m.manufacturer || "",
          m.model || "",
          m.status || "",
        ]),
      );
      (emp.sims || []).forEach((s) =>
        body.push([
          ...base,
          "SIM Card",
          s.phone_number || "",
          s.vendor || "",
          s.package_name || "",
          s.status || "",
        ]),
      );
      if (!emp.systems?.length && !emp.mobiles?.length && !emp.sims?.length)
        body.push([...base, "—", "—", "—", "—", "—"]);
    });
    await exportPDF("Employee Asset Report", head, body);
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex align-items-center gap-2 flex-wrap justify-content-between">
        <FilterBar search={search} onSearch={setSearch}>
          <Select
            value={dept}
            onChange={setDept}
            options={filterOpts.departments}
            placeholder="All Departments"
          />
          <Select
            value={loc}
            onChange={setLoc}
            options={filterOpts.locations}
            placeholder="All Locations"
          />
        </FilterBar>
        <div className="d-flex gap-2">
          <ExportBtn label="CSV" onClick={csvExport} />
          <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
        </div>
      </div>

      <p className="small text-secondary mb-0">
        {filtered.length} employee{filtered.length !== 1 ? "s" : ""}
      </p>

      <div className="itms-card overflow-hidden">
        <div className="table-responsive">
          <table
            className="table table-hover mb-0"
            style={{ fontSize: "0.8125rem" }}
          >
            <thead>
              <tr>
                <Th></Th>
                <Th>Employee</Th>
                <Th>Designation</Th>
                <Th>Department</Th>
                <Th>Location</Th>
                <Th>Systems</Th>
                <Th>Mobiles</Th>
                <Th>SIMs</Th>
                <Th>Total</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center text-secondary py-5">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-secondary py-5">
                    No records found
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => {
                  const sysCount = emp.systems?.length || 0;
                  const mobCount = emp.mobiles?.length || 0;
                  const simCount = emp.sims?.length || 0;
                  const total = sysCount + mobCount + simCount;
                  const isOpen = expanded === emp.id;
                  return (
                    <React.Fragment key={emp.id}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : emp.id)}
                        style={{
                          cursor: "pointer",
                          background: isOpen ? "rgba(0,170,47,0.05)" : "",
                        }}
                      >
                        <td
                          className="align-middle"
                          style={{ padding: "0.5rem 0.75rem", width: 32 }}
                        >
                          <ChevronDown
                            size={13}
                            className="text-secondary"
                            style={{
                              transition: "transform 0.2s",
                              transform: isOpen ? "rotate(180deg)" : "none",
                            }}
                          />
                        </td>
                        <td
                          className="align-middle"
                          style={{ padding: "0.5rem 0.75rem" }}
                        >
                          <div className="small fw-semibold">
                            {emp.full_name}
                          </div>
                          <div
                            className="text-secondary"
                            style={{ fontSize: "10px" }}
                          >
                            {emp.email}
                          </div>
                        </td>
                        <Td dim>{emp.designation}</Td>
                        <Td dim>{emp.department}</Td>
                        <Td dim>{emp.location}</Td>
                        <td
                          className="align-middle"
                          style={{ padding: "0.5rem 0.75rem" }}
                        >
                          <span
                            className="badge px-2 py-1"
                            style={{
                              background:
                                sysCount > 0
                                  ? "rgba(0,170,47,0.1)"
                                  : "rgba(113,113,122,0.1)",
                              color: sysCount > 0 ? "#4ade80" : "#a1a1aa",
                              fontSize: "11px",
                            }}
                          >
                            {sysCount}
                          </span>
                        </td>
                        <td
                          className="align-middle"
                          style={{ padding: "0.5rem 0.75rem" }}
                        >
                          <span
                            className="badge px-2 py-1"
                            style={{
                              background:
                                mobCount > 0
                                  ? "rgba(34,197,94,0.1)"
                                  : "rgba(113,113,122,0.1)",
                              color: mobCount > 0 ? "#4ade80" : "#a1a1aa",
                              fontSize: "11px",
                            }}
                          >
                            {mobCount}
                          </span>
                        </td>
                        <td
                          className="align-middle"
                          style={{ padding: "0.5rem 0.75rem" }}
                        >
                          <span
                            className="badge px-2 py-1"
                            style={{
                              background:
                                simCount > 0
                                  ? "rgba(168,85,247,0.1)"
                                  : "rgba(113,113,122,0.1)",
                              color: simCount > 0 ? "#c4b5fd" : "#a1a1aa",
                              fontSize: "11px",
                            }}
                          >
                            {simCount}
                          </span>
                        </td>
                        <td
                          className="align-middle fw-bold"
                          style={{
                            padding: "0.5rem 0.75rem",
                            fontSize: "0.75rem",
                            color: total > 0 ? "inherit" : "#a1a1aa",
                          }}
                        >
                          {total}
                        </td>
                      </tr>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <tr key="detail">
                            <td
                              colSpan={9}
                              className="p-0"
                              style={{
                                borderBottom:
                                  "1px solid var(--bs-border-color)",
                              }}
                            >
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden"
                                style={{ background: "rgba(255,255,255,0.02)" }}
                              >
                                <div className="px-4 py-3 d-flex flex-column gap-3">
                                  {sysCount > 0 && (
                                    <div>
                                      <p
                                        className="text-uppercase fw-semibold mb-2 d-flex align-items-center gap-2"
                                        style={{
                                          fontSize: "10px",
                                          color: "#4ade80",
                                        }}
                                      >
                                        <Monitor size={10} /> Systems
                                      </p>
                                      <div className="table-responsive">
                                        <table
                                          className="table mb-0"
                                          style={{ fontSize: "0.75rem" }}
                                        >
                                          <thead>
                                            <tr>
                                              <Th>Asset Tag</Th>
                                              <Th>Type</Th>
                                              <Th>Brand</Th>
                                              <Th>Model</Th>
                                              <Th>Serial</Th>
                                              <Th>Gen</Th>
                                              <Th>Status</Th>
                                              <Th>Condition</Th>
                                              <Th>Location</Th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {emp.systems.map((s, i) => (
                                              <tr key={i}>
                                                <Td mono>{s.asset_tag}</Td>
                                                <Td>{s.type}</Td>
                                                <Td>{s.manufacturer}</Td>
                                                <Td>{s.model}</Td>
                                                <Td mono>{s.serial_number}</Td>
                                                <Td dim>{s.generation}</Td>
                                                <td
                                                  className="align-middle"
                                                  style={{
                                                    padding: "0.4rem 0.75rem",
                                                  }}
                                                >
                                                  <StatusBadge v={s.status} />
                                                </td>
                                                <Td dim>{s.condition}</Td>
                                                <Td dim>{s.location}</Td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                  {mobCount > 0 && (
                                    <div>
                                      <p
                                        className="text-uppercase fw-semibold mb-2 d-flex align-items-center gap-2"
                                        style={{
                                          fontSize: "10px",
                                          color: "#34d399",
                                        }}
                                      >
                                        <Smartphone size={10} /> Mobile Devices
                                      </p>
                                      <div className="table-responsive">
                                        <table
                                          className="table mb-0"
                                          style={{ fontSize: "0.75rem" }}
                                        >
                                          <thead>
                                            <tr>
                                              <Th>Asset Tag</Th>
                                              <Th>Brand</Th>
                                              <Th>Model</Th>
                                              <Th>OS</Th>
                                              <Th>Storage</Th>
                                              <Th>Status</Th>
                                              <Th>Condition</Th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {emp.mobiles.map((m, i) => (
                                              <tr key={i}>
                                                <Td mono>{m.asset_tag}</Td>
                                                <Td>{m.manufacturer}</Td>
                                                <Td>{m.model}</Td>
                                                <Td dim>{m.os}</Td>
                                                <Td dim>
                                                  {m.storage_capacity}
                                                </Td>
                                                <td
                                                  className="align-middle"
                                                  style={{
                                                    padding: "0.4rem 0.75rem",
                                                  }}
                                                >
                                                  <StatusBadge v={m.status} />
                                                </td>
                                                <Td dim>{m.condition}</Td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                  {simCount > 0 && (
                                    <div>
                                      <p
                                        className="text-uppercase fw-semibold mb-2 d-flex align-items-center gap-2"
                                        style={{
                                          fontSize: "10px",
                                          color: "#c4b5fd",
                                        }}
                                      >
                                        <CreditCard size={10} /> SIM Cards
                                      </p>
                                      <div className="table-responsive">
                                        <table
                                          className="table mb-0"
                                          style={{ fontSize: "0.75rem" }}
                                        >
                                          <thead>
                                            <tr>
                                              <Th>Phone Number</Th>
                                              <Th>Vendor</Th>
                                              <Th>Package</Th>
                                              <Th>Service Type</Th>
                                              <Th>Status</Th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {emp.sims.map((s, i) => (
                                              <tr key={i}>
                                                <Td mono>{s.phone_number}</Td>
                                                <Td>{s.vendor}</Td>
                                                <Td dim>{s.package_name}</Td>
                                                <Td dim>{s.service_type}</Td>
                                                <td
                                                  className="align-middle"
                                                  style={{
                                                    padding: "0.4rem 0.75rem",
                                                  }}
                                                >
                                                  <StatusBadge v={s.status} />
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                  {total === 0 && (
                                    <p className="small text-secondary fst-italic mb-0">
                                      No assets assigned
                                    </p>
                                  )}
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── WARRANTY TAB ──────────────────────────────────────────
const WARRANTY_CAT_STYLE = {
  System: { bg: "rgba(0,170,47,0.1)", color: "#4ade80" },
  Mobile: { bg: "rgba(34,197,94,0.1)", color: "#34d399" },
  Network: { bg: "rgba(14,165,233,0.1)", color: "#7dd3fc" },
};

function WarrantyTab({ toast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/reports/warranty")
      .then((d) => {
        if (!cancelled) setRows(d);
      })
      .catch((e) => {
        if (!cancelled) toast(e.message, "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const filtered = useMemo(() => {
    let out = rows;
    if (filter === "expired")
      out = out.filter((r) => Number(r.days_remaining) < 0);
    else if (filter === "30")
      out = out.filter(
        (r) => Number(r.days_remaining) >= 0 && Number(r.days_remaining) <= 30,
      );
    else if (filter === "90")
      out = out.filter(
        (r) => Number(r.days_remaining) >= 0 && Number(r.days_remaining) <= 90,
      );
    if (catFilter) out = out.filter((r) => r.category === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) =>
        [
          r.asset_tag,
          r.manufacturer,
          r.model,
          r.assigned_user_name,
          r.type,
        ].some((v) => v?.toLowerCase().includes(q)),
      );
    }
    return out;
  }, [rows, filter, catFilter, search]);

  function csvExport() {
    api
      .download("/api/reports/warranty/csv", "warranty-report.csv")
      .catch((e) => toast(e.message, "error"));
  }

  async function pdfExport() {
    const head = [
      "Category",
      "Asset Tag",
      "Type",
      "Brand",
      "Model",
      "Warranty Expiry",
      "Days Left",
      "Status",
      "Assigned To",
    ];
    const body = filtered.map((r) => [
      r.category || "",
      r.asset_tag || "",
      r.type || "",
      r.manufacturer || "",
      r.model || "",
      fmtDate(r.warranty_expiry),
      String(r.days_remaining ?? ""),
      r.status || "",
      r.assigned_user_name || "N/A",
    ]);
    await exportPDF("Warranty Report", head, body);
  }

  const warningColor = (days) => {
    const d = Number(days);
    if (d < 0) return { color: "#f87171" };
    if (d <= 30) return { color: "#f87171" };
    if (d <= 90) return { color: "#fbbf24" };
    return {};
  };

  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))];

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex align-items-center gap-2 flex-wrap justify-content-between">
        <FilterBar search={search} onSearch={setSearch}>
          <Select
            value={catFilter}
            onChange={setCatFilter}
            options={cats}
            placeholder="All categories"
          />
          <Select
            value={filter}
            onChange={setFilter}
            options={["expired", "30", "90"]}
            placeholder="All warranties"
          />
        </FilterBar>
        <div className="d-flex gap-2">
          <ExportBtn label="CSV" onClick={csvExport} />
          <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
        </div>
      </div>
      <p className="small text-secondary mb-0">
        {filtered.length} record{filtered.length !== 1 ? "s" : ""}
      </p>
      <div className="itms-card overflow-hidden">
        <div className="table-responsive">
          <table
            className="table table-hover mb-0"
            style={{ fontSize: "0.8125rem" }}
          >
            <thead>
              <tr>
                <Th>Category</Th>
                <Th>Asset Tag</Th>
                <Th>Type</Th>
                <Th>Brand</Th>
                <Th>Model</Th>
                <Th>Warranty Expiry</Th>
                <Th>Days Left</Th>
                <Th>Status</Th>
                <Th>Assigned To</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center text-secondary py-5">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-secondary py-5">
                    No records
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => {
                  const cs = WARRANTY_CAT_STYLE[r.category] || {
                    bg: "rgba(113,113,122,0.2)",
                    color: "#a1a1aa",
                  };
                  return (
                    <tr key={i}>
                      <td
                        className="align-middle"
                        style={{ padding: "0.5rem 0.75rem" }}
                      >
                        <span
                          className="badge px-1"
                          style={{
                            background: cs.bg,
                            color: cs.color,
                            fontSize: "10px",
                          }}
                        >
                          {r.category}
                        </span>
                      </td>
                      <Td mono>{r.asset_tag}</Td>
                      <Td>{r.type}</Td>
                      <Td dim>{r.manufacturer}</Td>
                      <Td dim>{r.model}</Td>
                      <td
                        className="align-middle small fw-medium"
                        style={{ padding: "0.5rem 0.75rem" }}
                      >
                        {fmtDate(r.warranty_expiry)}
                      </td>
                      <td
                        className="align-middle fw-bold small"
                        style={{
                          padding: "0.5rem 0.75rem",
                          ...warningColor(r.days_remaining),
                        }}
                      >
                        {Number(r.days_remaining) < 0
                          ? `${Math.abs(r.days_remaining)}d expired`
                          : `${r.days_remaining}d`}
                      </td>
                      <td
                        className="align-middle"
                        style={{ padding: "0.5rem 0.75rem" }}
                      >
                        <StatusBadge v={r.status} />
                      </td>
                      <Td dim>{r.assigned_user_name || "—"}</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── UNASSIGNED TAB ────────────────────────────────────────
function UnassignedTab({ toast }) {
  const [data, setData] = useState({ systems: [], mobiles: [], sims: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/reports/unassigned")
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) toast(e.message, "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const all = useMemo(() => {
    const merged = [
      ...(data.systems || []),
      ...(data.mobiles || []),
      ...(data.sims || []),
    ];
    let out =
      type === "all"
        ? merged
        : merged.filter(
            (r) =>
              r.category ===
              (type === "system"
                ? "System"
                : type === "mobile"
                  ? "Mobile"
                  : "SIM Card"),
          );
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) =>
        [r.asset_tag, r.manufacturer, r.model, r.serial_number, r.type].some(
          (v) => v?.toLowerCase().includes(q),
        ),
      );
    }
    return out;
  }, [data, search, type]);

  async function pdfExport() {
    const head = [
      "Category",
      "Asset Tag",
      "Type",
      "Brand",
      "Model",
      "Serial / Number",
      "Status",
      "Condition",
      "Location",
    ];
    const body = all.map((r) => [
      r.category || "",
      r.asset_tag || "",
      r.type || "",
      r.manufacturer || "",
      r.model || "",
      r.serial_number || "",
      r.status || "",
      r.condition || "",
      r.location || "",
    ]);
    await exportPDF("Unassigned Inventory", head, body);
  }

  const catStyle = {
    System: { bg: "rgba(0,170,47,0.1)", color: "#4ade80" },
    Mobile: { bg: "rgba(34,197,94,0.1)", color: "#34d399" },
    "SIM Card": { bg: "rgba(168,85,247,0.1)", color: "#c4b5fd" },
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex align-items-center gap-2 flex-wrap justify-content-between">
        <FilterBar search={search} onSearch={setSearch}>
          <Select
            value={type}
            onChange={setType}
            options={["system", "mobile", "sim"]}
            placeholder="All types"
          />
        </FilterBar>
        <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
      </div>
      <div className="d-flex gap-4 small text-secondary">
        <span>
          <strong style={{ color: "#4ade80" }}>{data.systems?.length}</strong>{" "}
          Systems
        </span>
        <span>
          <strong style={{ color: "#34d399" }}>{data.mobiles?.length}</strong>{" "}
          Mobiles
        </span>
        <span>
          <strong style={{ color: "#c4b5fd" }}>{data.sims?.length}</strong> SIM
          Cards
        </span>
      </div>
      <div className="itms-card overflow-hidden">
        <div className="table-responsive">
          <table
            className="table table-hover mb-0"
            style={{ fontSize: "0.8125rem" }}
          >
            <thead>
              <tr>
                <Th>Category</Th>
                <Th>Asset Tag</Th>
                <Th>Type</Th>
                <Th>Brand</Th>
                <Th>Model</Th>
                <Th>Serial / Number</Th>
                <Th>Status</Th>
                <Th>Condition</Th>
                <Th>Location</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center text-secondary py-5">
                    Loading…
                  </td>
                </tr>
              ) : all.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-secondary py-5">
                    No unassigned assets
                  </td>
                </tr>
              ) : (
                all.map((r, i) => {
                  const cs = catStyle[r.category] || {
                    bg: "rgba(113,113,122,0.2)",
                    color: "#a1a1aa",
                  };
                  return (
                    <tr key={i}>
                      <td
                        className="align-middle"
                        style={{ padding: "0.5rem 0.75rem" }}
                      >
                        <span
                          className="badge px-1"
                          style={{
                            background: cs.bg,
                            color: cs.color,
                            fontSize: "10px",
                          }}
                        >
                          {r.category}
                        </span>
                      </td>
                      <Td mono>{r.asset_tag}</Td>
                      <Td>{r.type}</Td>
                      <Td dim>{r.manufacturer}</Td>
                      <Td dim>{r.model}</Td>
                      <Td mono>{r.serial_number}</Td>
                      <td
                        className="align-middle"
                        style={{ padding: "0.5rem 0.75rem" }}
                      >
                        <StatusBadge v={r.status} />
                      </td>
                      <Td dim>{r.condition}</Td>
                      <Td dim>{r.location}</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── DAMAGE TAB ────────────────────────────────────────────
function DamageTab({ toast }) {
  const [data, setData] = useState({ systems: [], mobiles: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/reports/damage")
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) toast(e.message, "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const all = useMemo(() => {
    const merged = [...(data.systems || []), ...(data.mobiles || [])];
    let out =
      type === "all"
        ? merged
        : merged.filter(
            (r) => r.category === (type === "system" ? "System" : "Mobile"),
          );
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) =>
        [r.asset_tag, r.manufacturer, r.model, r.assigned_to].some((v) =>
          v?.toLowerCase().includes(q),
        ),
      );
    }
    return out;
  }, [data, search, type]);

  async function pdfExport() {
    const head = [
      "Category",
      "Asset Tag",
      "Type/OS",
      "Brand",
      "Model",
      "Serial",
      "Status",
      "Condition",
      "Assigned To",
      "Notes",
    ];
    const body = all.map((r) => [
      r.category || "",
      r.asset_tag || "",
      r.type || "",
      r.manufacturer || "",
      r.model || "",
      r.serial_number || "",
      r.status || "",
      r.condition || "",
      r.assigned_to || "Inventory",
      r.notes || "",
    ]);
    await exportPDF("Damage & Repair Report", head, body);
  }

  const catStyle = {
    System: { bg: "rgba(0,170,47,0.1)", color: "#4ade80" },
    Mobile: { bg: "rgba(34,197,94,0.1)", color: "#34d399" },
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex align-items-center gap-2 flex-wrap justify-content-between">
        <FilterBar search={search} onSearch={setSearch}>
          <Select
            value={type}
            onChange={setType}
            options={["system", "mobile"]}
            placeholder="All types"
          />
        </FilterBar>
        <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
      </div>
      <p className="small text-secondary mb-0">
        {all.length} item{all.length !== 1 ? "s" : ""}
      </p>
      <div className="itms-card overflow-hidden">
        <div className="table-responsive">
          <table
            className="table table-hover mb-0"
            style={{ fontSize: "0.8125rem" }}
          >
            <thead>
              <tr>
                <Th>Category</Th>
                <Th>Asset Tag</Th>
                <Th>Brand</Th>
                <Th>Model</Th>
                <Th>Serial</Th>
                <Th>Status</Th>
                <Th>Condition</Th>
                <Th>Assigned To</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center text-secondary py-5">
                    Loading…
                  </td>
                </tr>
              ) : all.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="text-center py-5"
                    style={{ color: "#4ade80" }}
                  >
                    No damaged or repair items
                  </td>
                </tr>
              ) : (
                all.map((r, i) => {
                  const cs = catStyle[r.category] || {
                    bg: "rgba(113,113,122,0.2)",
                    color: "#a1a1aa",
                  };
                  return (
                    <tr key={i}>
                      <td
                        className="align-middle"
                        style={{ padding: "0.5rem 0.75rem" }}
                      >
                        <span
                          className="badge px-1"
                          style={{
                            background: cs.bg,
                            color: cs.color,
                            fontSize: "10px",
                          }}
                        >
                          {r.category}
                        </span>
                      </td>
                      <Td mono>{r.asset_tag}</Td>
                      <Td>{r.manufacturer}</Td>
                      <Td dim>{r.model}</Td>
                      <Td mono>{r.serial_number}</Td>
                      <td
                        className="align-middle"
                        style={{ padding: "0.5rem 0.75rem" }}
                      >
                        <StatusBadge v={r.status} />
                      </td>
                      <td
                        className="align-middle"
                        style={{ padding: "0.5rem 0.75rem" }}
                      >
                        <span
                          className="badge px-1"
                          style={{
                            background: "rgba(239,68,68,0.1)",
                            color: "#f87171",
                            fontSize: "10px",
                          }}
                        >
                          {r.condition || "—"}
                        </span>
                      </td>
                      <Td dim>{r.assigned_to || "Inventory"}</Td>
                      <td
                        className="small text-secondary align-middle text-truncate"
                        style={{ maxWidth: 200, padding: "0.5rem 0.75rem" }}
                        title={r.notes}
                      >
                        {r.notes || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── DEPARTMENT SUMMARY TAB ────────────────────────────────
function DepartmentTab({ toast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/reports/department-summary")
      .then((d) => {
        if (!cancelled) setRows(d);
      })
      .catch((e) => {
        if (!cancelled) toast(e.message, "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const grouped = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      if (!map[r.dept]) map[r.dept] = {};
      map[r.dept][r.category] = r;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const cats = ["Systems", "Mobiles", "SIM Cards"];

  async function pdfExport() {
    const head = ["Department", "Category", "Total", "Assigned", "Inventory"];
    const body = rows.map((r) => [
      r.dept,
      r.category,
      String(r.total),
      String(r.assigned),
      String(r.inventory),
    ]);
    await exportPDF("Department Asset Summary", head, body);
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex justify-content-end">
        <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
      </div>
      <div className="itms-card overflow-hidden">
        <div className="table-responsive">
          <table
            className="table table-hover mb-0"
            style={{ fontSize: "0.8125rem" }}
          >
            <thead>
              <tr>
                <Th>Department</Th>
                {cats.map((c) => (
                  <React.Fragment key={c}>
                    <Th>{c} Total</Th>
                    <Th>Assigned</Th>
                    <Th>Inventory</Th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center text-secondary py-5">
                    Loading…
                  </td>
                </tr>
              ) : grouped.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-secondary py-5">
                    No data
                  </td>
                </tr>
              ) : (
                grouped.map(([dept, catMap]) => (
                  <tr key={dept}>
                    <td
                      className="small fw-semibold align-middle"
                      style={{ padding: "0.5rem 0.75rem" }}
                    >
                      {dept}
                    </td>
                    {cats.map((c) => {
                      const d = catMap[c] || {};
                      return (
                        <React.Fragment key={c}>
                          <td
                            className="small fw-bold align-middle"
                            style={{ padding: "0.5rem 0.75rem" }}
                          >
                            {d.total ?? 0}
                          </td>
                          <td
                            className="small align-middle"
                            style={{
                              padding: "0.5rem 0.75rem",
                              color: "#4ade80",
                            }}
                          >
                            {d.assigned ?? 0}
                          </td>
                          <td
                            className="small text-secondary align-middle"
                            style={{ padding: "0.5rem 0.75rem" }}
                          >
                            {d.inventory ?? 0}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── SIM COSTS TAB ─────────────────────────────────────────
function SIMCostsTab({ toast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/reports/sim-costs")
      .then((d) => {
        if (!cancelled) setRows(d);
      })
      .catch((e) => {
        if (!cancelled) toast(e.message, "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const total = rows.reduce((a, r) => a + Number(r.total_monthly || 0), 0);

  function csvExport() {
    api
      .download("/api/reports/sim-costs/csv", "sim-costs.csv")
      .catch((e) => toast(e.message, "error"));
  }

  async function pdfExport() {
    const head = ["Vendor", "Active SIMs", "Monthly Cost (PKR)"];
    const body = rows.map((r) => [
      r.vendor,
      String(r.count),
      Number(r.total_monthly || 0).toLocaleString(),
    ]);
    body.push([
      "TOTAL",
      String(rows.reduce((a, r) => a + Number(r.count), 0)),
      total.toLocaleString(),
    ]);
    await exportPDF("SIM Cost Analysis", head, body);
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex justify-content-end gap-2">
        <ExportBtn label="CSV" onClick={csvExport} />
        <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
      </div>
      <div className="itms-card overflow-hidden" style={{ maxWidth: 480 }}>
        <div className="px-4 py-3 border-bottom">
          <p className="small text-secondary mb-1">
            Total monthly spend (active SIMs)
          </p>
          <p className="h4 fw-bold mb-0">PKR {total.toLocaleString()}</p>
        </div>
        <div className="table-responsive">
          <table
            className="table table-hover mb-0"
            style={{ fontSize: "0.8125rem" }}
          >
            <thead>
              <tr>
                <Th>Vendor</Th>
                <Th>Active SIMs</Th>
                <Th>Monthly Cost (PKR)</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="text-center text-secondary py-5">
                    Loading…
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    <td
                      className="small fw-semibold align-middle"
                      style={{ padding: "0.5rem 0.75rem" }}
                    >
                      {r.vendor}
                    </td>
                    <td
                      className="small text-secondary align-middle"
                      style={{ padding: "0.5rem 0.75rem" }}
                    >
                      {r.count}
                    </td>
                    <td
                      className="small fw-bold align-middle"
                      style={{ padding: "0.5rem 0.75rem" }}
                    >
                      {Number(r.total_monthly || 0).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
              <tr
                style={{ background: "rgba(255,255,255,0.03)" }}
                className="fw-bold"
              >
                <td
                  className="small align-middle"
                  style={{ padding: "0.5rem 0.75rem" }}
                >
                  Total
                </td>
                <td
                  className="small align-middle"
                  style={{ padding: "0.5rem 0.75rem" }}
                >
                  {rows.reduce((a, r) => a + Number(r.count), 0)}
                </td>
                <td
                  className="small fw-bold align-middle"
                  style={{ padding: "0.5rem 0.75rem", color: "#4ade80" }}
                >
                  PKR {total.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── INVENTORY STOCK TAB ───────────────────────────────────
const STOCK_STATUS_STYLE = {
  in_stock: { bg: "rgba(34,197,94,0.1)", color: "#4ade80" },
  low_stock: { bg: "rgba(245,158,11,0.1)", color: "#fbbf24" },
  out_of_stock: { bg: "rgba(239,68,68,0.1)", color: "#f87171" },
};

function InvStockTab({ toast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/inventory/items")
      .then((d) => {
        if (!cancelled) setRows(d);
      })
      .catch((e) => {
        if (!cancelled) toast(e.message, "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const filtered = useMemo(() => {
    let out = rows;
    if (statusFilter) out = out.filter((r) => r.stock_status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) =>
        [r.name, r.category_name, r.sku, r.model].some((v) =>
          v?.toLowerCase().includes(q),
        ),
      );
    }
    return out;
  }, [rows, search, statusFilter]);

  const totals = useMemo(
    () => ({
      available: rows.reduce((s, r) => s + Number(r.qty_available || 0), 0),
      assigned: rows.reduce((s, r) => s + Number(r.qty_assigned || 0), 0),
      damaged: rows.reduce((s, r) => s + Number(r.qty_damaged || 0), 0),
      low: rows.filter((r) => r.stock_status === "low_stock").length,
      out: rows.filter((r) => r.stock_status === "out_of_stock").length,
    }),
    [rows],
  );

  async function pdfExport() {
    const head = [
      "Item",
      "Category",
      "SKU",
      "Available",
      "Assigned",
      "Damaged",
      "Reorder At",
      "Status",
    ];
    const body = filtered.map((r) => [
      r.name || "",
      r.category_name || "",
      r.sku || "",
      String(r.qty_available ?? 0),
      String(r.qty_assigned ?? 0),
      String(r.qty_damaged ?? 0),
      String(r.reorder_level ?? 0),
      r.stock_status?.replace("_", " ") || "",
    ]);
    await exportPDF("Inventory Stock Report", head, body);
  }

  const pills = [
    {
      label: "Available",
      value: totals.available,
      bg: "rgba(34,197,94,0.1)",
      color: "#4ade80",
    },
    {
      label: "Assigned",
      value: totals.assigned,
      bg: "rgba(14,165,233,0.1)",
      color: "#7dd3fc",
    },
    {
      label: "Damaged",
      value: totals.damaged,
      bg: "rgba(239,68,68,0.1)",
      color: "#f87171",
    },
    {
      label: "Low Stock",
      value: totals.low,
      bg: "rgba(245,158,11,0.1)",
      color: "#fbbf24",
    },
    {
      label: "Out of Stock",
      value: totals.out,
      bg: "rgba(239,68,68,0.1)",
      color: "#f87171",
    },
  ];

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex align-items-center gap-2 flex-wrap justify-content-between">
        <FilterBar search={search} onSearch={setSearch}>
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={["in_stock", "low_stock", "out_of_stock"]}
            placeholder="All stock levels"
          />
        </FilterBar>
        <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
      </div>

      <div className="d-flex flex-wrap gap-2">
        {pills.map((p, i) => (
          <span
            key={i}
            className="badge px-3 py-2 fw-semibold"
            style={{ background: p.bg, color: p.color, fontSize: "11px" }}
          >
            {p.value} <span className="fw-normal opacity-75">{p.label}</span>
          </span>
        ))}
      </div>

      <p className="small text-secondary mb-0">
        {filtered.length} item{filtered.length !== 1 ? "s" : ""}
      </p>
      <div className="itms-card overflow-hidden">
        <div className="table-responsive">
          <table
            className="table table-hover mb-0"
            style={{ fontSize: "0.8125rem" }}
          >
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Category</Th>
                <Th>SKU</Th>
                <Th>Available</Th>
                <Th>Assigned</Th>
                <Th>Damaged</Th>
                <Th>Reorder At</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center text-secondary py-5">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-secondary py-5">
                    No items found
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => {
                  const ss = STOCK_STATUS_STYLE[r.stock_status] || {
                    bg: "rgba(113,113,122,0.2)",
                    color: "#a1a1aa",
                  };
                  const avColor =
                    r.qty_available === 0
                      ? "#f87171"
                      : r.qty_available <= r.reorder_level
                        ? "#fbbf24"
                        : "#4ade80";
                  return (
                    <tr
                      key={i}
                      style={{
                        background:
                          r.stock_status === "out_of_stock"
                            ? "rgba(239,68,68,0.03)"
                            : r.stock_status === "low_stock"
                              ? "rgba(245,158,11,0.03)"
                              : "",
                      }}
                    >
                      <td
                        className="align-middle"
                        style={{ padding: "0.5rem 0.75rem" }}
                      >
                        <div className="small fw-semibold">{r.name}</div>
                        {r.model && (
                          <div
                            className="text-secondary"
                            style={{ fontSize: "10px" }}
                          >
                            {r.model}
                          </div>
                        )}
                      </td>
                      <Td dim>{r.category_name || "—"}</Td>
                      <Td mono>{r.sku || "—"}</Td>
                      <td
                        className="align-middle fw-bold small"
                        style={{ padding: "0.5rem 0.75rem", color: avColor }}
                      >
                        {r.qty_available ?? 0}
                      </td>
                      <Td>{r.qty_assigned ?? 0}</Td>
                      <Td dim>{r.qty_damaged ?? 0}</Td>
                      <Td dim>{r.reorder_level ?? 0}</Td>
                      <td
                        className="align-middle"
                        style={{ padding: "0.5rem 0.75rem" }}
                      >
                        <span
                          className="badge px-1"
                          style={{
                            background: ss.bg,
                            color: ss.color,
                            fontSize: "10px",
                          }}
                        >
                          {r.stock_status?.replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── INV. ASSIGNMENTS TAB ──────────────────────────────────
const ASN_STATUS_STYLE = {
  active: { bg: "rgba(34,197,94,0.1)", color: "#4ade80" },
  partially_returned: { bg: "rgba(245,158,11,0.1)", color: "#fbbf24" },
  fully_returned: { bg: "rgba(113,113,122,0.2)", color: "#a1a1aa" },
};

function InvAssignmentsTab({ toast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    try {
      const data = await api.get(`/api/assignments?${params}`);
      setRows(data);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      [r.asn_number, r.assignee_name, r.department, r.assigned_by_name].some(
        (v) => v?.toLowerCase().includes(q),
      ),
    );
  }, [rows, search]);

  async function pdfExport() {
    const head = [
      "ASN #",
      "Employee",
      "Department",
      "Assigned By",
      "Assigned Date",
      "Return By",
      "Status",
    ];
    const body = filtered.map((r) => [
      r.asn_number || "",
      r.assignee_name || "",
      r.department || "",
      r.assigned_by_name || "",
      fmtDate(r.assigned_date),
      fmtDate(r.expected_return_date),
      r.status?.replace(/_/g, " ") || "",
    ]);
    await exportPDF("Inventory Assignments Report", head, body);
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex align-items-center gap-2 flex-wrap justify-content-between">
        <FilterBar search={search} onSearch={setSearch}>
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={["active", "partially_returned", "fully_returned"]}
            placeholder="Active only"
          />
        </FilterBar>
        <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
      </div>
      <p className="small text-secondary mb-0">
        {filtered.length} assignment{filtered.length !== 1 ? "s" : ""}
      </p>
      <div className="itms-card overflow-hidden">
        <div className="table-responsive">
          <table
            className="table table-hover mb-0"
            style={{ fontSize: "0.8125rem" }}
          >
            <thead>
              <tr>
                <Th>ASN #</Th>
                <Th>Employee</Th>
                <Th>Department</Th>
                <Th>Assigned By</Th>
                <Th>Date</Th>
                <Th>Return By</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center text-secondary py-5">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-secondary py-5">
                    No assignments found
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => {
                  const ss = ASN_STATUS_STYLE[r.status] || {
                    bg: "rgba(113,113,122,0.2)",
                    color: "#a1a1aa",
                  };
                  const overdueColor =
                    new Date(r.expected_return_date) < new Date() &&
                    r.status === "active"
                      ? "#f87171"
                      : "";
                  return (
                    <tr key={i}>
                      <Td mono>{r.asn_number}</Td>
                      <td
                        className="align-middle"
                        style={{ padding: "0.5rem 0.75rem" }}
                      >
                        <div className="small fw-semibold">
                          {r.assignee_name}
                        </div>
                        {r.designation && (
                          <div
                            className="text-secondary"
                            style={{ fontSize: "10px" }}
                          >
                            {r.designation}
                          </div>
                        )}
                      </td>
                      <Td dim>{r.department || "—"}</Td>
                      <Td dim>{r.assigned_by_name}</Td>
                      <td
                        className="small text-secondary align-middle text-nowrap"
                        style={{ padding: "0.5rem 0.75rem" }}
                      >
                        {fmtDate(r.assigned_date)}
                      </td>
                      <td
                        className="small align-middle text-nowrap"
                        style={{
                          padding: "0.5rem 0.75rem",
                          color: overdueColor || undefined,
                        }}
                      >
                        {r.expected_return_date ? (
                          fmtDate(r.expected_return_date)
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>
                      <td
                        className="align-middle"
                        style={{ padding: "0.5rem 0.75rem" }}
                      >
                        <span
                          className="badge px-1"
                          style={{
                            background: ss.bg,
                            color: ss.color,
                            fontSize: "10px",
                          }}
                        >
                          {r.status?.replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── COST ANALYTICS TAB ───────────────────────────────────
function CostAnalyticsTab({ toast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/reports/cost-analytics")
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) toast(e.message, "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  function fmtPKR(v) {
    const n = Number(v || 0);
    if (n >= 1_000_000) return `PKR ${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `PKR ${(n / 1_000).toFixed(1)}K`;
    return `PKR ${n.toLocaleString()}`;
  }

  if (loading)
    return (
      <div className="text-center text-secondary py-5 small">Loading…</div>
    );
  if (!data) return null;

  const totalMaint = data.maintenanceByType.reduce(
    (s, r) => s + Number(r.total_cost || 0),
    0,
  );

  const TYPE_COLOR = {
    system: { bg: "rgba(0,170,47,0.1)", color: "#4ade80" },
    mobile: { bg: "rgba(34,197,94,0.1)", color: "#34d399" },
    network: { bg: "rgba(14,165,233,0.1)", color: "#7dd3fc" },
  };

  return (
    <div className="d-flex flex-column gap-4">
      {/* Summary cards */}
      <div className="row g-3">
        {[
          {
            label: "Total Maintenance Spend",
            value: fmtPKR(totalMaint),
            sub: "all time",
          },
          {
            label: "SIM Monthly Cost",
            value: fmtPKR(data.simMonthlyTotal),
            sub: "active SIMs / month",
          },
          {
            label: "Est. Annual SIM Cost",
            value: fmtPKR(data.simMonthlyTotal * 12),
            sub: "projected",
          },
        ].map((c, i) => (
          <div key={i} className="col-md-4">
            <div className="itms-card p-3">
              <p
                className="text-secondary text-uppercase fw-semibold mb-1"
                style={{ fontSize: "10px", letterSpacing: "0.08em" }}
              >
                {c.label}
              </p>
              <p className="h4 fw-bold mb-1">{c.value}</p>
              <p className="small text-secondary mb-0">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-4">
        {/* Maintenance by asset type */}
        <div className="col-md-6">
          <div className="itms-card p-3 d-flex flex-column gap-3">
            <p className="small fw-semibold mb-0">
              Maintenance Cost by Asset Type
            </p>
            {data.maintenanceByType.length === 0 ? (
              <p className="small text-secondary text-center py-3 mb-0">
                No maintenance costs recorded
              </p>
            ) : (
              data.maintenanceByType.map((r, i) => {
                const pct =
                  totalMaint > 0
                    ? (Number(r.total_cost) / totalMaint) * 100
                    : 0;
                const cs = TYPE_COLOR[r.asset_type] || {
                  bg: "rgba(113,113,122,0.2)",
                  color: "#a1a1aa",
                };
                return (
                  <div key={i}>
                    <div className="d-flex justify-content-between align-items-center small mb-1">
                      <span
                        className="badge px-1 text-capitalize"
                        style={{
                          background: cs.bg,
                          color: cs.color,
                          fontSize: "10px",
                        }}
                      >
                        {r.asset_type}
                      </span>
                      <span className="fw-semibold">
                        {fmtPKR(r.total_cost)}
                      </span>
                    </div>
                    <div
                      className="rounded-pill overflow-hidden"
                      style={{ height: 6, background: "rgba(113,113,122,0.2)" }}
                    >
                      <div
                        className="h-100 rounded-pill"
                        style={{
                          width: `${pct}%`,
                          background: "var(--brand)",
                          transition: "width 0.5s",
                        }}
                      />
                    </div>
                    <p
                      className="text-secondary mb-0 mt-1"
                      style={{ fontSize: "10px" }}
                    >
                      {r.events} event{r.events !== "1" ? "s" : ""} ·{" "}
                      {pct.toFixed(1)}%
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* SIM costs by vendor */}
        <div className="col-md-6">
          <div className="itms-card p-3 d-flex flex-column gap-3">
            <p className="small fw-semibold mb-0">SIM Monthly Cost by Vendor</p>
            {data.simByVendor.length === 0 ? (
              <p className="small text-secondary text-center py-3 mb-0">
                No active SIMs with monthly rates
              </p>
            ) : (
              data.simByVendor.map((r, i) => {
                const pct =
                  data.simMonthlyTotal > 0
                    ? (Number(r.monthly_total) / data.simMonthlyTotal) * 100
                    : 0;
                return (
                  <div key={i}>
                    <div className="d-flex justify-content-between align-items-center small mb-1">
                      <span className="fw-medium">{r.vendor || "Unknown"}</span>
                      <span className="fw-semibold">
                        {fmtPKR(r.monthly_total)}/mo
                      </span>
                    </div>
                    <div
                      className="rounded-pill overflow-hidden"
                      style={{ height: 6, background: "rgba(113,113,122,0.2)" }}
                    >
                      <div
                        className="h-100 rounded-pill"
                        style={{
                          width: `${pct}%`,
                          background: "#a855f7",
                          transition: "width 0.5s",
                        }}
                      />
                    </div>
                    <p
                      className="text-secondary mb-0 mt-1"
                      style={{ fontSize: "10px" }}
                    >
                      {r.sim_count} SIM{r.sim_count !== "1" ? "s" : ""} ·{" "}
                      {pct.toFixed(1)}%
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Maintenance by month table */}
      {data.maintenanceByMonth.length > 0 && (
        <div className="itms-card p-3 d-flex flex-column gap-3">
          <p className="small fw-semibold mb-0">
            Monthly Maintenance Spend (Last 12 Months)
          </p>
          <div className="table-responsive">
            <table
              className="table table-hover mb-0"
              style={{ fontSize: "0.8125rem" }}
            >
              <thead>
                <tr>
                  <Th>Month</Th>
                  <Th>Events</Th>
                  <Th>Total Spend</Th>
                </tr>
              </thead>
              <tbody>
                {data.maintenanceByMonth.map((r, i) => (
                  <tr key={i}>
                    <Td mono>{r.month}</Td>
                    <Td>{r.events}</Td>
                    <td
                      className="small fw-semibold align-middle"
                      style={{ padding: "0.5rem 0.75rem", color: "#4ade80" }}
                    >
                      {fmtPKR(r.total_cost)}
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

// ── FULL EXPORT TAB ───────────────────────────────────────
function FullExportTab({ toast }) {
  const exports = [
    {
      label: "Full Inventory (All Modules)",
      file: "full-report.csv",
      url: "/api/reports/summary/csv",
      desc: "Systems, Network, Mobiles, SIMs, Cloud IDs",
    },
    {
      label: "Employee Assets",
      file: "employee-assets.csv",
      url: "/api/reports/employee-assets/csv",
      desc: "All assigned assets per employee",
    },
    {
      label: "Warranty Report",
      file: "warranty-report.csv",
      url: "/api/reports/warranty/csv",
      desc: "All systems with warranty dates",
    },
    {
      label: "SIM Costs",
      file: "sim-costs.csv",
      url: "/api/reports/sim-costs/csv",
      desc: "Active SIM breakdown with monthly rates",
    },
  ];
  return (
    <div className="row g-3" style={{ maxWidth: 640 }}>
      {exports.map((e, i) => (
        <div key={i} className="col-md-6">
          <div className="itms-card p-3 d-flex align-items-start justify-content-between gap-3">
            <div>
              <p className="small fw-semibold mb-1">{e.label}</p>
              <p className="small text-secondary mb-0">{e.desc}</p>
            </div>
            <button
              onClick={() =>
                api
                  .download(e.url, e.file)
                  .catch((err) => toast(err.message, "error"))
              }
              className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1 flex-shrink-0"
            >
              <FileDown size={13} /> CSV
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── MAIN REPORTS PAGE ─────────────────────────────────────
export default function Reports() {
  const { toast } = useToast();
  const { canPerm } = useAuth();
  const [tab, setTab] = useState("employee-assets");
  const [filterOpts, setFilterOpts] = useState({
    departments: [],
    locations: [],
  });

  useEffect(() => {
    api
      .get("/api/reports/filter-options")
      .then(setFilterOpts)
      .catch((e) => toast(e.message, "error"));

    const handler = (e) => {
      if (e.detail?.action === "export")
        api
          .download("/api/reports/summary/csv", "full-report.csv")
          .catch((err) => toast(err.message, "error"));
    };
    window.addEventListener("module-action", handler);
    return () => window.removeEventListener("module-action", handler);
  }, [toast]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="d-flex flex-column gap-4"
    >
      {/* Tab navigation */}
      <div className="d-flex gap-1 flex-wrap border-bottom pb-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="d-flex align-items-center gap-1 px-3 py-2 rounded-top-2 border-0 border-bottom border-2 small fw-medium"
              style={{
                marginBottom: -1,
                background: active ? "rgba(0,170,47,0.05)" : "transparent",
                borderColor: active ? "var(--brand)" : "transparent",
                color: active ? "var(--brand)" : "#71717a",
                transition: "all 0.15s",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.color = "inherit";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.color = "#71717a";
              }}
            >
              <Icon size={12} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          {tab === "employee-assets" && (
            <EmployeeAssetsTab filterOpts={filterOpts} toast={toast} />
          )}
          {tab === "warranty" && <WarrantyTab toast={toast} />}
          {tab === "unassigned" && <UnassignedTab toast={toast} />}
          {tab === "damage" && <DamageTab toast={toast} />}
          {tab === "department" && <DepartmentTab toast={toast} />}
          {tab === "inv-stock" && <InvStockTab toast={toast} />}
          {tab === "inv-assignments" && <InvAssignmentsTab toast={toast} />}
          {tab === "sim-costs" && <SIMCostsTab toast={toast} />}
          {tab === "cost-analytics" && <CostAnalyticsTab toast={toast} />}
          {tab === "full-export" && <FullExportTab toast={toast} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
