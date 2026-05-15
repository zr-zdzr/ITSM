import React, { useEffect, useState } from 'react'
import { Trash2, RotateCcw, Clock, AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import { api } from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'
import { cn } from '../../lib/utils'

const MODULE_LABELS = {
  systems:   'System',
  network:   'Network Device',
  mobiles:   'Mobile Device',
  sims:      'SIM Card',
  gws:       'Cloud ID',
  employees: 'Employee',
}

const MODULE_COLORS = {
  systems:   'bg-brand-500/10 text-brand-500 dark:text-brand-400',
  network:   'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  mobiles:   'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  sims:      'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  gws:       'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  employees: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
}

const ACTION_STYLES = {
  created:          'text-brand-500 dark:text-brand-400 bg-brand-500/10',
  updated:          'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  imported:         'text-violet-600 dark:text-violet-400 bg-violet-500/10',
  password_reset:   'text-sky-600 dark:text-sky-400 bg-sky-500/10',
  password_changed: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
}

function daysLeft(expires_at) {
  const ms = new Date(expires_at) - new Date()
  return Math.max(0, Math.ceil(ms / 86400000))
}

function fmtRelative(ts) {
  if (!ts) return null
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function RecycleBinModal({ open, onClose, onCountChange }) {
  const { toast } = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [confirmPermanent, setConfirmPermanent] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const data = await api.get('/api/recycle-bin')
      setItems(data)
      onCountChange?.(data.length)
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (open) load() }, [open])

  async function restore(item) {
    try {
      await api.post(`/api/recycle-bin/${item.id}/restore`)
      toast(`Restored: ${item.record_name}`, 'success')
      const updated = items.filter(i => i.id !== item.id)
      setItems(updated)
      onCountChange?.(updated.length)
    } catch (e) { toast(e.message, 'error') }
  }

  async function permanentDelete(item) {
    try {
      await api.del(`/api/recycle-bin/${item.id}`)
      toast('Permanently deleted', 'success')
      setConfirmPermanent(null)
      const updated = items.filter(i => i.id !== item.id)
      setItems(updated)
      onCountChange?.(updated.length)
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Recycle Bin" size="xl">
        <div className="mb-3 flex items-center gap-2 text-xs text-zinc-500">
          <Clock size={12} />
          Items are automatically purged after 30 days.
        </div>

        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <Trash2 size={32} className="mx-auto mb-3 text-zinc-400 dark:text-zinc-700" />
            <p className="text-sm text-zinc-400">Recycle bin is empty</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  {['Module', 'Record', 'Last Action', 'Deleted by', 'Expires in', ''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const days = daysLeft(item.expires_at)
                  return (
                    <tr key={item.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                      {/* Module badge */}
                      <td className="px-3 py-3">
                        <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', MODULE_COLORS[item.module] || 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500')}>
                          {MODULE_LABELS[item.module] || item.module}
                        </span>
                      </td>

                      {/* Record name */}
                      <td className="px-3 py-3 font-medium text-zinc-800 dark:text-zinc-200 max-w-[160px] truncate" title={item.record_name}>
                        {item.record_name}
                      </td>

                      {/* Last action */}
                      <td className="px-3 py-3">
                        {item.last_action ? (
                          <div className="flex flex-col gap-0.5">
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium self-start', ACTION_STYLES[item.last_action] || 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500')}>
                              {item.last_action.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[10px] text-zinc-400">
                              {item.last_action_by && <span className="text-zinc-500 dark:text-zinc-400">{item.last_action_by} · </span>}
                              {fmtRelative(item.last_action_at)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-zinc-400 italic">No prior log</span>
                        )}
                      </td>

                      {/* Deleted by */}
                      <td className="px-3 py-3 text-xs text-zinc-500 dark:text-zinc-500 whitespace-nowrap">
                        {item.deleted_by_name || '—'}
                      </td>

                      {/* Expires in */}
                      <td className="px-3 py-3">
                        <span className={cn('text-xs font-medium', days <= 3 ? 'text-red-500 dark:text-red-400' : days <= 7 ? 'text-amber-500 dark:text-amber-400' : 'text-zinc-400')}>
                          {days}d
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => restore(item)}
                            title="Restore"
                            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          >
                            <RotateCcw size={12} /> Restore
                          </button>
                          <button
                            onClick={() => setConfirmPermanent(item)}
                            title="Delete permanently"
                            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-red-500 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end mt-5 pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </Modal>

      {/* Permanent delete confirm */}
      <Modal open={!!confirmPermanent} onClose={() => setConfirmPermanent(null)} title="Permanently Delete" size="sm">
        <div className="flex gap-3">
          <AlertTriangle size={20} className="text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <strong className="text-zinc-900 dark:text-zinc-100">{confirmPermanent?.record_name}</strong> will be permanently deleted and cannot be recovered.
            </p>
            <p className="text-xs text-zinc-400 mt-1">This bypasses the 30-day recovery window.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary" onClick={() => setConfirmPermanent(null)}>Cancel</button>
          <button className="btn-base bg-red-500 hover:bg-red-600 text-white" onClick={() => permanentDelete(confirmPermanent)}>
            Delete Permanently
          </button>
        </div>
      </Modal>
    </>
  )
}
