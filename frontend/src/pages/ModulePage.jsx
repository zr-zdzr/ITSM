import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, FileUp, FileDown, Trash2, Pencil, Eye, AlertTriangle, CheckCircle2, XCircle, QrCode, Layers } from 'lucide-react'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import DataTable from '../components/ui/DataTable'
import Modal from '../components/ui/Modal'
import DynamicForm from '../components/ui/DynamicForm'
import Badge from '../components/ui/Badge'
import QRModal from '../components/ui/QRModal'

const EMPTY = {}

export default function ModulePage({ config }) {
  const { apiPath, module: mod, columns, fields, title, exportFile, searchPlaceholder, viewExtra, qrData } = config
  const { canPerm } = useAuth()
  const { toast } = useToast()

  const canCreate = canPerm(mod, 'create')
  const canUpdate = canPerm(mod, 'update')
  const canDelete = canPerm(mod, 'delete')

  const [rows, setRows]                     = useState([])
  const [loading, setLoading]               = useState(true)
  const [addModal, setAddModal]             = useState(false)
  const [editRow, setEditRow]               = useState(null)
  const [viewRow, setViewRow]               = useState(null)
  const [confirmDelete, setConfirmDelete]   = useState(null)
  const [qrRow, setQrRow]                           = useState(null)
  const [confirmDeleteAll, setConfirmDeleteAll]         = useState(false)
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false)
  const [bulkEditModal, setBulkEditModal]   = useState(false)
  const [bulkVals, setBulkVals]             = useState({})
  const [bulkSaving, setBulkSaving]         = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [formVals, setFormVals]             = useState(EMPTY)
  const [selectedIds, setSelectedIds]       = useState(new Set())

  // Import modal state
  const [importModal, setImportModal]   = useState(false)
  const [importFile, setImportFile]     = useState(null)
  const [importing, setImporting]       = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef()

  const load = useCallback(async () => {
    setLoading(true)
    setSelectedIds(new Set())
    try { setRows(await api.get(apiPath)) }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }, [apiPath])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function handler(e) {
      const { action } = e.detail || {}
      if      (action === 'add'        && canCreate) { setFormVals(EMPTY); setAddModal(true) }
      else if (action === 'import'     && canCreate) { setImportResult(null); setImportFile(null); setImportModal(true) }
      else if (action === 'export')                  { handleExport() }
      else if (action === 'delete-all' && canDelete) { setConfirmDeleteAll(true) }
      else if (action === 'refresh')                 { load() }
    }
    window.addEventListener('module-action', handler)
    return () => window.removeEventListener('module-action', handler)
  }, [canCreate, canDelete, load])

  function openAdd()  { setFormVals(EMPTY); setAddModal(true) }
  function openEdit(row) { setFormVals({ ...row }); setEditRow(row) }
  function closeModals() { setAddModal(false); setEditRow(null); setViewRow(null); setFormVals(EMPTY) }

  async function save() {
    const missing = fields.filter(f => f.required).find(f => !formVals[f.name])
    if (missing) return toast(`${missing.label} is required`, 'error')
    setSaving(true)
    try {
      if (editRow) {
        await api.put(`${apiPath}/${editRow.id}`, formVals)
        toast(`${title} updated`, 'success')
      } else {
        await api.post(apiPath, formVals)
        toast(`${title} added`, 'success')
      }
      closeModals(); await load()
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function deleteRow(row) {
    try {
      await api.del(`${apiPath}/${row.id}`)
      toast('Deleted', 'success')
      setConfirmDelete(null)
      setRows(p => p.filter(r => r.id !== row.id))
    } catch (e) { toast(e.message, 'error') }
  }

  async function deleteSelected() {
    try {
      await Promise.all([...selectedIds].map(id => api.del(`${apiPath}/${id}`)))
      toast(`${selectedIds.size} record${selectedIds.size > 1 ? 's' : ''} deleted`, 'success')
      setConfirmDeleteSelected(false)
      await load()
    } catch (e) { toast(e.message, 'error') }
  }

  async function deleteAll() {
    try {
      await api.del(`${apiPath}/all`)
      toast('All records deleted', 'success')
      setConfirmDeleteAll(false)
      setRows([])
      setSelectedIds(new Set())
    } catch (e) { toast(e.message, 'error') }
  }

  const TABLE_MAP = {
    systems: 'systems', network: 'network_devices', mobiles: 'mobiles',
    sims: 'sims', gws: 'gws_accounts', employees: 'employees', vendors: 'vendors',
  }

  async function saveBulk() {
    const updates = {}
    for (const [k, v] of Object.entries(bulkVals)) { if (v) updates[k] = v }
    if (Object.keys(updates).length === 0) return toast('Select at least one field to update', 'error')
    setBulkSaving(true)
    try {
      await api.patch('/api/bulk', { table: TABLE_MAP[mod] || mod, ids: [...selectedIds], updates })
      toast(`${selectedIds.size} record${selectedIds.size > 1 ? 's' : ''} updated`, 'success')
      setBulkEditModal(false)
      setBulkVals({})
      await load()
    } catch (e) { toast(e.message, 'error') }
    finally { setBulkSaving(false) }
  }

  function handleExport() {
    api.download(`${apiPath}/export/csv`, exportFile || `${mod}-export.csv`)
      .catch(e => toast(e.message, 'error'))
  }

  function downloadSample() {
    api.download(`${apiPath}/sample/csv`, `${mod}-sample.csv`)
      .catch(e => toast(e.message, 'error'))
  }

  async function submitImport() {
    if (!importFile) return toast('Please select a CSV file', 'error')
    setImporting(true)
    setImportResult(null)
    const fd = new FormData()
    fd.append('file', importFile)
    try {
      const res = await api.post(`${apiPath}/import/csv`, fd)
      setImportResult(res)
      toast(`Imported ${res?.inserted ?? 0} records`, 'success')
      await load()
    } catch (e) {
      toast(e.message, 'error')
    } finally { setImporting(false) }
  }

  function closeImport() {
    setImportModal(false)
    setImportFile(null)
    setImportResult(null)
  }

  const allColumns = [
    ...columns,
    {
      key: '_actions', label: '', sortable: false, className: 'w-24',
      render: (_, row) => (
        <div className="flex items-center gap-1 justify-end">
          <button onClick={() => setViewRow(row)} title="View"
            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200 transition-colors">
            <Eye size={13} />
          </button>
          {qrData && (
            <button onClick={() => setQrRow(row)} title="QR Code"
              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200 transition-colors">
              <QrCode size={13} />
            </button>
          )}
          {canUpdate && (
            <button onClick={() => openEdit(row)} title="Edit"
              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200 transition-colors">
              <Pencil size={13} />
            </button>
          )}
          {canDelete && (
            <button onClick={() => setConfirmDelete(row)} title="Delete"
              className="p-1.5 rounded hover:bg-red-500/15 text-zinc-500 hover:text-red-400 transition-colors">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-xs text-zinc-500">
          {loading ? 'Loading…' : `${rows.length} records`}
          {selectedIds.size > 0 && (
            <span className="ml-2 text-brand-400 font-medium">· {selectedIds.size} selected</span>
          )}
        </span>

        {canUpdate && selectedIds.size > 0 && (
          <button className="btn-secondary" onClick={() => { setBulkVals({}); setBulkEditModal(true) }}>
            <Layers size={14} /> Bulk Edit {selectedIds.size}
          </button>
        )}
        {canDelete && selectedIds.size > 0 && (
          <button className="btn-danger" onClick={() => setConfirmDeleteSelected(true)}>
            <Trash2 size={14} /> Delete {selectedIds.size} Selected
          </button>
        )}
        {canDelete && selectedIds.size === 0 && (
          <button className="btn-danger" onClick={() => setConfirmDeleteAll(true)}>
            <Trash2 size={14} /> Delete All
          </button>
        )}
        {canCreate && (
          <button className="btn-secondary" onClick={() => { setImportResult(null); setImportFile(null); setImportModal(true) }}>
            <FileUp size={14} /> Import CSV
          </button>
        )}
        <button className="btn-secondary" onClick={handleExport}>
          <FileDown size={14} /> Export CSV
        </button>
        {canCreate && (
          <button className="btn-primary" onClick={openAdd}>
            <Plus size={14} /> Add {title}
          </button>
        )}
      </div>

      <DataTable
        columns={allColumns} data={rows} loading={loading}
        searchPlaceholder={searchPlaceholder || `Search ${title.toLowerCase()}…`}
        selectable={canDelete}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />

      {/* ── Add / Edit Modal ── */}
      <Modal open={addModal || !!editRow} onClose={closeModals}
        title={editRow ? `Edit ${title}` : `Add ${title}`} size="lg">
        <DynamicForm fields={fields} values={formVals}
          onChange={(k, v) => setFormVals(p => ({ ...p, [k]: v }))} />
        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-zinc-800">
          <button className="btn-secondary" onClick={closeModals}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editRow ? 'Save Changes' : `Add ${title}`}
          </button>
        </div>
      </Modal>

      {/* ── View Modal ── */}
      <Modal open={!!viewRow} onClose={() => setViewRow(null)} title={`${title} Details`} size="md">
        {viewRow && (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              {fields.map(f => (
                <div key={f.name} className={f.fullWidth ? 'col-span-2' : ''}>
                  <dt className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider">{f.label}</dt>
                  <dd className="text-sm text-zinc-200 mt-1">
                    {f.name === 'status'
                      ? <Badge status={viewRow[f.name]}>{viewRow[f.name] || '—'}</Badge>
                      : viewRow[f.name] || <span className="text-zinc-600">—</span>}
                  </dd>
                </div>
              ))}
            </dl>
            {viewExtra && (
              <div className="mt-5 pt-4 border-t border-zinc-800">
                {viewExtra(viewRow)}
              </div>
            )}
          </>
        )}
        <div className="flex justify-between gap-2 mt-5 pt-4 border-t border-zinc-800">
          <div>
            {qrData && (
              <button className="btn-secondary" onClick={() => { setQrRow(viewRow); setViewRow(null) }}>
                <QrCode size={13} /> QR Code
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setViewRow(null)}>Close</button>
            {canUpdate && (
              <button className="btn-primary" onClick={() => { openEdit(viewRow); setViewRow(null) }}>
                <Pencil size={13} /> Edit
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Import CSV Modal ── */}
      <Modal open={importModal} onClose={closeImport} title={`Import ${title} CSV`} size="md">
        <div className="space-y-5">
          <div className="p-4 rounded-lg bg-zinc-800/60 border border-zinc-700">
            <p className="text-xs font-semibold text-zinc-300 mb-1">Step 1 — Download the sample template</p>
            <p className="text-xs text-zinc-500 mb-3">Fill in the sample file with your data, then upload it below.</p>
            <button className="btn-secondary text-xs" onClick={downloadSample}>
              <FileDown size={13} /> Download Sample CSV
            </button>
          </div>

          <div className="p-4 rounded-lg bg-zinc-800/60 border border-zinc-700">
            <p className="text-xs font-semibold text-zinc-300 mb-1">Step 2 — Upload your filled CSV</p>
            <p className="text-xs text-zinc-500 mb-3">Only .csv files are accepted.</p>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-zinc-700 hover:border-brand-500/50 rounded-lg cursor-pointer transition-colors group"
            >
              <FileUp size={22} className="text-zinc-600 group-hover:text-brand-400 transition-colors" />
              {importFile
                ? <p className="text-sm font-medium text-brand-400">{importFile.name}</p>
                : <p className="text-sm text-zinc-500">Click to browse or drop a CSV file</p>
              }
              <input
                ref={fileInputRef} type="file" accept=".csv" className="hidden"
                onChange={e => { setImportFile(e.target.files?.[0] || null); setImportResult(null); e.target.value = '' }}
              />
            </div>
          </div>

          {importResult && (
            <div className="p-4 rounded-lg bg-zinc-800/60 border border-zinc-700 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                <CheckCircle2 size={15} />
                Inserted: {importResult.inserted ?? 0} &nbsp;·&nbsp; Skipped: {importResult.skipped ?? 0}
              </div>
              {importResult.errors?.length > 0 && (
                <div className="space-y-1">
                  {importResult.errors.slice(0, 5).map((e, i) => (
                    <p key={i} className="flex items-start gap-1.5 text-xs text-red-400">
                      <XCircle size={12} className="flex-shrink-0 mt-0.5" /> {e}
                    </p>
                  ))}
                  {importResult.errors.length > 5 && (
                    <p className="text-xs text-zinc-500">…and {importResult.errors.length - 5} more errors</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-zinc-800">
          <button className="btn-secondary" onClick={closeImport}>Close</button>
          {!importResult && (
            <button className="btn-primary" onClick={submitImport} disabled={importing || !importFile}>
              {importing ? 'Uploading…' : 'Upload & Import'}
            </button>
          )}
          {importResult && (
            <button className="btn-primary" onClick={closeImport}>Done</button>
          )}
        </div>
      </Modal>

      {/* ── Delete single confirm ── */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Confirm Delete" size="sm">
        <div className="flex gap-3">
          <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-300">This record will be permanently deleted. Are you sure?</p>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
          <button className="btn-base bg-red-500 hover:bg-red-600 text-white" onClick={() => deleteRow(confirmDelete)}>Delete</button>
        </div>
      </Modal>

      {/* ── Delete Selected confirm ── */}
      <Modal open={confirmDeleteSelected} onClose={() => setConfirmDeleteSelected(false)} title="Delete Selected" size="sm">
        <div className="flex gap-3">
          <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-300">
            <strong className="text-red-400">{selectedIds.size} record{selectedIds.size > 1 ? 's' : ''}</strong> will be permanently deleted. This cannot be undone.
          </p>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary" onClick={() => setConfirmDeleteSelected(false)}>Cancel</button>
          <button className="btn-base bg-red-500 hover:bg-red-600 text-white" onClick={deleteSelected}>
            Delete {selectedIds.size} Record{selectedIds.size > 1 ? 's' : ''}
          </button>
        </div>
      </Modal>

      {/* ── Bulk Edit Modal ── */}
      <Modal open={bulkEditModal} onClose={() => setBulkEditModal(false)} title={`Bulk Edit ${selectedIds.size} Records`} size="sm">
        <p className="text-xs text-zinc-500 mb-4">Only filled fields will be updated. Leave blank to keep existing values.</p>
        <div className="space-y-3">
          {fields.filter(f => ['status','condition','department','location','notes'].includes(f.name)).map(f => (
            <div key={f.name}>
              <label className="block text-xs font-semibold text-zinc-400 mb-1">{f.label}</label>
              {f.type === 'select' ? (
                <select
                  value={bulkVals[f.name] || ''}
                  onChange={e => setBulkVals(p => ({ ...p, [f.name]: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-brand-500"
                >
                  <option value="">— keep existing —</option>
                  {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea
                  rows={2}
                  placeholder="Leave blank to keep existing"
                  value={bulkVals[f.name] || ''}
                  onChange={e => setBulkVals(p => ({ ...p, [f.name]: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500 resize-none"
                />
              ) : (
                <input
                  type="text"
                  placeholder="Leave blank to keep existing"
                  value={bulkVals[f.name] || ''}
                  onChange={e => setBulkVals(p => ({ ...p, [f.name]: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500"
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-zinc-800">
          <button className="btn-secondary" onClick={() => setBulkEditModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={saveBulk} disabled={bulkSaving}>
            {bulkSaving ? 'Saving…' : `Update ${selectedIds.size} Records`}
          </button>
        </div>
      </Modal>

      {/* ── QR Modal ── */}
      {qrData && qrRow && (
        <QRModal open={!!qrRow} onClose={() => setQrRow(null)} {...qrData(qrRow)} />
      )}

      {/* ── Delete All confirm ── */}
      <Modal open={confirmDeleteAll} onClose={() => setConfirmDeleteAll(false)} title="Delete All Records" size="sm">
        <div className="flex gap-3">
          <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-300">
            All <strong className="text-red-400">{rows.length} records</strong> will be permanently deleted.
            This <strong className="text-zinc-200">cannot be undone</strong>.
          </p>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary" onClick={() => setConfirmDeleteAll(false)}>Cancel</button>
          <button className="btn-base bg-red-500 hover:bg-red-600 text-white" onClick={deleteAll}>
            Delete All {rows.length} Records
          </button>
        </div>
      </Modal>
    </motion.div>
  )
}
