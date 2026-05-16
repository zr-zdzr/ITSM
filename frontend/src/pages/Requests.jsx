import React, { useEffect, useState, useCallback } from 'react'
import { Plus, RefreshCw, CheckCircle2, XCircle, ClipboardList, Send, Clock } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/ui/Modal'
import { cn } from '../lib/utils'

const PRIORITY_BADGE = {
  urgent: 'bg-red-500/15 text-red-500',
  high:   'bg-orange-500/15 text-orange-500',
  normal: 'bg-blue-500/15 text-blue-500 dark:text-blue-400',
  low:    'bg-zinc-500/15 text-zinc-500',
}
const STATUS_BADGE = {
  submitted:           'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  in_review:           'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  approved:            'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  partially_approved:  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  rejected:            'bg-red-500/15 text-red-500',
  fulfilled:           'bg-emerald-700/15 text-emerald-700 dark:text-emerald-300',
  cancelled:           'bg-zinc-500/15 text-zinc-500',
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Requests() {
  const { user, canPerm } = useAuth()
  const { toast } = useToast()
  const isIT = user?.role === 'super_admin' || canPerm('inventory', 'update')

  const [tab, setTab]               = useState(isIT ? 'queue' : 'mine')
  const [requests, setRequests]     = useState([])
  const [myRequests, setMyRequests] = useState([])
  const [loading, setLoading]       = useState(true)
  const [items, setItems]           = useState([])    // catalog for new request
  const [employees, setEmployees]   = useState([])

  // Modal states
  const [newModal, setNewModal]     = useState(false)
  const [reviewModal, setReviewModal] = useState(null)  // request object
  const [fulfillModal, setFulfillModal] = useState(null) // request object
  const [detailModal, setDetailModal]  = useState(null)  // request object
  const [saving, setSaving]         = useState(false)

  // New request form
  const [newForm, setNewForm] = useState({ priority: 'normal', reason: '', required_by: '' })
  const [cartItems, setCartItems] = useState([{ item_id: '', qty: 1, notes: '' }])

  // Review form: { [request_item_id]: { action, qty_approved, rejection_reason } }
  const [reviewDecisions, setReviewDecisions] = useState({})
  const [reviewNotes, setReviewNotes]         = useState('')

  // Fulfill form
  const [fulfillForm, setFulfillForm] = useState({ assignee_id: '', notes: '', expected_return_date: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const promises = []
      if (isIT) promises.push(api.get('/api/requests/queue'))
      promises.push(api.get('/api/requests?mine=true'))
      const [queue, mine] = isIT ? await Promise.all(promises) : [[], await promises[0]]
      if (isIT) setRequests(queue)
      setMyRequests(mine)
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }, [isIT])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (newModal) {
      api.get('/api/inventory/items').then(setItems).catch(() => {})
    }
  }, [newModal])

  useEffect(() => {
    if (fulfillModal) {
      api.get('/api/employees').then(setEmployees).catch(() => {})
    }
  }, [fulfillModal])

  async function openReview(req) {
    try {
      const full = await api.get(`/api/requests/${req.id}`)
      const decisions = {}
      for (const ri of full.items) {
        decisions[ri.id] = { action: ri.item_status === 'rejected' ? 'rejected' : 'approved', qty_approved: ri.qty_requested, rejection_reason: '' }
      }
      setReviewDecisions(decisions)
      setReviewNotes('')
      setReviewModal(full)
    } catch (e) { toast(e.message, 'error') }
  }

  async function openDetail(req) {
    try {
      const full = await api.get(`/api/requests/${req.id}`)
      setDetailModal(full)
    } catch (e) { toast(e.message, 'error') }
  }

  async function submitRequest() {
    setSaving(true)
    try {
      const validItems = cartItems.filter(i => i.item_id && i.qty > 0)
      if (!validItems.length) return toast('Add at least one item', 'error')
      await api.post('/api/requests', { ...newForm, items: validItems })
      toast('Request submitted', 'success')
      setNewModal(false)
      setNewForm({ priority: 'normal', reason: '', required_by: '' })
      setCartItems([{ item_id: '', qty: 1, notes: '' }])
      load()
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function submitReview() {
    setSaving(true)
    try {
      const decisions = Object.entries(reviewDecisions).map(([id, d]) => ({
        request_item_id: parseInt(id), ...d
      }))
      await api.post(`/api/requests/${reviewModal.id}/review`, { decisions, review_notes: reviewNotes })
      toast('Review submitted', 'success')
      setReviewModal(null)
      load()
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function submitFulfill() {
    setSaving(true)
    try {
      if (!fulfillForm.assignee_id) return toast('Select an employee', 'error')
      await api.post(`/api/requests/${fulfillModal.id}/fulfill`, fulfillForm)
      toast('Request fulfilled — assignment created', 'success')
      setFulfillModal(null)
      setFulfillForm({ assignee_id: '', notes: '', expected_return_date: '' })
      load()
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function cancelRequest(req) {
    if (!confirm(`Cancel request ${req.req_number}?`)) return
    try {
      await api.post(`/api/requests/${req.id}/cancel`, {})
      toast('Request cancelled', 'success')
      load()
    } catch (e) { toast(e.message, 'error') }
  }

  function addCartItem() { setCartItems(c => [...c, { item_id: '', qty: 1, notes: '' }]) }
  function removeCartItem(i) { setCartItems(c => c.filter((_, idx) => idx !== i)) }
  function updateCartItem(i, k, v) { setCartItems(c => c.map((item, idx) => idx === i ? { ...item, [k]: v } : item)) }

  const displayList = tab === 'queue' ? requests : myRequests

  const InputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30'

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Requests</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Item requests, approvals and fulfillment</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <RefreshCw size={15} />
          </button>
          <button onClick={() => setNewModal(true)}
            className="px-3 py-2 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium flex items-center gap-1.5 transition-colors">
            <Plus size={14} /> New Request
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg w-fit">
        {isIT && (
          <button onClick={() => setTab('queue')}
            className={cn('px-4 py-1.5 text-sm rounded-md font-medium transition-colors',
              tab === 'queue' ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300')}>
            Request Queue
            {requests.length > 0 && <span className="ml-1.5 text-xs bg-brand-500 text-white px-1.5 py-0.5 rounded-full">{requests.length}</span>}
          </button>
        )}
        <button onClick={() => setTab('mine')}
          className={cn('px-4 py-1.5 text-sm rounded-md font-medium transition-colors',
            tab === 'mine' ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300')}>
          My Requests
        </button>
        {isIT && (
          <button onClick={() => setTab('all')}
            className={cn('px-4 py-1.5 text-sm rounded-md font-medium transition-colors',
              tab === 'all' ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300')}>
            All Requests
          </button>
        )}
      </div>

      {/* Request List */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-zinc-500 text-sm">Loading…</div>
        ) : displayList.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-sm">
            {tab === 'queue' ? 'No pending requests' : 'No requests yet'}
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {displayList.map(req => (
              <div key={req.id} className="px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{req.req_number}</span>
                      <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', STATUS_BADGE[req.status] || '')}>
                        {req.status?.replace('_', ' ')}
                      </span>
                      <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', PRIORITY_BADGE[req.priority] || '')}>
                        {req.priority}
                      </span>
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                      {req.requester_name}
                      {req.reason && <span className="text-zinc-400 ml-2">· {req.reason}</span>}
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">{fmtDate(req.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => openDetail(req)}
                      className="px-2.5 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                      View
                    </button>
                    {isIT && ['submitted', 'in_review'].includes(req.status) && (
                      <button onClick={() => openReview(req)}
                        className="px-2.5 py-1 text-xs rounded bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors">
                        Review
                      </button>
                    )}
                    {isIT && ['approved', 'partially_approved'].includes(req.status) && (
                      <button onClick={() => { setFulfillModal(req); setFulfillForm({ assignee_id: '', notes: '', expected_return_date: '' }) }}
                        className="px-2.5 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors">
                        Fulfill
                      </button>
                    )}
                    {['submitted', 'in_review'].includes(req.status) && (req.requester_id === user?.id || isIT) && (
                      <button onClick={() => cancelRequest(req)}
                        className="px-2.5 py-1 text-xs rounded border border-red-200 dark:border-red-900 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Request Modal */}
      <Modal open={newModal} onClose={() => setNewModal(false)} title="Submit New Request">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Priority</label>
              <select value={newForm.priority} onChange={e => setNewForm(f => ({ ...f, priority: e.target.value }))} className={InputCls}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Needed By</label>
              <input type="date" value={newForm.required_by} onChange={e => setNewForm(f => ({ ...f, required_by: e.target.value }))} className={InputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Business Reason</label>
              <input value={newForm.reason} onChange={e => setNewForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Why do you need these items?"
                className={InputCls} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">Items</label>
              <button onClick={addCartItem} className="text-xs text-brand-500 hover:text-brand-600 font-medium">+ Add item</button>
            </div>
            <div className="space-y-2">
              {cartItems.map((ci, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select value={ci.item_id} onChange={e => updateCartItem(idx, 'item_id', e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                    <option value="">Select item…</option>
                    {items.map(i => (
                      <option key={i.id} value={i.id}>{i.name} ({i.qty_available ?? 0} available)</option>
                    ))}
                  </select>
                  <input type="number" min="1" value={ci.qty} onChange={e => updateCartItem(idx, 'qty', parseInt(e.target.value) || 1)}
                    className="w-20 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                  {cartItems.length > 1 && (
                    <button onClick={() => removeCartItem(idx)} className="text-red-400 hover:text-red-600 p-1">
                      <XCircle size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setNewModal(false)}
              className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
            <button onClick={submitRequest} disabled={saving}
              className="px-4 py-2 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 transition-colors">
              <Send size={13} /> {saving ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Review Modal */}
      <Modal open={!!reviewModal} onClose={() => setReviewModal(null)} title={`Review — ${reviewModal?.req_number}`}>
        {reviewModal && (
          <div className="space-y-4">
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              From <strong className="text-zinc-900 dark:text-zinc-100">{reviewModal.requester_name}</strong>
              {reviewModal.reason && <> · {reviewModal.reason}</>}
            </div>
            <div className="space-y-3">
              {reviewModal.items?.map(ri => (
                <div key={ri.id} className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{ri.item_name}</span>
                    <span className="text-xs text-zinc-500">Requested: {ri.qty_requested} {ri.unit}</span>
                  </div>
                  <div className="text-xs text-zinc-400">Available: <strong className="text-zinc-600 dark:text-zinc-300">{ri.qty_available ?? '?'}</strong></div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="radio"
                        checked={reviewDecisions[ri.id]?.action === 'approved'}
                        onChange={() => setReviewDecisions(d => ({ ...d, [ri.id]: { ...d[ri.id], action: 'approved' } }))}
                        className="accent-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">Approve</span>
                    </label>
                    {reviewDecisions[ri.id]?.action === 'approved' && (
                      <input type="number" min="1" max={ri.qty_requested}
                        value={reviewDecisions[ri.id]?.qty_approved ?? ri.qty_requested}
                        onChange={e => setReviewDecisions(d => ({ ...d, [ri.id]: { ...d[ri.id], qty_approved: parseInt(e.target.value) } }))}
                        className="w-20 px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/30" />
                    )}
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer ml-2">
                      <input type="radio"
                        checked={reviewDecisions[ri.id]?.action === 'rejected'}
                        onChange={() => setReviewDecisions(d => ({ ...d, [ri.id]: { ...d[ri.id], action: 'rejected' } }))}
                        className="accent-red-500" />
                      <span className="text-red-500 font-medium">Reject</span>
                    </label>
                  </div>
                  {reviewDecisions[ri.id]?.action === 'rejected' && (
                    <input value={reviewDecisions[ri.id]?.rejection_reason || ''}
                      onChange={e => setReviewDecisions(d => ({ ...d, [ri.id]: { ...d[ri.id], rejection_reason: e.target.value } }))}
                      placeholder="Reason for rejection…"
                      className="w-full px-2 py-1 text-xs rounded border border-red-200 dark:border-red-900 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-red-500/30" />
                  )}
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Review Notes</label>
              <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)}
                rows={2} placeholder="Optional notes for requester…"
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-none" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setReviewModal(null)}
                className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
              <button onClick={submitReview} disabled={saving}
                className="px-4 py-2 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 transition-colors">
                <CheckCircle2 size={13} /> {saving ? 'Submitting…' : 'Submit Review'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Fulfill Modal */}
      <Modal open={!!fulfillModal} onClose={() => setFulfillModal(null)} title={`Fulfill — ${fulfillModal?.req_number}`}>
        {fulfillModal && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Select the employee to assign the approved items to.
            </p>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Assign To *</label>
              <select value={fulfillForm.assignee_id} onChange={e => setFulfillForm(f => ({ ...f, assignee_id: e.target.value }))} className={InputCls}>
                <option value="">Select employee…</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.first_name} {e.last_name} — {e.department}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Expected Return Date</label>
              <input type="date" value={fulfillForm.expected_return_date}
                onChange={e => setFulfillForm(f => ({ ...f, expected_return_date: e.target.value }))} className={InputCls} />
              <p className="text-xs text-zinc-400 mt-1">Leave blank for consumable items</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Notes</label>
              <input value={fulfillForm.notes} onChange={e => setFulfillForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Handover notes…" className={InputCls} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setFulfillModal(null)}
                className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
              <button onClick={submitFulfill} disabled={saving || !fulfillForm.assignee_id}
                className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 transition-colors">
                <CheckCircle2 size={13} /> {saving ? 'Processing…' : 'Fulfill & Create Assignment'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title={`Request — ${detailModal?.req_number}`}>
        {detailModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-zinc-400 text-xs">From</span><p className="font-medium text-zinc-900 dark:text-zinc-100">{detailModal.requester_name}</p></div>
              <div><span className="text-zinc-400 text-xs">Status</span>
                <p><span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_BADGE[detailModal.status] || '')}>{detailModal.status?.replace('_', ' ')}</span></p>
              </div>
              <div><span className="text-zinc-400 text-xs">Priority</span>
                <p><span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PRIORITY_BADGE[detailModal.priority] || '')}>{detailModal.priority}</span></p>
              </div>
              <div><span className="text-zinc-400 text-xs">Submitted</span><p className="text-zinc-700 dark:text-zinc-300">{fmtDate(detailModal.created_at)}</p></div>
              {detailModal.reason && <div className="col-span-2"><span className="text-zinc-400 text-xs">Reason</span><p className="text-zinc-700 dark:text-zinc-300">{detailModal.reason}</p></div>}
              {detailModal.review_notes && <div className="col-span-2"><span className="text-zinc-400 text-xs">Review Notes</span><p className="text-zinc-700 dark:text-zinc-300">{detailModal.review_notes}</p></div>}
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Items</p>
              <div className="space-y-2">
                {detailModal.items?.map(ri => (
                  <div key={ri.id} className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800 text-sm">
                    <span className="text-zinc-800 dark:text-zinc-200">{ri.item_name}</span>
                    <div className="text-right">
                      <span className="text-zinc-500 text-xs">Requested: {ri.qty_requested}</span>
                      {ri.item_status !== 'pending' && (
                        <span className={cn('ml-2 text-xs px-1.5 py-0.5 rounded-full',
                          ri.item_status === 'approved' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/15 text-red-500')}>
                          {ri.item_status === 'approved' ? `Approved: ${ri.qty_approved}` : 'Rejected'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
