import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  CheckCircle,
  XCircle,
  Layers,
  Tag,
  Tags,
  ChevronRight,
} from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";

const TABS = [
  { key: "categories", label: "Categories", icon: Layers },
  { key: "heads", label: "Heads", icon: Tag },
  { key: "subheads", label: "Sub-Heads", icon: Tags },
];

function StatusBadge({ status }) {
  return status === "active" ? (
    <span className="badge rounded-pill bg-success-subtle text-success border border-success-subtle px-2">
      Active
    </span>
  ) : (
    <span className="badge rounded-pill bg-secondary-subtle text-secondary border border-secondary-subtle px-2">
      Inactive
    </span>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  danger,
  variant = "secondary",
}) {
  return (
    <button
      className={`btn btn-sm btn-${danger ? "outline-danger" : `outline-${variant}`} py-0 px-2`}
      style={{ fontSize: "11px" }}
      title={label}
      onClick={onClick}
    >
      <Icon size={12} className="me-1" />
      {label}
    </button>
  );
}

function ConfirmModal({ show, message, onConfirm, onCancel }) {
  if (!show) return null;
  return (
    <div
      className="modal show d-block"
      style={{ background: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-sm modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-body py-4 text-center">
            <p className="mb-3">{message}</p>
            <div className="d-flex justify-content-center gap-2">
              <button className="btn btn-sm btn-secondary" onClick={onCancel}>
                Cancel
              </button>
              <button className="btn btn-sm btn-danger" onClick={onConfirm}>
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Category Form ──────────────────────────────────────────
function CategoryForm({ vals, onChange }) {
  return (
    <div className="row g-3">
      <div className="col-12">
        <label className="form-label small fw-medium mb-1">
          Category Name <span className="text-danger">*</span>
        </label>
        <input
          className="form-control form-control-sm"
          value={vals.category_name || ""}
          onChange={(e) => onChange("category_name", e.target.value)}
          placeholder="e.g. Mobile, SIM Cards, Systems"
        />
      </div>
      <div className="col-12">
        <label className="form-label small fw-medium mb-1">Description</label>
        <textarea
          className="form-control form-control-sm"
          rows={2}
          value={vals.description || ""}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="Optional description"
          style={{ resize: "none" }}
        />
      </div>
    </div>
  );
}

// ── Head Form ──────────────────────────────────────────────
function HeadForm({ vals, onChange, categories, onSwitchTab }) {
  if (categories.length === 0) {
    return (
      <div className="text-center py-3">
        <p className="text-secondary small mb-2">No categories exist yet.</p>
        <p className="small mb-3">
          You must create a <strong>Category</strong> first (e.g. <em>RAM</em>,{" "}
          <em>CPU</em>, <em>Mobile</em>), then add Heads under it.
        </p>
        <button
          className="btn btn-sm btn-success"
          onClick={() => onSwitchTab("categories")}
        >
          Go to Categories →
        </button>
      </div>
    );
  }
  return (
    <div className="row g-3">
      <div className="col-12">
        <label className="form-label small fw-medium mb-1">
          Category <span className="text-danger">*</span>
        </label>
        <select
          className="form-select form-select-sm"
          value={vals.category_id || ""}
          onChange={(e) => onChange("category_id", e.target.value)}
        >
          <option value="">— Select Category —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.category_name}
            </option>
          ))}
        </select>
      </div>
      <div className="col-12">
        <label className="form-label small fw-medium mb-1">
          Head Name <span className="text-danger">*</span>
        </label>
        <input
          className="form-control form-control-sm"
          value={vals.head_name || ""}
          onChange={(e) => onChange("head_name", e.target.value)}
          placeholder="e.g. Manufacturer, Calling Packages, RAM"
        />
      </div>
      <div className="col-12">
        <label className="form-label small fw-medium mb-1">Description</label>
        <textarea
          className="form-control form-control-sm"
          rows={2}
          value={vals.description || ""}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="Optional description"
          style={{ resize: "none" }}
        />
      </div>
    </div>
  );
}

