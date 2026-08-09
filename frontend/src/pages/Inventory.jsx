import { useEffect, useState, useCallback } from "react";
import {
  Package,
  AlertTriangle,
  XCircle,
  TrendingDown,
  Plus,
  RefreshCw,
  Pencil,
  History,
  ArrowUpCircle,
  Monitor,
  Smartphone,
  ChevronDown,
  Boxes,
  Warehouse,
  QrCode,
} from "lucide-react";
import { motion } from "framer-motion";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Modal from "../components/ui/Modal";
import QRModal from "../components/ui/QRModal";
import { cn } from "../lib/utils";

const TRACKING_LABELS = {
  quantity: "Consumable",
  quantity_returnable: "Returnable",
  serialized: "Serialized",
};
const UNIT_STATUS_COLOR = {
  in_stock: { bg: "rgba(34,197,94,0.15)", color: "#4ade80" },
  reserved: { bg: "rgba(14,165,233,0.15)", color: "#7dd3fc" },
  installed: { bg: "rgba(0,170,47,0.15)", color: "#4ade80" },
  faulty: { bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
  rma: { bg: "rgba(168,85,247,0.15)", color: "#c4b5fd" },
  scrapped: { bg: "rgba(113,113,122,0.2)", color: "#a1a1aa" },
};
// Manual transitions only — 'installed' happens via repairs.
const UNIT_STATUSES = ["in_stock", "reserved", "faulty", "rma", "scrapped"];
const STOCK_BADGE = {
  in_stock: { bg: "rgba(34,197,94,0.15)", color: "#4ade80" },
  low_stock: { bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
  out_of_stock: { bg: "rgba(239,68,68,0.15)", color: "#f87171" },
};

const inp = "form-control form-control-sm";
const sel = "form-select form-select-sm";

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="itms-card p-3 d-flex align-items-center gap-3">
      <div
        className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
        style={{ width: 40, height: 40, background: color }}
      >
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="h5 fw-bold mb-0">{value}</p>
        <p className="small text-secondary mb-0">{label}</p>
      </div>
    </div>
  );
}

