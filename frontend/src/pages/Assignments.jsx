import React, { useEffect, useState, useCallback } from 'react'
import { Plus, RefreshCw, RotateCcw, User, Package } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/ui/Modal'
import { cn } from '../lib/utils'

const STATUS_BADGE = {
  active:              'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  partially_returned:  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  fully_returned:      'bg-zinc-500/15 text-zinc-500',
}
const COND_BADGE = {
  good:    'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  damaged: 'bg-red-500/15 text-red-500',
  lost:    'bg-zinc-500/15 text-zinc-500',
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Assignments() {
  const { canPerm } = useAuth()
  const { toast } = useToast()
  const canEdit = canPerm('inventory', 'update')

  const [assignments, setAssignments] = useState([])
  const [employees, setEmployees]     = useState([])
  const [items, setItems]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [empFilter, setEmpFilter]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [detailAsn, setDetailAsn]   = useState(null)
  const [returnModal, setReturnModal] = useState(null) // assignment
  const [directModal, setDirectModal] = useState(false)
  const [saving, setSaving]           = useState(false)

  // Return form: [{ assignment_item_id, qty, condition }]
  const [returnItems, setReturnItems]   = useState([])
  const [returnNotes, setReturnNotes]   = useState('')
  const [returnEmpId, setReturnEmpId]   = useState('')

  // Direct assign form
  const [directForm, setDirectForm] = useState({ assignee_id: '', expected_return_date: '', notes: '' })
  const [directCart, setDirectCart] = useState([{ item_id: '', qty: 1 }])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (empFilter) params.set('employee_id', empFilter)
      const [a, e] = await Promise.all([
        api.get(`/api/assignments?${params}`),
        api.get('/api/employees'),
      ])
      setAssignments(a)
      setEmployees(e)
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }, [statusFilter, empFilter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (directModal) api.get('/api/inventory/items').then(setItems).catch(() => {})
  }, [directModal])

  async function openDetail(asn) {
    try {
      const full = await api.get(`/api/assignments/${asn.id}`)
      setDetailAsn(full)
    } catch (e) { toast(e.message, 'error') }
  }

  function openReturn(asn) {
    const activeItems = (asn.items || []).filter(i => i.status === 'active')
    setReturnItems(activeItems.map(i => ({ assignment_item_id: i.id, qty: i.qty, condition: 'good', item_name: i.item_name, unit: i.unit })))
    setReturnNotes('')
    setReturnEmpId(String(asn.assignee_id))
    setReturnModal(asn)
  }

  async function openReturnFromDetail() {
    if (!detailAsn) return
    const full = await api.get(`/api/assignments/${detailAsn.id}`)
    setDetailAsn(null)
    openReturn(full)
  }

  async function submitReturn() {
    setSaving(true)
    try {
      if (!returnEmpId) return toast('Returned by employee required', 'error')
      const payload = { returned_by: returnEmpId, items: returnItems, notes: returnNotes }
      const res = await api.post(`/api/assignments/${returnModal.id}/return`, payload)
      toast(`Return processed — assignment ${res.assignment_status.replace('_', ' ')}`, 'success')
      setReturnModal(null)
      load()
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function submitDirect() {
    setSaving(true)
    try {
      if (!directForm.assignee_id) return toast('Select an employee', 'error')
      const validItems = directCart.filter(i => i.item_id && i.qty > 0)
      if (!validItems.length) return toast('Add at least one item', 'error')
      await api.post('/api/assignments/direct', { ...directForm, items: validItems })
      toast('Items assigned', 'success')
      setDirectModal(false)
      setDirectForm({ assignee_id: '', expected_return_date: '', notes: '' })
      setDirectCart([{ item_id: '', qty: 1 }])
      load()
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  function updateReturnItem(i, k, v) { setReturnItems(c => c.map((item, idx) => idx === i ? { ...item, [k]: v } : item)) }
  function addCartItem() { setDirectCart(c => [...c, { item_id: '', qty: 1 }]) }
  function removeCartItem(i) { setDirectCart(c => c.filter((_, idx) => idx !== i)) }
  function updateCartItem(i, k, v) { setDirectCart(c => c.map((item, idx) => idx === i ? { ...item, [k]: v } : item)) }

  const InputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30'

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Assignments</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Assigned items, returns and tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <RefreshCw size={15} />
          </button>
          {canEdit && (
            <button onClick={() => setDirectModal(true)}
              className="px-3 py-2 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium flex items-center gap-1.5 transition-colors">
              <Plus size={14} /> Direct Assign
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
          <option value="">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
          <option value="">Active only</option>
          <option value="active">Active</option>
          <option value="partially_returned">Partially Returned</option>
          <option value="fully_returned">Fully Returned</option>
        </select>
        {(empFilter || statusFilter) && (
          <button onClick={() => { setEmpFilter(''); setStatusFilter('') }}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline">Clear</button>
        )}
        <span className="text-xs text-zinc-400 ml-auto">{assignments.length} assignment{assignments.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Assignments Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-zinc-500 text-sm">Loading…</div>
        ) : assignments.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-sm">No assignments found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  {['Assignment', 'Employee', 'Department', 'Assigned By', 'Date', 'Return By', 'Status', ''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assignments.map(asn => (
                  <tr key={asn.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">{asn.asn_number}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{asn.assignee_name}</div>
                      <div className="text-xs text-zinc-400">{asn.designation}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-500">{asn.department || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-zinc-500">{asn.assigned_by_name}</td>
                    <td className="px-3 py-2.5 text-xs text-zinc-500 whitespace-nowrap">{fmtDate(asn.assigned_date)}</td>
                    <td className="px-3 py-2.5 text-xs text-zinc-500 whitespace-nowrap">
                      {asn.expected_return_date
                        ? <span className={cn(new Date(asn.expected_return_date) < new Date() && asn.status === 'active' ? 'text-red-500 font-medium' : '')}>
                            {fmtDate(asn.expected_return_date)}
                          </span>
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', STATUS_BADGE[asn.status] || '')}>
                        {asn.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openDetail(asn)}
                          className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap">
                          View
                        </button>
                        {canEdit && asn.status !== 'fully_returned' && (
                          <button onClick={async () => { const full = await api.get(`/api/assignments/${asn.id}`); openReturn(full) }}
                            className="px-2 py-1 text-xs rounded border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors whitespace-nowrap flex items-center gap-1">
                            <RotateCcw size={11} /> Return
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Modal open={!!detailAsn} onClose={() => setDetailAsn(null)} title={`Assignment — ${detailAsn?.asn_number}`}>
        {detailAsn && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-zinc-400 text-xs">Employee</span><p className="font-medium text-zinc-900 dark:text-zinc-100">{detailAsn.assignee_name}</p></div>
              <div><span className="text-zinc-400 text-xs">Status</span>
                <p><span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_BADGE[detailAsn.status] || '')}>{detailAsn.status?.replace('_', ' ')}</span></p>
              </div>
              <div><span className="text-zinc-400 text-xs">Department</span><p className="text-zinc-700 dark:text-zinc-300">{detailAsn.department || '—'}</p></div>
              <div><span className="text-zinc-400 text-xs">Assigned By</span><p className="text-zinc-700 dark:text-zinc-300">{detailAsn.assigned_by_name}</p></div>
              <div><span className="text-zinc-400 text-xs">Assigned Date</span><p className="text-zinc-700 dark:text-zinc-300">{fmtDate(detailAsn.assigned_date)}</p></div>
              <div><span className="text-zinc-400 text-xs">Return By</span><p className="text-zinc-700 dark:text-zinc-300">{fmtDate(detailAsn.expected_return_date)}</p></div>
              {detailAsn.notes && <div className="col-span-2"><span className="text-zinc-400 text-xs">Notes</span><p className="text-zinc-700 dark:text-zinc-300">{detailAsn.notes}</p></div>}
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Items</p>
              <div className="space-y-1.5">
                {detailAsn.items?.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800 text-sm">
                    <div>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{item.item_name}</span>
                      <span className="text-zinc-400 text-xs ml-2">× {item.qty} {item.unit}</span>
                    </div>
                    <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium',
                      item.status === 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : item.status === 'returned' ? 'bg-zinc-500/15 text-zinc-500'
                      : 'bg-red-500/15 text-red-500')}>
                      {item.status} {item.return_condition ? `· ${item.return_condition}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {canEdit && detailAsn.status !== 'fully_returned' && (
              <div className="flex justify-end pt-2">
                <button onClick={openReturnFromDetail}
                  className="px-4 py-2 text-sm rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium flex items-center gap-1.5 transition-colors">
                  <RotateCcw size={13} /> Process Return
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Return Modal */}
      <Modal open={!!returnModal} onClose={() => setReturnModal(null)} title={`Process Return — ${returnModal?.asn_number}`}>
        {returnModal && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Returned By *</label>
              <select value={returnEmpId} onChange={e => setReturnEmpId(e.target.value)} className={InputCls}>
                <option value="">Select employee…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Items Being Returned</p>
              {returnItems.length === 0 ? (
                <p className="text-sm text-zinc-400">No active items to return</p>
              ) : (
                <div className="space-y-3">
                  {returnItems.map((item, idx) => (
                    <div key={idx} className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{item.item_name}</span>
                        <span className="text-xs text-zinc-400">Qty: {item.qty} {item.unit}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-xs font-medium text-zinc-500">Condition:</label>
                        {['good', 'damaged', 'lost'].map(c => (
                          <label key={c} className="flex items-center gap-1 text-xs cursor-pointer">
                            <input type="radio" name={`cond-${idx}`} value={c}
                              checked={item.condition === c}
                              onChange={() => updateReturnItem(idx, 'condition', c)}
                              className={c === 'good' ? 'accent-emerald-500' : c === 'damaged' ? 'accent-amber-500' : 'accent-zinc-500'} />
                            <span className={cn('font-medium capitalize',
                              c === 'good' ? 'text-emerald-600 dark:text-emerald-400'
                              : c === 'damaged' ? 'text-amber-600 dark:text-amber-400'
                              : 'text-zinc-500')}>{c}</span>
                          </label>
                        ))}
                      </div>
                      {item.condition !== 'good' && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          {item.condition === 'damaged' ? '⚠ Will be marked damaged, not returned to stock' : '⚠ Will be marked as lost'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Notes</label>
              <input value={returnNotes} onChange={e => setReturnNotes(e.target.value)}
                placeholder="Return notes…" className={InputCls} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setReturnModal(null)}
                className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
              <button onClick={submitReturn} disabled={saving || !returnEmpId || returnItems.length === 0}
                className="px-4 py-2 text-sm rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 transition-colors">
                <RotateCcw size={13} /> {saving ? 'Processing…' : 'Confirm Return'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Direct Assign Modal */}
      <Modal open={directModal} onClose={() => setDirectModal(false)} title="Direct Assignment">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Assign To *</label>
            <select value={directForm.assignee_id} onChange={e => setDirectForm(f => ({ ...f, assignee_id: e.target.value }))} className={InputCls}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} — {e.department}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">Items</label>
              <button onClick={addCartItem} className="text-xs text-brand-500 hover:text-brand-600 font-medium">+ Add item</button>
            </div>
            <div className="space-y-2">
              {directCart.map((ci, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select value={ci.item_id} onChange={e => updateCartItem(idx, 'item_id', e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                    <option value="">Select item…</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.qty_available ?? 0} avail.)</option>)}
                  </select>
                  <input type="number" min="1" value={ci.qty} onChange={e => updateCartItem(idx, 'qty', parseInt(e.target.value) || 1)}
                    className="w-20 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                  {directCart.length > 1 && (
                    <button onClick={() => removeCartItem(idx)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Expected Return</label>
              <input type="date" value={directForm.expected_return_date}
                onChange={e => setDirectForm(f => ({ ...f, expected_return_date: e.target.value }))} className={InputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Notes</label>
              <input value={directForm.notes} onChange={e => setDirectForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional" className={InputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setDirectModal(false)}
              className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
            <button onClick={submitDirect} disabled={saving || !directForm.assignee_id}
              className="px-4 py-2 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 transition-colors">
              <Package size={13} /> {saving ? 'Assigning…' : 'Create Assignment'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