// ── Sub-Head Form ──────────────────────────────────────────
function SubHeadForm({ vals, onChange, categories, allHeads, onSwitchTab }) {
  const filteredHeads = vals.category_id
    ? allHeads.filter((h) => String(h.category_id) === String(vals.category_id))
    : allHeads;

  function handleCategoryChange(catId) {
    onChange("category_id", catId);
    onChange("head_id", "");
  }

  if (categories.length === 0) {
    return (
      <div className="text-center py-3">
        <p className="text-secondary small mb-2">No categories exist yet.</p>
        <p className="small mb-3">
          Create a <strong>Category</strong> first, then add{" "}
          <strong>Heads</strong> under it, before adding Sub-Heads.
        </p>
        <button
          className="btn btn-sm btn-success"
          onClick={() => onSwitchTab("categories")}
        >
          Go to Categories →
        </button>
      </div>
    );
  }

  if (allHeads.length === 0) {
    return (
      <div className="text-center py-3">
        <p className="text-secondary small mb-2">No heads exist yet.</p>
        <p className="small mb-3">
          Create a <strong>Head</strong> under a category first before adding
          Sub-Heads.
        </p>
        <button
          className="btn btn-sm btn-success"
          onClick={() => onSwitchTab("heads")}
        >
          Go to Heads →
        </button>
      </div>
    );
  }

  return (
    <div className="row g-3">
      <div className="col-12">
        <label className="form-label small fw-medium mb-1">Category</label>
        <select
          className="form-select form-select-sm"
          value={vals.category_id || ""}
          onChange={(e) => handleCategoryChange(e.target.value)}
        >
          <option value="">— Select Category to filter Heads —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.category_name}
            </option>
          ))}
        </select>
      </div>
      <div className="col-12">
        <label className="form-label small fw-medium mb-1">
          Head <span className="text-danger">*</span>
        </label>
        <select
          className="form-select form-select-sm"
          value={vals.head_id || ""}
          onChange={(e) => onChange("head_id", e.target.value)}
        >
          <option value="">— Select Head —</option>
          {filteredHeads.map((h) => (
            <option key={h.id} value={h.id}>
              {h.head_name}
            </option>
          ))}
        </select>
      </div>
      <div className="col-12">
        <label className="form-label small fw-medium mb-1">
          Sub-Head Name <span className="text-danger">*</span>
        </label>
        <input
          className="form-control form-control-sm"
          value={vals.sub_head_name || ""}
          onChange={(e) => onChange("sub_head_name", e.target.value)}
          placeholder="e.g. Samsung Galaxy S24, 8 GB DDR4, 512 GB SSD"
        />
      </div>
      <div className="col-12">
        <label className="form-label small fw-medium mb-1">Description</label>
        <textarea
          className="form-control form-control-sm"
          rows={2}
          value={vals.description || ""}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="Optional description"
          style={{ resize: "none" }}
        />
      </div>
    </div>
  );
}

