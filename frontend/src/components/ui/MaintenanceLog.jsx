import React, { useEffect, useState } from 'react'
import { Wrench, Plus, Trash2, X } from 'lucide-react'
import { api } from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'
import { cn } from '../../lib/utils'

const EVENT_TYPES = ['repair_sent', 'repaired', 'upgraded', 'serviced', 'replaced_part', 'inspected', 'other']

const EVENT_COLOR = {
  repair_sent:   'bg-red-500/10 text-red-500 dark:text-red-400',
  repaired:      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  upgraded:      'bg-brand-500/10 text-brand-500 dark:text-brand-400',
  serviced:      'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  replaced_part: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  inspected:     'bg-zinc-200 dark:bg-zinc-700/50 text-zinc-500',
  other:         'bg-zinc-200 dark:bg-zinc-700/50 text-zinc-500',
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const EMPTY_FORM = { event_type: 'serviced', event_date: '', performed_by: '', cost_pkr: '', notes: '' }
const InputCls = 'w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30'

export default function MaintenanceLog({ row, assetType }) {
  const { toast } = useToast()
  const [logs, setLogs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    if (!row?.id) return
    setLoading(true)
    api.get(`/api/maintenance/${assetType}/${row.id}`)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [row?.id, assetType])

  async function save() {
    setSaving(true)
    try {
      const entry = await api.post(`/api/maintenance/${assetType}/${row.id}`, form)
      setLogs(l => [entry, ...(l || [])])
      setAdding(false)
      setForm(EMPTY_FORM)
      toast('Maintenance event logged', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function remove(id) {
    try {
      await api.del(`/api/maintenance/${id}`)
      setLogs(l => l.filter(x => x.id !== id))
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Wrench size={13} className="text-amber-500" />
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Maintenance Log</span>
        {!loading && logs !== null && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{logs.length} events</span>
        )}
        <button
          onClick={() => setAdding(a => !a)}
          className="ml-auto flex items-center gap-1 text-[11px] text-brand-500 hover:text-brand-400 font-medium transition-colors">
          {adding ? <X size={11} /> : <Plus size={11} />}
          {adding ? 'Cancel' : 'Log Event'}
        </button>
      </div>

      {adding && (
        <div className="mb-3 p-3 rounded-lg border border-zinc-700/60 bg-zinc-800/40 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1 font-medium uppercase tracking-wide">Event Type *</label>
              <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))} className={InputCls}>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1 font-medium uppercase tracking-wide">Date</label>
              <input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} className={InputCls} />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1 font-medium uppercase tracking-wide">Performed By</label>
              <input value={form.performed_by} onChange={e => setForm(f => ({ ...f, performed_by: e.target.value }))}
                placeholder="Vendor or technician" className={InputCls} />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1 font-medium uppercase tracking-wide">Cost (PKR)</label>
              <input type="number" min="0" value={form.cost_pkr} onChange={e => setForm(f => ({ ...f, cost_pkr: e.target.value }))}
                placeholder="0" className={InputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] text-zinc-500 mb-1 font-medium uppercase tracking-wide">Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="What was done?" className={InputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => { setAdding(false); setForm(EMPTY_FORM) }}
              className="px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="px-3 py-1.5 text-xs rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium transition-colors">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-zinc-500 py-2">Loading…</p>
      ) : !logs?.length ? (
        <p className="text-xs text-zinc-500 py-2">No maintenance events recorded</p>
      ) : (
        <div className="space-y-2">
          {logs.map(entry => (
            <div key={entry.id} className="rounded-lg border border-zinc-700/50 bg-zinc-800/20 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', EVENT_COLOR[entry.event_type] || EVENT_COLOR.other)}>
                    {entry.event_type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-zinc-400">{fmtDate(entry.event_date)}</span>
                  {entry.performed_by && <span className="text-xs text-zinc-500">· {entry.performed_by}</span>}
                  {entry.cost_pkr && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">PKR {Number(entry.cost_pkr).toLocaleString()}</span>}
                </div>
                <button onClick={() => remove(entry.id)}
                  className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0">
                  <Trash2 size={11} />
                </button>
              </div>
              {entry.notes && <p className="text-xs text-zinc-500 mt-1">{entry.notes}</p>}
              {entry.logged_by_name && (
                <p className="text-[10px] text-zinc-600 mt-1">Logged by {entry.logged_by_name}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