export default function Inventory() {
  const { canPerm } = useAuth();
  const { toast } = useToast();
  const canCreate = canPerm("inventory", "create");
  const canEdit = canPerm("inventory", "update");

  const [stats, setStats] = useState({});
  const [items, setItems] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [hwStock, setHwStock] = useState({ systems: [], mobiles: [] });
  const [hwOpen, setHwOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState("");
  const [search, setSearch] = useState("");

  const [itemModal, setItemModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [stockModal, setStockModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [catModal, setCatModal] = useState(false);
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);

  const [bins, setBins] = useState([]);
  const [binsModal, setBinsModal] = useState(false);
  const [binForm, setBinForm] = useState({ code: "", location: "" });
  const [unitsModal, setUnitsModal] = useState(null); // the serialized item
  const [units, setUnits] = useState([]);
  const [unitForm, setUnitForm] = useState({
    serials: "",
    bin_id: "",
    cost_pkr: "",
  });
  const [unitQR, setUnitQR] = useState(null);

  const [itemForm, setItemForm] = useState({});
  const [stockForm, setStockForm] = useState({
    type: "purchase",
    qty_change: "",
    notes: "",
  });
  const [catForm, setCatForm] = useState({
    name: "",
    description: "",
    parent_id: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, i, a, c, hw] = await Promise.all([
        api.get("/api/inventory/stats"),
        api.get("/api/inventory/items"),
        api.get("/api/inventory/alerts"),
        api.get("/api/inventory/categories"),
        api.get("/api/reports/unassigned"),
      ]);
      setStats(s);
      setItems(i);
      setAlerts(a);
      setCategories(c);
      setHwStock({ systems: hw.systems || [], mobiles: hw.mobiles || [] });
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = items.filter((i) => {
    const q = search.toLowerCase();
    const matchQ =
      !q ||
      i.name.toLowerCase().includes(q) ||
      (i.sku || "").toLowerCase().includes(q);
    const matchC = !catFilter || String(i.category_id) === catFilter;
    return matchQ && matchC;
  });

  async function saveItem() {
    setSaving(true);
    try {
      if (editItem) {
        await api.put(`/api/inventory/items/${editItem.id}`, itemForm);
        toast("Item updated", "success");
      } else {
        await api.post("/api/inventory/items", itemForm);
        toast("Item created", "success");
      }
      setItemModal(false);
      setEditItem(null);
      setItemForm({});
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveStock() {
    setSaving(true);
    try {
      const payload =
        stockForm.type === "write_off"
          ? { type: "write_off", qty_change: 0, notes: stockForm.notes }
          : stockForm;
      await api.post(`/api/inventory/items/${stockModal.id}/adjust`, payload);
      toast(
        stockForm.type === "write_off"
          ? "Item written off and archived"
          : "Stock updated",
        "success",
      );
      setStockModal(null);
      setStockForm({ type: "purchase", qty_change: "", notes: "" });
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveCat() {
    setSaving(true);
    try {
      await api.post("/api/inventory/categories", catForm);
      toast("Category created", "success");
      setCatModal(false);
      setCatForm({ name: "", description: "", parent_id: "" });
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function loadHistory(item) {
    try {
      const h = await api.get(`/api/inventory/items/${item.id}/history`);
      setHistory(h);
      setHistoryModal(item);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  function openEdit(item) {
    setEditItem(item);
    setItemForm({
      name: item.name,
      category_id: item.category_id || "",
      description: item.description || "",
      model: item.model || "",
      manufacturer: item.manufacturer || "",
      sku: item.sku || "",
      tracking_type: item.tracking_type,
      unit: item.unit,
      reorder_level: item.reorder_level,
      reorder_qty: item.reorder_qty,
    });
    setItemModal(true);
  }

  const fi = (k, v) => setItemForm((f) => ({ ...f, [k]: v }));
  const fs = (k, v) => setStockForm((f) => ({ ...f, [k]: v }));

  async function loadBins() {
    try {
      setBins(await api.get("/api/inventory/bins"));
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function saveBin() {
    setSaving(true);
    try {
      await api.post("/api/inventory/bins", binForm);
      toast("Bin created", "success");
      setBinForm({ code: "", location: "" });
      loadBins();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function openUnits(item) {
    try {
      const [u] = await Promise.all([
        api.get(`/api/inventory/items/${item.id}/units`),
        bins.length ? Promise.resolve() : loadBins(),
      ]);
      setUnits(u);
      setUnitForm({ serials: "", bin_id: "", cost_pkr: "" });
      setUnitsModal(item);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function addUnits() {
    const serials = unitForm.serials
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!serials.length) return;
    setSaving(true);
    try {
      await api.post(`/api/inventory/items/${unitsModal.id}/units`, {
        serials,
        bin_id: unitForm.bin_id || null,
        cost_pkr: unitForm.cost_pkr || null,
      });
      toast(`${serials.length} unit(s) added`, "success");
      setUnits(await api.get(`/api/inventory/items/${unitsModal.id}/units`));
      setUnitForm({ serials: "", bin_id: "", cost_pkr: "" });
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function setUnitStatus(unit, status) {
    try {
      await api.put(`/api/inventory/units/${unit.id}`, { status });
      setUnits(await api.get(`/api/inventory/items/${unitsModal.id}/units`));
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="d-flex flex-column gap-4"
    >
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between">
        <div>
          <h5 className="fw-bold mb-1">Inventory Stock</h5>
          <p className="small text-secondary mb-0">
            Consumables &amp; returnable items with stock levels
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            onClick={load}
            className="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center"
            style={{ width: 32, height: 32, padding: 0 }}
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => {
              loadBins();
              setBinsModal(true);
            }}
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
          >
            <Warehouse size={13} /> Bins
          </button>
          {canCreate && (
            <>
              <button
                onClick={() => setCatModal(true)}
                className="btn btn-outline-secondary btn-sm"
              >
                + Category
              </button>
              <button
                onClick={() => {
                  setEditItem(null);
                  setItemForm({ tracking_type: "quantity", unit: "pcs" });
                  setItemModal(true);
                }}
                className="btn btn-primary btn-sm d-flex align-items-center gap-1"
              >
                <Plus size={14} /> Add Item
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="row g-3">
        <div className="col-6 col-lg-3">
          <StatCard
            icon={Package}
            label="Total Items"
            value={stats.total_items || 0}
            color="var(--brand)"
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            icon={TrendingDown}
            label="Available"
            value={stats.total_available || 0}
            color="#22c55e"
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            icon={AlertTriangle}
            label="Low Stock"
            value={stats.low_stock || 0}
            color="#f59e0b"
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            icon={XCircle}
            label="Out of Stock"
            value={stats.out_of_stock || 0}
            color="#ef4444"
          />
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div
          className="rounded-3 p-3"
          style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.3)",
          }}
        >
          <p
            className="small fw-semibold mb-2 d-flex align-items-center gap-2"
            style={{ color: "#fbbf24" }}
          >
            <AlertTriangle size={15} /> Stock Alerts ({alerts.length})
          </p>
          <div className="d-flex flex-column gap-1">
            {alerts.map((a) => (
              <div
                key={a.id}
                className="d-flex align-items-center justify-content-between small"
              >
                <span>
                  {a.item_name}
                  {a.category_name && (
                    <span className="text-secondary ms-1">
                      · {a.category_name}
                    </span>
                  )}
                </span>
                <span
                  className="badge px-2 py-1"
                  style={{
                    background:
                      a.alert_type === "out_of_stock"
                        ? "rgba(239,68,68,0.15)"
                        : "rgba(245,158,11,0.15)",
                    color:
                      a.alert_type === "out_of_stock" ? "#f87171" : "#fbbf24",
                    fontSize: "11px",
                  }}
                >
                  {a.alert_type === "out_of_stock"
                    ? "Out of Stock"
                    : `Low: ${a.current_value} left`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="d-flex align-items-center gap-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          className={inp}
          style={{ width: 224 }}
        />
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className={sel}
          style={{ width: "auto" }}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {(search || catFilter) && (
          <button
            onClick={() => {
              setSearch("");
              setCatFilter("");
            }}
            className="btn btn-link btn-sm text-secondary p-0"
          >
            Clear
          </button>
        )}
        <span className="small text-secondary ms-auto">
          {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="itms-card overflow-hidden">
        {loading ? (
          <div className="text-center text-secondary py-5 small">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-secondary py-5 small">
            No items found
          </div>
        ) : (
          <div className="table-responsive">
            <table
              className="table table-hover mb-0"
              style={{ fontSize: "0.8125rem" }}
            >
              <thead>
                <tr>
                  {[
                    "Item",
                    "Category",
                    "Type",
                    "Available",
                    "Assigned",
                    "Reorder At",
                    "Status",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-uppercase text-secondary text-nowrap"
                      style={{ fontSize: "11px", letterSpacing: "0.05em" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const sb =
                    STOCK_BADGE[item.stock_status] || STOCK_BADGE.in_stock;
                  return (
                    <tr key={item.id}>
                      <td className="align-middle">
                        <div className="fw-medium">{item.name}</div>
                        {item.model && (
                          <div className="small text-secondary">
                            {item.manufacturer} {item.model}
                          </div>
                        )}
                      </td>
                      <td className="small text-secondary align-middle">
                        {item.category_name || "—"}
                      </td>
                      <td className="align-middle">
                        <span
                          className="badge bg-secondary bg-opacity-25 text-secondary"
                          style={{ fontSize: "11px" }}
                        >
                          {TRACKING_LABELS[item.tracking_type]}
                        </span>
                      </td>
                      <td className="align-middle font-monospace fw-semibold">
                        {item.qty_available ?? 0}{" "}
                        <span className="small fw-normal text-secondary">
                          {item.unit}
                        </span>
                      </td>
                      <td className="align-middle font-monospace text-secondary">
                        {item.qty_assigned ?? 0}
                      </td>
                      <td className="align-middle font-monospace text-secondary">
                        {item.reorder_level}
                      </td>
                      <td className="align-middle">
                        <span
                          className="badge rounded-pill px-2 py-1"
                          style={{
                            background: sb.bg,
                            color: sb.color,
                            fontSize: "11px",
                          }}
                        >
                          {item.stock_status?.replace("_", " ")}
                        </span>
                      </td>
                      <td className="align-middle">
                        <div className="d-flex align-items-center gap-1">
                          {item.tracking_type === "serialized" && (
                            <button
                              onClick={() => openUnits(item)}
                              title="Units"
                              className="btn btn-link p-1"
                              style={{ color: "#7dd3fc", lineHeight: 1 }}
                            >
                              <Boxes size={14} />
                            </button>
                          )}
                          {canEdit && (
                            <>
                              {item.tracking_type !== "serialized" && (
                                <button
                                  onClick={() => {
                                    setStockModal(item);
                                    setStockForm({
                                      type: "purchase",
                                      qty_change: "",
                                      notes: "",
                                    });
                                  }}
                                  title="Add Stock"
                                  className="btn btn-link p-1"
                                  style={{ color: "#4ade80", lineHeight: 1 }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.color = "#22c55e")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.color = "#4ade80")
                                  }
                                >
                                  <ArrowUpCircle size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => openEdit(item)}
                                title="Edit"
                                className="btn btn-link text-secondary p-1"
                                style={{ lineHeight: 1 }}
                              >
                                <Pencil size={13} />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => loadHistory(item)}
                            title="History"
                            className="btn btn-link text-secondary p-1"
                            style={{ lineHeight: 1 }}
                          >
                            <History size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Hardware In Stock */}
      {(hwStock.systems.length > 0 || hwStock.mobiles.length > 0) && (
        <div className="itms-card overflow-hidden">
          <button
            className="w-100 d-flex align-items-center justify-content-between px-4 py-3 border-0 bg-transparent text-start"
            onClick={() => setHwOpen((o) => !o)}
          >
            <span className="small fw-semibold d-flex align-items-center gap-2">
              <Monitor size={14} style={{ color: "#4ade80" }} />
              Hardware Assets In Stock
              <span
                className="badge rounded-pill ms-1"
                style={{
                  background: "rgba(0,170,47,0.12)",
                  color: "#4ade80",
                  fontSize: "11px",
                }}
              >
                {hwStock.systems.length + hwStock.mobiles.length}
              </span>
            </span>
            <ChevronDown
              size={14}
              className="text-secondary"
              style={{
                transition: "transform 0.2s",
                transform: hwOpen ? "rotate(180deg)" : "none",
              }}
            />
          </button>

          {hwOpen && (
            <div className="border-top">
              {hwStock.systems.length > 0 && (
                <div>
                  <p
                    className="px-4 pt-3 pb-1 small text-uppercase fw-semibold mb-0 d-flex align-items-center gap-2"
                    style={{ fontSize: "11px", color: "#4ade80" }}
                  >
                    <Monitor size={11} /> Systems ({hwStock.systems.length})
                  </p>
                  <div className="table-responsive">
                    <table
                      className="table table-hover mb-0"
                      style={{ fontSize: "0.8rem" }}
                    >
                      <thead>
                        <tr>
                          {[
                            "Asset Tag",
                            "Type",
                            "Brand",
                            "Model",
                            "Serial No.",
                            "Location",
                            "Status",
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
                        {hwStock.systems.map((r, i) => (
                          <tr key={i}>
                            <td
                              className="align-middle font-monospace"
                              style={{ padding: "0.45rem 0.75rem" }}
                            >
                              {r.asset_tag || "—"}
                            </td>
                            <td
                              className="align-middle small"
                              style={{ padding: "0.45rem 0.75rem" }}
                            >
                              {r.type || "—"}
                            </td>
                            <td
                              className="align-middle small text-secondary"
                              style={{ padding: "0.45rem 0.75rem" }}
                            >
                              {r.manufacturer || "—"}
                            </td>
                            <td
                              className="align-middle small text-secondary"
                              style={{ padding: "0.45rem 0.75rem" }}
                            >
                              {r.model || "—"}
                            </td>
                            <td
                              className="align-middle font-monospace small text-secondary"
                              style={{ padding: "0.45rem 0.75rem" }}
                            >
                              {r.serial_number || "—"}
                            </td>
                            <td
                              className="align-middle small text-secondary"
                              style={{ padding: "0.45rem 0.75rem" }}
                            >
                              {r.location || "—"}
                            </td>
                            <td
                              className="align-middle"
                              style={{ padding: "0.45rem 0.75rem" }}
                            >
                              <span
                                className="badge px-1"
                                style={{
                                  background: "rgba(0,170,47,0.12)",
                                  color: "#4ade80",
                                  fontSize: "10px",
                                }}
                              >
                                {r.status || "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {hwStock.mobiles.length > 0 && (
                <div className={hwStock.systems.length > 0 ? "border-top" : ""}>
                  <p
                    className="px-4 pt-3 pb-1 small text-uppercase fw-semibold mb-0 d-flex align-items-center gap-2"
                    style={{ fontSize: "11px", color: "#34d399" }}
                  >
                    <Smartphone size={11} /> Mobiles ({hwStock.mobiles.length})
                  </p>
                  <div className="table-responsive">
                    <table
                      className="table table-hover mb-0"
                      style={{ fontSize: "0.8rem" }}
                    >
                      <thead>
                        <tr>
                          {[
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
                        {hwStock.mobiles.map((r, i) => (
                          <tr key={i}>
                            <td
                              className="align-middle font-monospace"
                              style={{ padding: "0.45rem 0.75rem" }}
                            >
                              {r.asset_tag || "—"}
                            </td>
                            <td
                              className="align-middle small text-secondary"
                              style={{ padding: "0.45rem 0.75rem" }}
                            >
                              {r.manufacturer || "—"}
                            </td>
                            <td
                              className="align-middle small text-secondary"
                              style={{ padding: "0.45rem 0.75rem" }}
                            >
                              {r.model || "—"}
                            </td>
                            <td
                              className="align-middle font-monospace small text-secondary"
                              style={{ padding: "0.45rem 0.75rem" }}
                            >
                              {r.serial_number || "—"}
                            </td>
                            <td
                              className="align-middle"
                              style={{ padding: "0.45rem 0.75rem" }}
                            >
                              <span
                                className="badge px-1"
                                style={{
                                  background: "rgba(34,197,94,0.12)",
                                  color: "#34d399",
                                  fontSize: "10px",
                                }}
                              >
                                {r.status || "—"}
                              </span>
                            </td>
                            <td
                              className="align-middle small text-secondary"
                              style={{ padding: "0.45rem 0.75rem" }}
                            >
                              {r.condition || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Item Modal */}
      <Modal
        open={itemModal}
        onClose={() => {
          setItemModal(false);
          setEditItem(null);
        }}
        title={editItem ? "Edit Item" : "Add Inventory Item"}
      >
        <div className="d-flex flex-column gap-3">
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label small fw-medium mb-1">
                Item Name *
              </label>
              <input
                value={itemForm.name || ""}
                onChange={(e) => fi("name", e.target.value)}
                placeholder="e.g. Ethernet Cable Cat6"
                className={inp}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium mb-1">
                Category
              </label>
              <select
                value={itemForm.category_id || ""}
                onChange={(e) => fi("category_id", e.target.value)}
                className={sel}
              >
                <option value="">No Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium mb-1">Type</label>
              <select
                value={itemForm.tracking_type || "quantity"}
                onChange={(e) => fi("tracking_type", e.target.value)}
                className={sel}
              >
                <option value="quantity">Consumable</option>
                <option value="quantity_returnable">Returnable</option>
                <option value="serialized">Serialized (per-unit)</option>
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium mb-1">
                Manufacturer
              </label>
              <input
                value={itemForm.manufacturer || ""}
                onChange={(e) => fi("manufacturer", e.target.value)}
                placeholder="Dell, Logitech…"
                className={inp}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium mb-1">Model</label>
              <input
                value={itemForm.model || ""}
                onChange={(e) => fi("model", e.target.value)}
                placeholder="Model number…"
                className={inp}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium mb-1">Unit</label>
              <select
                value={itemForm.unit || "pcs"}
                onChange={(e) => fi("unit", e.target.value)}
                className={sel}
              >
                {["pcs", "meters", "box", "pair", "pack", "roll", "set"].map(
                  (u) => (
                    <option key={u}>{u}</option>
                  ),
                )}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium mb-1">SKU</label>
              <input
                value={itemForm.sku || ""}
                onChange={(e) => fi("sku", e.target.value)}
                placeholder="Internal SKU…"
                className={inp}
              />
            </div>
            {!editItem && itemForm.tracking_type !== "serialized" && (
              <div className="col-md-6">
                <label className="form-label small fw-medium mb-1">
                  Initial Qty
                </label>
                <input
                  type="number"
                  min="0"
                  value={itemForm.initial_qty || ""}
                  onChange={(e) => fi("initial_qty", e.target.value)}
                  placeholder="0"
                  className={inp}
                />
              </div>
            )}
            {itemForm.tracking_type === "serialized" && (
              <div className="col-md-6 d-flex align-items-end">
                <p className="small text-secondary mb-1">
                  Stock for serialized items comes from adding units (each with
                  its own serial number) after the item is created.
                </p>
              </div>
            )}
            <div className="col-md-6">
              <label className="form-label small fw-medium mb-1">
                Reorder Level
              </label>
              <input
                type="number"
                min="0"
                value={itemForm.reorder_level ?? ""}
                onChange={(e) => fi("reorder_level", e.target.value)}
                placeholder="5"
                className={inp}
              />
            </div>
            <div className="col-12">
              <label className="form-label small fw-medium mb-1">
                Description
              </label>
              <textarea
                value={itemForm.description || ""}
                onChange={(e) => fi("description", e.target.value)}
                rows={2}
                placeholder="Optional description…"
                className={inp}
                style={{ resize: "none" }}
              />
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 pt-1">
            <button
              onClick={() => {
                setItemModal(false);
                setEditItem(null);
              }}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              onClick={saveItem}
              disabled={saving || !itemForm.name}
              className="btn btn-primary btn-sm"
            >
              {saving ? "Saving…" : editItem ? "Update" : "Create Item"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Stock Modal */}
      <Modal
        open={!!stockModal}
        onClose={() => setStockModal(null)}
        title={`Adjust Stock — ${stockModal?.name}`}
      >
        <div className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small fw-medium mb-1">
              Adjustment Type
            </label>
            <select
              value={stockForm.type}
              onChange={(e) => fs("type", e.target.value)}
              className={sel}
            >
              <option value="purchase">Purchase / Receive Stock (+)</option>
              <option value="correction">Manual Correction</option>
              <option value="damaged">Mark Damaged (−)</option>
              <option value="lost">Mark Lost (−)</option>
              <option value="retired">Retire / Dispose (−)</option>
              <option value="write_off">
                Write Off — item discontinued / fully gone
              </option>
            </select>
          </div>
          {stockForm.type === "write_off" ? (
            <div
              className="rounded-3 p-3 small"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "#f87171",
              }}
            >
              This will zero all remaining stock and archive the item. It will
              no longer appear in active inventory. Use this when the item is
              discontinued or completely gone with no plans to restock.
            </div>
          ) : (
            <div>
              <label className="form-label small fw-medium mb-1">
                Quantity{" "}
                {stockForm.type === "purchase" ||
                stockForm.type === "correction"
                  ? "(positive = add)"
                  : "(units to remove)"}
              </label>
              <input
                type="number"
                value={stockForm.qty_change}
                onChange={(e) => fs("qty_change", e.target.value)}
                placeholder="e.g. 20"
                className={inp}
              />
              {stockModal && (
                <p className="small text-secondary mt-1 mb-0">
                  Current available:{" "}
                  <strong>{stockModal.qty_available ?? 0}</strong>{" "}
                  {stockModal.unit}
                </p>
              )}
            </div>
          )}
          <div>
            <label className="form-label small fw-medium mb-1">Notes</label>
            <input
              value={stockForm.notes}
              onChange={(e) => fs("notes", e.target.value)}
              placeholder="Reason or reference…"
              className={inp}
            />
          </div>
          <div className="d-flex justify-content-end gap-2 pt-1">
            <button
              onClick={() => setStockModal(null)}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              onClick={saveStock}
              disabled={
                saving ||
                (stockForm.type !== "write_off" && !stockForm.qty_change)
              }
              className={`btn btn-sm ${stockForm.type === "write_off" ? "btn-danger" : "btn-primary"}`}
            >
              {saving
                ? "Saving…"
                : stockForm.type === "write_off"
                  ? "Write Off Item"
                  : "Apply Adjustment"}
            </button>
          </div>
        </div>
      </Modal>

      {/* History Modal */}
      <Modal
        open={!!historyModal}
        onClose={() => setHistoryModal(null)}
        title={`Stock History — ${historyModal?.name}`}
      >
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {history.length === 0 ? (
            <p className="small text-secondary text-center py-4 mb-0">
              No history yet
            </p>
          ) : (
            history.map((h) => (
              <div
                key={h.id}
                className="d-flex align-items-center justify-content-between py-2 border-bottom small"
              >
                <div>
                  <span
                    className={cn(
                      "small fw-medium me-2",
                      h.qty_change > 0 ? "text-success" : "text-danger",
                    )}
                  >
                    {h.qty_change > 0 ? "+" : ""}
                    {h.qty_change}
                  </span>
                  <span className="text-secondary text-capitalize">
                    {h.type.replace("_", " ")}
                  </span>
                  {h.notes && (
                    <span className="text-secondary ms-1">· {h.notes}</span>
                  )}
                </div>
                <div
                  className="text-end text-secondary"
                  style={{ fontSize: "0.75rem" }}
                >
                  <div>{h.performed_by_name}</div>
                  <div>{new Date(h.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* Category Modal */}
      <Modal
        open={catModal}
        onClose={() => setCatModal(false)}
        title="Add Category"
      >
        <div className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small fw-medium mb-1">Name *</label>
            <input
              value={catForm.name}
              onChange={(e) =>
                setCatForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="e.g. Cables, Peripherals…"
              className={inp}
            />
          </div>
          <div>
            <label className="form-label small fw-medium mb-1">
              Parent Category
            </label>
            <select
              value={catForm.parent_id}
              onChange={(e) =>
                setCatForm((f) => ({ ...f, parent_id: e.target.value }))
              }
              className={sel}
            >
              <option value="">None (top-level)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label small fw-medium mb-1">
              Description
            </label>
            <input
              value={catForm.description}
              onChange={(e) =>
                setCatForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="Optional"
              className={inp}
            />
          </div>
          <div className="d-flex justify-content-end gap-2 pt-1">
            <button
              onClick={() => setCatModal(false)}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              onClick={saveCat}
              disabled={saving || !catForm.name}
              className="btn btn-primary btn-sm"
            >
              {saving ? "Saving…" : "Create Category"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Bins Modal */}
      <Modal
        open={binsModal}
        onClose={() => setBinsModal(false)}
        title="Storage Bins"
      >
        <div className="d-flex flex-column gap-3">
          {canCreate && (
            <div className="d-flex gap-2">
              <input
                value={binForm.code}
                onChange={(e) =>
                  setBinForm((f) => ({ ...f, code: e.target.value }))
                }
                placeholder="Code (e.g. R2-S4)"
                className={inp}
                style={{ flex: 1 }}
              />
              <input
                value={binForm.location}
                onChange={(e) =>
                  setBinForm((f) => ({ ...f, location: e.target.value }))
                }
                placeholder="Location"
                className={inp}
                style={{ flex: 2 }}
              />
              <button
                onClick={saveBin}
                disabled={saving || !binForm.code.trim()}
                className="btn btn-primary btn-sm"
              >
                Add
              </button>
            </div>
          )}
          {!bins.length ? (
            <p className="small text-secondary mb-0">No bins yet</p>
          ) : (
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr className="small text-secondary">
                  <th>Code</th>
                  <th>Location</th>
                  <th className="text-end">Units in stock</th>
                </tr>
              </thead>
              <tbody>
                {bins.map((b) => (
                  <tr key={b.id}>
                    <td className="font-monospace fw-semibold">{b.code}</td>
                    <td className="small text-secondary">
                      {b.location || "—"}
                    </td>
                    <td className="text-end font-monospace">
                      {b.units_in_stock}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>

      {/* Units Modal */}
      <Modal
        open={!!unitsModal}
        onClose={() => setUnitsModal(null)}
        title={unitsModal ? `Units — ${unitsModal.name}` : ""}
      >
        <div className="d-flex flex-column gap-3">
          {canCreate && (
            <div
              className="p-3 rounded-3"
              style={{ border: "1px solid var(--bs-border-color)" }}
            >
              <label className="form-label small fw-medium mb-1">
                Add units (one serial per line)
              </label>
              <textarea
                value={unitForm.serials}
                onChange={(e) =>
                  setUnitForm((f) => ({ ...f, serials: e.target.value }))
                }
                rows={3}
                placeholder={"SN-0001\nSN-0002"}
                className={inp}
                style={{ resize: "none" }}
              />
              <div className="d-flex gap-2 mt-2">
                <select
                  value={unitForm.bin_id}
                  onChange={(e) =>
                    setUnitForm((f) => ({ ...f, bin_id: e.target.value }))
                  }
                  className={sel}
                  style={{ flex: 2 }}
                >
                  <option value="">No bin</option>
                  {bins.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} {b.location ? `— ${b.location}` : ""}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  value={unitForm.cost_pkr}
                  onChange={(e) =>
                    setUnitForm((f) => ({ ...f, cost_pkr: e.target.value }))
                  }
                  placeholder="Unit cost PKR"
                  className={inp}
                  style={{ flex: 1 }}
                />
                <button
                  onClick={addUnits}
                  disabled={saving || !unitForm.serials.trim()}
                  className="btn btn-primary btn-sm"
                >
                  Add
                </button>
              </div>
            </div>
          )}
          {!units.length ? (
            <p className="small text-secondary mb-0">No units yet</p>
          ) : (
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr className="small text-secondary">
                    <th>Serial</th>
                    <th>Status</th>
                    <th>Bin</th>
                    <th className="text-end">Cost</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {units.map((u) => {
                    const sc =
                      UNIT_STATUS_COLOR[u.status] || UNIT_STATUS_COLOR.scrapped;
                    return (
                      <tr key={u.id}>
                        <td className="font-monospace">{u.serial_no}</td>
                        <td>
                          {u.status === "installed" ? (
                            <span
                              className="badge rounded-pill px-2"
                              style={{
                                background: sc.bg,
                                color: sc.color,
                                fontSize: "11px",
                              }}
                              title={`Installed in ${u.installed_asset_type} #${u.installed_asset_id}`}
                            >
                              installed → {u.installed_asset_type} #
                              {u.installed_asset_id}
                            </span>
                          ) : canEdit ? (
                            <select
                              value={u.status}
                              onChange={(e) => setUnitStatus(u, e.target.value)}
                              className="form-select form-select-sm py-0"
                              style={{
                                fontSize: "11px",
                                width: "auto",
                                background: sc.bg,
                                color: sc.color,
                                border: "none",
                              }}
                            >
                              {UNIT_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s.replace("_", " ")}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className="badge rounded-pill px-2"
                              style={{
                                background: sc.bg,
                                color: sc.color,
                                fontSize: "11px",
                              }}
                            >
                              {u.status.replace("_", " ")}
                            </span>
                          )}
                        </td>
                        <td className="small text-secondary">
                          {u.bin_code || "—"}
                        </td>
                        <td className="text-end small font-monospace">
                          {u.cost_pkr
                            ? Number(u.cost_pkr).toLocaleString()
                            : "—"}
                        </td>
                        <td className="text-end">
                          <button
                            onClick={() => setUnitQR(u)}
                            title="QR label"
                            className="btn btn-link text-secondary p-1"
                            style={{ lineHeight: 1 }}
                          >
                            <QrCode size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* Unit QR — the payload is a lookup URL, so any phone camera resolves
          the label to the unit's record. */}
      <QRModal
        open={!!unitQR}
        onClose={() => setUnitQR(null)}
        value={
          unitQR ? `${window.location.origin}/inventory/units/${unitQR.id}` : ""
        }
        label={unitQR?.serial_no || ""}
        details={
          unitQR
            ? [
                `Item: ${unitsModal?.name || ""}`,
                `Serial: ${unitQR.serial_no}`,
                unitQR.bin_code ? `Bin: ${unitQR.bin_code}` : null,
              ].filter(Boolean)
            : []
        }
      />
    </motion.div>
  );
}
