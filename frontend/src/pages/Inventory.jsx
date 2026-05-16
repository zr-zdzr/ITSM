import React, { useEffect, useState, useCallback } from 'react'
import { Package, AlertTriangle, XCircle, TrendingDown, Plus, RefreshCw, ChevronDown, Pencil, History, ArrowUpCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/ui/Modal'
import { cn } from '../lib/utils'

const TRACKING_LABELS = { quantity: 'Consumable', quantity_returnable: 'Returnable' }
const STOCK_BADGE = {
  in_stock:     'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  low_stock:    'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  out_of_stock: 'bg-red-500/15 text-red-500',
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-center gap-4">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
    </div>
  )
}

export default function Inventory() {
  const { canPerm } = useAuth()
  const { toast } = useToast()
  const canCreate = canPerm('inventory', 'create')
  const canEdit   = canPerm('inventory', 'update')

  const [stats, setStats]         = useState({})
  const [items, setItems]         = useState([])
  const [alerts, setAlerts]       = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading]     = useState(true)
  const [catFilter, setCatFilter] = useState('')
  const [search, setSearch]       = useState('')

  // Modals
  const [itemModal, setItemModal]       = useState(false)
  const [editItem, setEditItem]         = useState(null)
  const [stockModal, setStockModal]     = useState(null) // item row
  const [historyModal, setHistoryModal] = useState(null) // item row
  const [catModal, setCatModal]         = useState(false)
  const [history, setHistory]           = useState([])
  const [saving, setSaving]             = useState(false)

  const [itemForm, setItemForm] = useState({})
  const [stockForm, setStockForm] = useState({ type: 'purchase', qty_change: '', notes: '' })
  const [catForm, setCatForm]   = useState({ name: '', description: '', parent_id: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, i, a, c] = await Promise.all([
        api.get('/api/inventory/stats'),
        api.get('/api/inventory/items'),
        api.get('/api/inventory/alerts'),
        api.get('/api/inventory/categories'),
      ])
      setStats(s); setItems(i); setAlerts(a); setCategories(c)
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    const matchQ = !q || i.name.toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q)
    const matchC = !catFilter || String(i.category_id) === catFilter
    return matchQ && matchC
  })

  async function saveItem() {
    setSaving(true)
    try {
      if (editItem) {
        await api.put(`/api/inventory/items/${editItem.id}`, itemForm)
        toast('Item updated', 'success')
      } else {
        await api.post('/api/inventory/items', itemForm)
        toast('Item created', 'success')
      }
      setItemModal(false); setEditItem(null); setItemForm({})
      load()
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function saveStock() {
    setSaving(true)
    try {
      await api.post(`/api/inventory/items/${stockModal.id}/adjust`, stockForm)
      toast('Stock updated', 'success')
      setStockModal(null); setStockForm({ type: 'purchase', qty_change: '', notes: '' })
      load()
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function saveCat() {
    setSaving(true)
    try {
      await api.post('/api/inventory/categories', catForm)
      toast('Category created', 'success')
      setCatModal(false); setCatForm({ name: '', description: '', parent_id: '' })
      load()
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function loadHistory(item) {
    try {
      const h = await api.get(`/api/inventory/items/${item.id}/history`)
      setHistory(h); setHistoryModal(item)
    } catch (e) { toast(e.message, 'error') }
  }

  function openEdit(item) {
    setEditItem(item)
    setItemForm({
      name: item.name, category_id: item.category_id || '', description: item.description || '',
      model: item.model || '', manufacturer: item.manufacturer || '', sku: item.sku || '',
      tracking_type: item.tracking_type, unit: item.unit,
      reorder_level: item.reorder_level, reorder_qty: item.reorder_qty,
    })
    setItemModal(true)
  }

  const fi = (k, v) => setItemForm(f => ({ ...f, [k]: v }))
  const fs = (k, v) => setStockForm(f => ({ ...f, [k]: v }))

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Inventory Stock</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Consumables & returnable items with stock levels</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <RefreshCw size={15} />
          </button>
          {canCreate && (
            <>
              <button onClick={() => setCatModal(true)}
                className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                + Category
              </button>
              <button onClick={() => { setEditItem(null); setItemForm({ tracking_type: 'quantity', unit: 'pcs' }); setItemModal(true) }}
                className="px-3 py-2 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium flex items-center gap-1.5 transition-colors">
                <Plus size={14} /> Add Item
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Package}       label="Total Items"    value={stats.total_items || 0}     color="bg-brand-500" />
        <StatCard icon={TrendingDown}  label="Available"      value={stats.total_available || 0} color="bg-emerald-500" />
        <StatCard icon={AlertTriangle} label="Low Stock"      value={stats.low_stock || 0}       color="bg-amber-500" />
        <StatCard icon={XCircle}       label="Out of Stock"   value={stats.out_of_stock || 0}    color="bg-red-500" />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-2">
            <AlertTriangle size={15} /> Stock Alerts ({alerts.length})
          </p>
          <div className="space-y-1.5">
            {alerts.map(a => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">{a.item_name}
                  {a.category_name && <span className="text-zinc-400 ml-1">· {a.category_name}</span>}
                </span>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                  a.alert_type === 'out_of_stock' ? 'bg-red-500/15 text-red-500' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400')}>
                  {a.alert_type === 'out_of_stock' ? 'Out of Stock' : `Low: ${a.current_value} left`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search items…"
          className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 w-56"
        />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {(search || catFilter) && (
          <button onClick={() => { setSearch(''); setCatFilter('') }}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline">Clear</button>
        )}
        <span className="text-xs text-zinc-400 ml-auto">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-zinc-500 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-sm">No items found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  {['Item', 'Category', 'Type', 'Available', 'Assigned', 'Reorder At', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{item.name}</div>
                      {item.model && <div className="text-xs text-zinc-400">{item.manufacturer} {item.model}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-500">{item.category_name || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                        {TRACKING_LABELS[item.tracking_type]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      {item.qty_available ?? 0} <span className="text-xs font-normal text-zinc-400">{item.unit}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-zinc-500">{item.qty_assigned ?? 0}</td>
                    <td className="px-3 py-2.5 font-mono text-zinc-500">{item.reorder_level}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', STOCK_BADGE[item.stock_status] || STOCK_BADGE.in_stock)}>
                        {item.stock_status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <>
                            <button onClick={() => { setStockModal(item); setStockForm({ type: 'purchase', qty_change: '', notes: '' }) }}
                              title="Add Stock"
                              className="p-1.5 rounded hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors">
                              <ArrowUpCircle size={14} />
                            </button>
                            <button onClick={() => openEdit(item)} title="Edit"
                              className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors">
                              <Pencil size={13} />
                            </button>
                          </>
                        )}
                        <button onClick={() => loadHistory(item)} title="History"
                          className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors">
                          <History size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Item Modal */}
      <Modal open={itemModal} onClose={() => { setItemModal(false); setEditItem(null) }}
        title={editItem ? 'Edit Item' : 'Add Inventory Item'}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Item Name *</label>
              <input value={itemForm.name || ''} onChange={e => fi('name', e.target.value)}
                placeholder="e.g. Ethernet Cable Cat6"
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Category</label>
              <select value={itemForm.category_id || ''} onChange={e => fi('category_id', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                <option value="">No Category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Type</label>
              <select value={itemForm.tracking_type || 'quantity'} onChange={e => fi('tracking_type', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                <option value="quantity">Consumable</option>
                <option value="quantity_returnable">Returnable</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Manufacturer</label>
              <input value={itemForm.manufacturer || ''} onChange={e => fi('manufacturer', e.target.value)}
                placeholder="Dell, Logitech…"
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Model</label>
              <input value={itemForm.model || ''} onChange={e => fi('model', e.target.value)}
                placeholder="Model number…"
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Unit</label>
              <select value={itemForm.unit || 'pcs'} onChange={e => fi('unit', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                {['pcs','meters','box','pair','pack','roll','set'].map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">SKU</label>
              <input value={itemForm.sku || ''} onChange={e => fi('sku', e.target.value)}
                placeholder="Internal SKU…"
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            </div>
            {!editItem && (
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Initial Qty</label>
                <input type="number" min="0" value={itemForm.initial_qty || ''} onChange={e => fi('initial_qty', e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Reorder Level</label>
              <input type="number" min="0" value={itemForm.reorder_level ?? ''} onChange={e => fi('reorder_level', e.target.value)}
                placeholder="5"
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Description</label>
              <textarea value={itemForm.description || ''} onChange={e => fi('description', e.target.value)}
                rows={2} placeholder="Optional description…"
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-none" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => { setItemModal(false); setEditItem(null) }}
              className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              Cancel
            </button>
            <button onClick={saveItem} disabled={saving || !itemForm.name}
              className="px-4 py-2 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium transition-colors">
              {saving ? 'Saving…' : editItem ? 'Update' : 'Create Item'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Stock Modal */}
      <Modal open={!!stockModal} onClose={() => setStockModal(null)}
        title={`Adjust Stock — ${stockModal?.name}`}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Adjustment Type</label>
            <select value={stockForm.type} onChange={e => fs('type', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
              <option value="purchase">Purchase / Receive Stock (+)</option>
              <option value="correction">Manual Correction</option>
              <option value="damaged">Mark Damaged (−)</option>
              <option value="lost">Mark Lost (−)</option>
              <option value="retired">Retire / Dispose (−)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Quantity {stockForm.type === 'purchase' || stockForm.type === 'correction' ? '(positive = add)' : '(units to remove)'}
            </label>
            <input type="number" value={stockForm.qty_change} onChange={e => fs('qty_change', e.target.value)}
              placeholder="e.g. 20"
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            {stockModal && (
              <p className="text-xs text-zinc-400 mt-1">Current available: <strong>{stockModal.qty_available ?? 0}</strong> {stockModal.unit}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Notes</label>
            <input value={stockForm.notes} onChange={e => fs('notes', e.target.value)}
              placeholder="Reason or reference…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setStockModal(null)}
              className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
            <button onClick={saveStock} disabled={saving || !stockForm.qty_change}
              className="px-4 py-2 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium transition-colors">
              {saving ? 'Saving…' : 'Apply Adjustment'}
            </button>
          </div>
        </div>
      </Modal>

      {/* History Modal */}
      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)}
        title={`Stock History — ${historyModal?.name}`}>
        <div className="max-h-80 overflow-y-auto space-y-1">
          {history.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">No history yet</p>
          ) : history.map(h => (
            <div key={h.id} className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800 text-sm">
              <div>
                <span className={cn('text-xs font-medium mr-2', h.qty_change > 0 ? 'text-emerald-600' : 'text-red-500')}>
                  {h.qty_change > 0 ? '+' : ''}{h.qty_change}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400 capitalize">{h.type.replace('_', ' ')}</span>
                {h.notes && <span className="text-zinc-400 ml-1.5 text-xs">· {h.notes}</span>}
              </div>
              <div className="text-right text-xs text-zinc-400">
                <div>{h.performed_by_name}</div>
                <div>{new Date(h.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Category Modal */}
      <Modal open={catModal} onClose={() => setCatModal(false)} title="Add Category">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Name *</label>
            <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Cables, Peripherals…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Parent Category</label>
            <select value={catForm.parent_id} onChange={e => setCatForm(f => ({ ...f, parent_id: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
              <option value="">None (top-level)</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Description</label>
            <input value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional"
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setCatModal(false)}
              className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
            <button onClick={saveCat} disabled={saving || !catForm.name}
              className="px-4 py-2 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium transition-colors">
              {saving ? 'Saving…' : 'Create Category'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