// ── Edit/Add Modal ─────────────────────────────────────────
function EditModal({
  show,
  mode,
  tab,
  vals,
  onChange,
  onSave,
  onClose,
  onSwitchTab,
  categories,
  allHeads,
  saving,
  error,
}) {
  if (!show) return null;
  const title =
    mode === "add"
      ? `Add ${tab === "categories" ? "Category" : tab === "heads" ? "Head" : "Sub-Head"}`
      : `Edit ${tab === "categories" ? "Category" : tab === "heads" ? "Head" : "Sub-Head"}`;

  return (
    <div
      className="modal show d-block"
      style={{ background: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header py-3">
            <h6 className="modal-title fw-semibold">{title}</h6>
            <button className="btn-close btn-close-white" onClick={onClose} />
          </div>
          <div className="modal-body">
            {error && (
              <div className="alert alert-danger py-2 small mb-3">{error}</div>
            )}
            {tab === "categories" && (
              <CategoryForm vals={vals} onChange={onChange} />
            )}
            {tab === "heads" && (
              <HeadForm
                vals={vals}
                onChange={onChange}
                categories={categories}
                onSwitchTab={(t) => {
                  onClose();
                  onSwitchTab(t);
                }}
              />
            )}
            {tab === "subheads" && (
              <SubHeadForm
                vals={vals}
                onChange={onChange}
                categories={categories}
                allHeads={allHeads}
                onSwitchTab={(t) => {
                  onClose();
                  onSwitchTab(t);
                }}
              />
            )}
          </div>
          <div className="modal-footer py-2">
            <button
              className="btn btn-sm btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="btn btn-sm btn-success"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────
export default function HeadManagement() {
  const { toast } = useToast();
  const { canPerm } = useAuth();

  const [tab, setTab] = useState("categories");
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState([]);
  const [heads, setHeads] = useState([]);
  const [subheads, setSubheads] = useState([]);
  const [loading, setLoading] = useState(false);

  const [modal, setModal] = useState({
    show: false,
    mode: "add",
    vals: {},
    error: "",
    saving: false,
  });
  const [confirm, setConfirm] = useState({
    show: false,
    message: "",
    onConfirm: null,
  });

  const canCreate = canPerm("masterdata", "create");
  const canUpdate = canPerm("masterdata", "update");
  const canDelete = canPerm("masterdata", "delete");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, hds, shs] = await Promise.all([
        api.get("/api/masterdata/categories"),
        api.get("/api/masterdata/heads"),
        api.get("/api/masterdata/subheads"),
      ]);
      setCategories(Array.isArray(cats) ? cats : []);
      setHeads(Array.isArray(hds) ? hds : []);
      setSubheads(Array.isArray(shs) ? shs : []);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setModal({ show: true, mode: "add", vals: {}, error: "", saving: false });
  }

  function openEdit(item) {
    const vals =
      tab === "categories"
        ? {
            category_name: item.category_name,
            description: item.description || "",
          }
        : tab === "heads"
          ? {
              category_id: String(item.category_id),
              head_name: item.head_name,
              description: item.description || "",
            }
          : {
              head_id: String(item.head_id),
              category_id: String(item.category_id),
              sub_head_name: item.sub_head_name,
              description: item.description || "",
            };
    setModal({
      show: true,
      mode: "edit",
      id: item.id,
      vals,
      error: "",
      saving: false,
    });
  }

  function onChange(k, v) {
    setModal((m) => ({ ...m, vals: { ...m.vals, [k]: v } }));
  }

  async function onSave() {
    setModal((m) => ({ ...m, saving: true, error: "" }));
    try {
      const { mode, id, vals } = modal;
      if (tab === "categories") {
        if (mode === "add") await api.post("/api/masterdata/categories", vals);
        else await api.put(`/api/masterdata/categories/${id}`, vals);
      } else if (tab === "heads") {
        if (mode === "add") await api.post("/api/masterdata/heads", vals);
        else await api.put(`/api/masterdata/heads/${id}`, vals);
      } else {
        if (mode === "add") await api.post("/api/masterdata/subheads", vals);
        else await api.put(`/api/masterdata/subheads/${id}`, vals);
      }
      setModal({
        show: false,
        mode: "add",
        vals: {},
        error: "",
        saving: false,
      });
      toast(`${mode === "add" ? "Added" : "Updated"} successfully`, "success");
      load();
    } catch (e) {
      setModal((m) => ({ ...m, saving: false, error: e.message }));
    }
  }

  async function onToggle(item) {
    const base =
      tab === "categories"
        ? "categories"
        : tab === "heads"
          ? "heads"
          : "subheads";
    try {
      await api.patch(`/api/masterdata/${base}/${item.id}/toggle`);
      toast("Status updated", "success");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  function confirmDelete(item) {
    const name = item.category_name || item.head_name || item.sub_head_name;
    setConfirm({
      show: true,
      message: `Delete "${name}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirm({ show: false });
        const base =
          tab === "categories"
            ? "categories"
            : tab === "heads"
              ? "heads"
              : "subheads";
        try {
          await api.del(`/api/masterdata/${base}/${item.id}`);
          toast("Deleted successfully", "success");
          load();
        } catch (e) {
          toast(e.message, "error");
        }
      },
    });
  }

  // ── Filter ────────────────────────────────────────────────
  const q = search.toLowerCase();
  const filteredCategories = categories.filter(
    (c) =>
      c.category_name.toLowerCase().includes(q) ||
      (c.description || "").toLowerCase().includes(q),
  );
  const filteredHeads = heads.filter(
    (h) =>
      h.head_name.toLowerCase().includes(q) ||
      h.category_name.toLowerCase().includes(q),
  );
  const filteredSubheads = subheads.filter(
    (s) =>
      s.sub_head_name.toLowerCase().includes(q) ||
      s.head_name.toLowerCase().includes(q) ||
      s.category_name.toLowerCase().includes(q),
  );

  return (
    <div className="p-4" style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div className="d-flex align-items-center gap-2 mb-1">
        <span className="text-secondary small">Master Data</span>
        <ChevronRight size={13} className="text-secondary" />
        <span className="small fw-medium">Head &amp; Sub-Head Management</span>
      </div>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h4 className="fw-bold mb-0">Head &amp; Sub-Head Management</h4>
          <p className="text-secondary small mb-0">
            Manage master data categories, heads, and sub-heads
          </p>
        </div>
        {canCreate && (
          <button
            className="btn btn-sm btn-success d-flex align-items-center gap-1"
            onClick={openAdd}
          >
            <Plus size={14} />
            Add{" "}
            {tab === "categories"
              ? "Category"
              : tab === "heads"
                ? "Head"
                : "Sub-Head"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="d-flex align-items-center gap-1 mb-3 border-bottom border-secondary border-opacity-25 pb-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          const count =
            t.key === "categories"
              ? categories.length
              : t.key === "heads"
                ? heads.length
                : subheads.length;
          return (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setSearch("");
              }}
              className={`btn btn-sm d-flex align-items-center gap-1 rounded-0 border-0 border-bottom px-3 py-2 ${
                tab === t.key
                  ? "border-success text-success fw-semibold"
                  : "text-secondary"
              }`}
              style={{
                borderBottomWidth: tab === t.key ? 2 : 0,
                borderBottomStyle: "solid",
                marginBottom: -1,
                background: "transparent",
              }}
            >
              <Icon size={13} />
              {t.label}
              <span
                className={`badge rounded-pill ms-1 ${tab === t.key ? "bg-success" : "bg-secondary"}`}
                style={{ fontSize: 10 }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="mb-3" style={{ maxWidth: 320 }}>
        <div className="input-group input-group-sm">
          <span className="input-group-text bg-transparent border-secondary-subtle">
            <Search size={13} className="text-secondary" />
          </span>
          <input
            className="form-control border-secondary-subtle"
            placeholder={`Search ${tab}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tables */}
      {loading ? (
        <div className="text-secondary small py-5 text-center">Loading…</div>
      ) : (
        <>
          {/* Categories Table */}
          {tab === "categories" && (
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle small mb-0">
                <thead>
                  <tr
                    className="text-secondary"
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    <th>#</th>
                    <th>Category Name</th>
                    <th>Description</th>
                    <th>Total Heads</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center text-secondary py-4"
                      >
                        No categories found
                      </td>
                    </tr>
                  ) : (
                    filteredCategories.map((c, i) => (
                      <tr key={c.id}>
                        <td className="text-secondary">{i + 1}</td>
                        <td className="fw-medium">{c.category_name}</td>
                        <td className="text-secondary">
                          {c.description || "—"}
                        </td>
                        <td>
                          <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                            {c.head_count}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={c.status} />
                        </td>
                        <td>
                          <div className="d-flex gap-1 flex-wrap">
                            {canUpdate && (
                              <ActionBtn
                                icon={Pencil}
                                label="Edit"
                                onClick={() => openEdit(c)}
                                variant="primary"
                              />
                            )}
                            {canUpdate && (
                              <ActionBtn
                                icon={
                                  c.status === "active" ? XCircle : CheckCircle
                                }
                                label={
                                  c.status === "active" ? "Disable" : "Enable"
                                }
                                onClick={() => onToggle(c)}
                              />
                            )}
                            {canDelete && (
                              <ActionBtn
                                icon={Trash2}
                                label="Delete"
                                onClick={() => confirmDelete(c)}
                                danger
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Heads Table */}
          {tab === "heads" && (
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle small mb-0">
                <thead>
                  <tr
                    className="text-secondary"
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    <th>#</th>
                    <th>Category</th>
                    <th>Head Name</th>
                    <th>Description</th>
                    <th>Sub-Heads</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHeads.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center text-secondary py-4"
                      >
                        No heads found
                      </td>
                    </tr>
                  ) : (
                    filteredHeads.map((h, i) => (
                      <tr key={h.id}>
                        <td className="text-secondary">{i + 1}</td>
                        <td>
                          <span className="badge bg-info-subtle text-info border border-info-subtle">
                            {h.category_name}
                          </span>
                        </td>
                        <td className="fw-medium">{h.head_name}</td>
                        <td className="text-secondary">
                          {h.description || "—"}
                        </td>
                        <td>
                          <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                            {h.sub_head_count}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={h.status} />
                        </td>
                        <td>
                          <div className="d-flex gap-1 flex-wrap">
                            {canUpdate && (
                              <ActionBtn
                                icon={Pencil}
                                label="Edit"
                                onClick={() => openEdit(h)}
                                variant="primary"
                              />
                            )}
                            {canUpdate && (
                              <ActionBtn
                                icon={
                                  h.status === "active" ? XCircle : CheckCircle
                                }
                                label={
                                  h.status === "active" ? "Disable" : "Enable"
                                }
                                onClick={() => onToggle(h)}
                              />
                            )}
                            {canDelete && (
                              <ActionBtn
                                icon={Trash2}
                                label="Delete"
                                onClick={() => confirmDelete(h)}
                                danger
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub-Heads Table */}
          {tab === "subheads" && (
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle small mb-0">
                <thead>
                  <tr
                    className="text-secondary"
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    <th>#</th>
                    <th>Category</th>
                    <th>Head</th>
                    <th>Sub-Head Name</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubheads.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center text-secondary py-4"
                      >
                        No sub-heads found
                      </td>
                    </tr>
                  ) : (
                    filteredSubheads.map((s, i) => (
                      <tr key={s.id}>
                        <td className="text-secondary">{i + 1}</td>
                        <td>
                          <span className="badge bg-info-subtle text-info border border-info-subtle">
                            {s.category_name}
                          </span>
                        </td>
                        <td>
                          <span className="badge bg-warning-subtle text-warning border border-warning-subtle">
                            {s.head_name}
                          </span>
                        </td>
                        <td className="fw-medium">{s.sub_head_name}</td>
                        <td className="text-secondary">
                          {s.description || "—"}
                        </td>
                        <td>
                          <StatusBadge status={s.status} />
                        </td>
                        <td>
                          <div className="d-flex gap-1 flex-wrap">
                            {canUpdate && (
                              <ActionBtn
                                icon={Pencil}
                                label="Edit"
                                onClick={() => openEdit(s)}
                                variant="primary"
                              />
                            )}
                            {canUpdate && (
                              <ActionBtn
                                icon={
                                  s.status === "active" ? XCircle : CheckCircle
                                }
                                label={
                                  s.status === "active" ? "Disable" : "Enable"
                                }
                                onClick={() => onToggle(s)}
                              />
                            )}
                            {canDelete && (
                              <ActionBtn
                                icon={Trash2}
                                label="Delete"
                                onClick={() => confirmDelete(s)}
                                danger
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <EditModal
        show={modal.show}
        mode={modal.mode}
        tab={tab}
        vals={modal.vals}
        onChange={onChange}
        onSave={onSave}
        onClose={() => setModal((m) => ({ ...m, show: false }))}
        onSwitchTab={(t) => {
          setTab(t);
          setSearch("");
        }}
        categories={categories}
        allHeads={heads}
        saving={modal.saving}
        error={modal.error}
      />
      <ConfirmModal
        show={confirm.show}
        message={confirm.message}
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm({ show: false })}
      />
    </div>
  );
}
