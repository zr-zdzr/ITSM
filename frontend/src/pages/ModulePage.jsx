import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  FileUp,
  FileDown,
  Trash2,
  Pencil,
  Eye,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  QrCode,
  Layers,
} from "lucide-react";
import { motion } from "framer-motion";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import DataTable from "../components/ui/DataTable";
import Modal from "../components/ui/Modal";
import DynamicForm from "../components/ui/DynamicForm";
import Badge from "../components/ui/Badge";
import QRModal from "../components/ui/QRModal";

const EMPTY = {};

export default function ModulePage({ config }) {
  const {
    apiPath,
    module: mod,
    columns,
    fields = [],
    title,
    exportFile,
    sampleFile,
    searchPlaceholder,
    viewExtra,
    qrData,
  } = config;
  const { canPerm } = useAuth();
  const { toast } = useToast();

  const canCreate = canPerm(mod, "create");
  const canUpdate = canPerm(mod, "update");
  const canDelete = canPerm(mod, "delete");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [viewRow, setViewRow] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [qrRow, setQrRow] = useState(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false);
  const [bulkEditModal, setBulkEditModal] = useState(false);
  const [bulkVals, setBulkVals] = useState({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formVals, setFormVals] = useState(EMPTY);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [importModal, setImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef();

  const load = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      setRows(await api.get(apiPath));
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [apiPath, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExport = useCallback(() => {
    api
      .download(`${apiPath}/export/csv`, exportFile || `${mod}-export.csv`)
      .catch((e) => toast(e.message, "error"));
  }, [apiPath, exportFile, mod, toast]);

  useEffect(() => {
    function handler(e) {
      const { action } = e.detail || {};
      if (action === "add" && canCreate) {
        setFormVals(EMPTY);
        setAddModal(true);
      } else if (action === "import" && canCreate) {
        setImportResult(null);
        setImportFile(null);
        setImportModal(true);
      } else if (action === "export") {
        handleExport();
      } else if (action === "delete-all" && canDelete) {
        setConfirmDeleteAll(true);
      } else if (action === "refresh") {
        load();
      }
    }
    window.addEventListener("module-action", handler);
    return () => window.removeEventListener("module-action", handler);
  }, [canCreate, canDelete, load, handleExport]);

  function openAdd() {
    setFormVals(EMPTY);
    setAddModal(true);
  }
  function openEdit(row) {
    setFormVals({ ...row });
    setEditRow(row);
  }
  function closeModals() {
    setAddModal(false);
    setEditRow(null);
    setViewRow(null);
    setFormVals(EMPTY);
  }

  async function save() {
    if (config.validate) {
      const err = config.validate(formVals);
      if (err) return toast(err, "error");
    } else {
      const missing = fields
        .filter((f) => f.required)
        .find((f) => !formVals[f.name]);
      if (missing) return toast(`${missing.label} is required`, "error");
    }
    setSaving(true);
    try {
      if (editRow) {
        await api.put(`${apiPath}/${editRow.id}`, formVals);
        toast(`${title} updated`, "success");
      } else {
        await api.post(apiPath, formVals);
        toast(`${title} added`, "success");
      }
      closeModals();
      await load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(row) {
    try {
      await api.del(`${apiPath}/${row.id}`);
      toast("Deleted", "success");
      setConfirmDelete(null);
      setRows((p) => p.filter((r) => r.id !== row.id));
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function deleteSelected() {
    try {
      await Promise.all(
        [...selectedIds].map((id) => api.del(`${apiPath}/${id}`)),
      );
      toast(
        `${selectedIds.size} record${selectedIds.size > 1 ? "s" : ""} deleted`,
        "success",
      );
      setConfirmDeleteSelected(false);
      await load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function deleteAll() {
    try {
      await api.del(`${apiPath}/all`);
      toast("All records deleted", "success");
      setConfirmDeleteAll(false);
      setRows([]);
      setSelectedIds(new Set());
    } catch (e) {
      toast(e.message, "error");
    }
  }

  const TABLE_MAP = {
    systems: "systems",
    network: "network_devices",
    mobiles: "mobiles",
    sims: "sims",
    gws: "gws_accounts",
    employees: "employees",
    vendors: "vendors",
  };

  async function saveBulk() {
    const updates = {};
    for (const [k, v] of Object.entries(bulkVals)) {
      if (v) updates[k] = v;
    }
    if (Object.keys(updates).length === 0)
      return toast("Select at least one field to update", "error");
    setBulkSaving(true);
    try {
      await api.patch("/api/bulk", {
        table: TABLE_MAP[mod] || mod,
        ids: [...selectedIds],
        updates,
      });
      toast(
        `${selectedIds.size} record${selectedIds.size > 1 ? "s" : ""} updated`,
        "success",
      );
      setBulkEditModal(false);
      setBulkVals({});
      await load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBulkSaving(false);
    }
  }

  function downloadSample() {
    api
      .download(`${apiPath}/sample/csv`, sampleFile || `${mod}-sample.csv`)
      .catch((e) => toast(e.message, "error"));
  }

  async function submitImport() {
    if (!importFile) return toast("Please select a CSV file", "error");
    setImporting(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append("file", importFile);
    try {
      const res = await api.post(`${apiPath}/import/csv`, fd);
      setImportResult(res);
      toast(`Imported ${res?.inserted ?? 0} records`, "success");
      await load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setImporting(false);
    }
  }

  function closeImport() {
    setImportModal(false);
    setImportFile(null);
    setImportResult(null);
  }

  const allColumns = [
    ...columns,
    {
      key: "_actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="d-flex align-items-center gap-1">
          <button
            onClick={() => setViewRow(row)}
            title="View"
            className="btn btn-link text-secondary p-1"
            style={{ lineHeight: 1 }}
          >
            <Eye size={13} />
          </button>
          {qrData && (
            <button
              onClick={() => setQrRow(row)}
              title="QR Code"
              className="btn btn-link text-secondary p-1"
              style={{ lineHeight: 1 }}
            >
              <QrCode size={13} />
            </button>
          )}
          {canUpdate && (
            <button
              onClick={() => openEdit(row)}
              title="Edit"
              className="btn btn-link text-secondary p-1"
              style={{ lineHeight: 1 }}
            >
              <Pencil size={13} />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setConfirmDelete(row)}
              title="Delete"
              className="btn btn-link text-danger p-1"
              style={{ lineHeight: 1, opacity: 0.6 }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="d-flex flex-column gap-3"
    >
      {/* Toolbar */}
      <div className="d-flex flex-wrap align-items-center gap-2">
        <span className="flex-grow-1 small text-secondary">
          {loading ? "Loading…" : `${rows.length} records`}
          {selectedIds.size > 0 && (
            <span className="ms-2 fw-medium" style={{ color: "var(--brand)" }}>
              · {selectedIds.size} selected
            </span>
          )}
        </span>

        {canUpdate && selectedIds.size > 0 && (
          <button
            className="toolbar-btn toolbar-btn-secondary"
            onClick={() => {
              setBulkVals({});
              setBulkEditModal(true);
            }}
          >
            <Layers size={12} /> Bulk Edit {selectedIds.size}
          </button>
        )}
        {canDelete && selectedIds.size > 0 && (
          <button
            className="toolbar-btn toolbar-btn-danger"
            onClick={() => setConfirmDeleteSelected(true)}
          >
            <Trash2 size={12} /> Delete {selectedIds.size} Selected
          </button>
        )}
        {canDelete && selectedIds.size === 0 && (
          <button
            className="toolbar-btn toolbar-btn-danger"
            onClick={() => setConfirmDeleteAll(true)}
          >
            <Trash2 size={12} /> Delete All
          </button>
        )}
        {canCreate && (
          <button
            className="toolbar-btn toolbar-btn-secondary"
            onClick={() => {
              setImportResult(null);
              setImportFile(null);
              setImportModal(true);
            }}
          >
            <FileUp size={12} /> Import CSV
          </button>
        )}
        <button
          className="toolbar-btn toolbar-btn-secondary"
          onClick={handleExport}
        >
          <FileDown size={12} /> Export CSV
        </button>
        {canCreate && (
          <button
            className="btn btn-primary btn-sm d-flex align-items-center gap-1"
            style={{ fontSize: "0.72rem", padding: "4px 10px" }}
            onClick={openAdd}
          >
            <Plus size={12} /> Add {title}
          </button>
        )}
      </div>

      <DataTable
        columns={allColumns}
        data={rows}
        loading={loading}
        searchPlaceholder={
          searchPlaceholder || `Search ${title.toLowerCase()}…`
        }
        selectable={canDelete}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />

      {/* Add / Edit Modal */}
      <Modal
        open={addModal || !!editRow}
        onClose={closeModals}
        title={editRow ? `Edit ${title}` : `Add ${title}`}
        size="lg"
      >
        {config.renderForm ? (
          config.renderForm(formVals, setFormVals)
        ) : (
          <DynamicForm
            fields={fields}
            values={formVals}
            onChange={(k, v) => setFormVals((p) => ({ ...p, [k]: v }))}
          />
        )}
        <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
          <button className="btn btn-secondary btn-sm" onClick={closeModals}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : editRow ? "Save Changes" : `Add ${title}`}
          </button>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal
        open={!!viewRow}
        onClose={() => setViewRow(null)}
        title={`${title} Details`}
        size="md"
      >
        {viewRow && (
          <>
            {config.renderView ? (
              config.renderView(viewRow)
            ) : (
              <dl className="row g-3">
                {fields.map((f) => (
                  <div
                    key={f.name}
                    className={f.fullWidth ? "col-12" : "col-6"}
                  >
                    <dt
                      className="text-secondary fw-semibold text-uppercase mb-1"
                      style={{ fontSize: "11px", letterSpacing: "0.05em" }}
                    >
                      {f.label}
                    </dt>
                    <dd className="small mb-0">
                      {f.name === "status" ? (
                        <Badge status={viewRow[f.name]}>
                          {viewRow[f.name] || "—"}
                        </Badge>
                      ) : (
                        viewRow[f.name] || (
                          <span className="text-secondary">—</span>
                        )
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {viewExtra && (
              <div className="mt-4 pt-3 border-top">{viewExtra(viewRow)}</div>
            )}
          </>
        )}
        <div className="d-flex justify-content-between gap-2 mt-4 pt-3 border-top">
          <div>
            {qrData && (
              <button
                className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
                onClick={() => {
                  setQrRow(viewRow);
                  setViewRow(null);
                }}
              >
                <QrCode size={13} /> QR Code
              </button>
            )}
          </div>
          <div className="d-flex gap-2">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setViewRow(null)}
            >
              Close
            </button>
            {canUpdate && (
              <button
                className="btn btn-primary btn-sm d-flex align-items-center gap-1"
                onClick={() => {
                  openEdit(viewRow);
                  setViewRow(null);
                }}
              >
                <Pencil size={13} /> Edit
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Import CSV Modal */}
      <Modal
        open={importModal}
        onClose={closeImport}
        title={`Import ${title} CSV`}
        size="md"
      >
        <div className="d-flex flex-column gap-3">
          <div
            className="p-3 rounded-3"
            style={{
              background: "var(--surface-subtle)",
              border: "1px solid var(--bs-border-color)",
            }}
          >
            <p className="small fw-semibold mb-1">
              Step 1 — Download the sample template
            </p>
            <p className="small text-secondary mb-2">
              Fill in the sample file with your data. Columns marked{" "}
              <span className="text-danger">*</span> are mandatory — rows with
              missing mandatory fields will be skipped.
            </p>
            <button
              className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
              onClick={downloadSample}
            >
              <FileDown size={13} /> Download Sample CSV
            </button>
          </div>

          <div
            className="p-3 rounded-3"
            style={{
              background: "var(--surface-subtle)",
              border: "1px solid var(--bs-border-color)",
            }}
          >
            <p className="small fw-semibold mb-1">
              Step 2 — Upload your filled CSV
            </p>
            <p className="small text-secondary mb-2">
              Only .csv files are accepted.
            </p>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="d-flex flex-column align-items-center justify-content-center gap-2 p-4 rounded-3 cursor-pointer"
              style={{
                border: "2px dashed var(--bs-border-color)",
                cursor: "pointer",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = "var(--brand)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = "var(--bs-border-color)")
              }
            >
              <FileUp size={22} className="text-secondary" />
              {importFile ? (
                <p
                  className="small fw-medium mb-0"
                  style={{ color: "var(--brand)" }}
                >
                  {importFile.name}
                </p>
              ) : (
                <p className="small text-secondary mb-0">
                  Click to browse or drop a CSV file
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="d-none"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] || null);
                  setImportResult(null);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {importResult && (
            <div
              className="p-3 rounded-3"
              style={{
                background: "var(--surface-subtle)",
                border: "1px solid var(--bs-border-color)",
              }}
            >
              {(importResult.inserted ?? 0) > 0 && (
                <div className="d-flex align-items-center gap-2 text-success small fw-medium mb-2">
                  <CheckCircle2 size={15} />
                  {importResult.inserted} record
                  {importResult.inserted !== 1 ? "s" : ""} imported successfully
                  {(importResult.updated ?? 0) > 0 && (
                    <>, {importResult.updated} updated</>
                  )}
                </div>
              )}
              {(importResult.skipped ?? 0) > 0 && (
                <div
                  className="d-flex align-items-center gap-2 small fw-medium mb-2"
                  style={{ color: "#f59e0b" }}
                >
                  <AlertTriangle size={15} />
                  {importResult.skipped} row
                  {importResult.skipped !== 1 ? "s" : ""} skipped — mandatory
                  fields missing
                </div>
              )}
              {(importResult.inserted ?? 0) === 0 &&
                (importResult.skipped ?? 0) === 0 && (
                  <div className="d-flex align-items-center gap-2 text-secondary small fw-medium mb-2">
                    <AlertTriangle size={15} /> No records processed
                  </div>
                )}
              {importResult.errors?.length > 0 && (
                <div className="d-flex flex-column gap-1 mt-2">
                  <p className="small text-secondary mb-1 fw-semibold">
                    Validation errors:
                  </p>
                  {importResult.errors.slice(0, 8).map((e, i) => (
                    <p
                      key={i}
                      className="d-flex align-items-start gap-1 small text-danger mb-0"
                    >
                      <XCircle size={12} className="flex-shrink-0 mt-1" /> {e}
                    </p>
                  ))}
                  {importResult.errors.length > 8 && (
                    <p className="small text-secondary mb-0">
                      …and {importResult.errors.length - 8} more errors
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
          <button className="btn btn-secondary btn-sm" onClick={closeImport}>
            Close
          </button>
          {!importResult && (
            <button
              className="btn btn-primary btn-sm"
              onClick={submitImport}
              disabled={importing || !importFile}
            >
              {importing ? "Uploading…" : "Upload & Import"}
            </button>
          )}
          {importResult && (
            <button className="btn btn-primary btn-sm" onClick={closeImport}>
              Done
            </button>
          )}
        </div>
      </Modal>

      {/* Delete single confirm */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Confirm Delete"
        size="sm"
      >
        <div className="d-flex gap-3">
          <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-1" />
          <p className="small mb-0">
            This record will be permanently deleted. Are you sure?
          </p>
        </div>
        <div className="d-flex justify-content-end gap-2 mt-4">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setConfirmDelete(null)}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => deleteRow(confirmDelete)}
          >
            Delete
          </button>
        </div>
      </Modal>

      {/* Delete Selected confirm */}
      <Modal
        open={confirmDeleteSelected}
        onClose={() => setConfirmDeleteSelected(false)}
        title="Delete Selected"
        size="sm"
      >
        <div className="d-flex gap-3">
          <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-1" />
          <p className="small mb-0">
            <strong className="text-danger">
              {selectedIds.size} record{selectedIds.size > 1 ? "s" : ""}
            </strong>{" "}
            will be permanently deleted. This cannot be undone.
          </p>
        </div>
        <div className="d-flex justify-content-end gap-2 mt-4">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setConfirmDeleteSelected(false)}
          >
            Cancel
          </button>
          <button className="btn btn-danger btn-sm" onClick={deleteSelected}>
            Delete {selectedIds.size} Record{selectedIds.size > 1 ? "s" : ""}
          </button>
        </div>
      </Modal>

      {/* Bulk Edit Modal */}
      <Modal
        open={bulkEditModal}
        onClose={() => setBulkEditModal(false)}
        title={`Bulk Edit ${selectedIds.size} Records`}
        size="sm"
      >
        <p className="small text-secondary mb-3">
          Only filled fields will be updated. Leave blank to keep existing
          values.
        </p>
        <div className="d-flex flex-column gap-3">
          {fields
            .filter((f) =>
              [
                "status",
                "condition",
                "department",
                "location",
                "notes",
              ].includes(f.name),
            )
            .map((f) => (
              <div key={f.name}>
                <label className="form-label small fw-semibold mb-1">
                  {f.label}
                </label>
                {f.type === "select" ? (
                  <select
                    value={bulkVals[f.name] || ""}
                    onChange={(e) =>
                      setBulkVals((p) => ({ ...p, [f.name]: e.target.value }))
                    }
                    className="form-select form-select-sm"
                  >
                    <option value="">— keep existing —</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    rows={2}
                    placeholder="Leave blank to keep existing"
                    value={bulkVals[f.name] || ""}
                    onChange={(e) =>
                      setBulkVals((p) => ({ ...p, [f.name]: e.target.value }))
                    }
                    className="form-control form-control-sm"
                    style={{ resize: "none" }}
                  />
                ) : (
                  <input
                    type="text"
                    placeholder="Leave blank to keep existing"
                    value={bulkVals[f.name] || ""}
                    onChange={(e) =>
                      setBulkVals((p) => ({ ...p, [f.name]: e.target.value }))
                    }
                    className="form-control form-control-sm"
                  />
                )}
              </div>
            ))}
        </div>
        <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setBulkEditModal(false)}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={saveBulk}
            disabled={bulkSaving}
          >
            {bulkSaving ? "Saving…" : `Update ${selectedIds.size} Records`}
          </button>
        </div>
      </Modal>

      {/* QR Modal */}
      {qrData && qrRow && (
        <QRModal
          open={!!qrRow}
          onClose={() => setQrRow(null)}
          {...qrData(qrRow)}
        />
      )}

      {/* Delete All confirm */}
      <Modal
        open={confirmDeleteAll}
        onClose={() => setConfirmDeleteAll(false)}
        title="Delete All Records"
        size="sm"
      >
        <div className="d-flex gap-3">
          <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-1" />
          <p className="small mb-0">
            All <strong className="text-danger">{rows.length} records</strong>{" "}
            will be permanently deleted. This <strong>cannot be undone</strong>.
          </p>
        </div>
        <div className="d-flex justify-content-end gap-2 mt-4">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setConfirmDeleteAll(false)}
          >
            Cancel
          </button>
          <button className="btn btn-danger btn-sm" onClick={deleteAll}>
            Delete All {rows.length} Records
          </button>
        </div>
      </Modal>
    </motion.div>
  );
}
