import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Search } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'

const ACTION_STYLES = {
  login:           'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  logout:          'bg-zinc-700/50 text-zinc-400 ring-1 ring-zinc-600/30',
  login_failed:    'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
  login_blocked:   'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
  created:         'bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/20',
  updated:         'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
  deleted:         'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
  deleted_all:     'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
  imported:        'bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20',
  password_changed:'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20',
  password_reset:  'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20',
  // Inventory / Requests / Assignments
  STOCK_ADJUST:    'bg-teal-500/10 text-teal-400 ring-1 ring-teal-500/20',
  CREATE:          'bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/20',
  REVIEW:          'bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20',
  FULFILL:         'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  RETURN:          'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
  ASSIGN:          'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20',
  CANCEL:          'bg-zinc-700/50 text-zinc-400 ring-1 ring-zinc-600/30',
  DELETE:          'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
}

const MODULE_LABELS = {
  auth:            'Auth',
  users:           'Users',
  systems:         'Systems',
  network_devices: 'Network',
  mobiles:         'Mobiles',
  sims:            'SIMs',
  gws_accounts:    'Cloud IDs',
  employees:       'Employees',
  inventory:       'Inventory',
  inv_requests:    'Requests',
  inv_assignments: 'Assignments',
}

function fmt(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function ActivityLog() {
  const { user: me } = useAuth()
  const { toast } = useToast()
  const [logs, setLogs] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')

  if (me?.role !== 'super_admin') return <Navigate to="/" replace />

  async function load() {
    setLoading(true)
    try {
      const data = await api.get('/api/users/activity/log')
      setLogs(data)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    let out = logs
    if (actionFilter !== 'all') out = out.filter(l => l.action === actionFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(l =>
        l.user_name?.toLowerCase().includes(q) ||
        l.user_email?.toLowerCase().includes(q) ||
        l.action?.toLowerCase().includes(q) ||
        l.record_label?.toLowerCase().includes(q) ||
        l.details?.toLowerCase().includes(q) ||
        l.ip_address?.includes(q)
      )
    }
    setFiltered(out)
  }, [logs, search, actionFilter])

  const actions = ['all', ...Array.from(new Set(logs.map(l => l.action))).sort()]

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-zinc-500">{filtered.length} event{filtered.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="input-base pl-7 py-1.5 text-xs w-48"
            />
          </div>
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="input-base py-1.5 text-xs"
          >
            {actions.map(a => (
              <option key={a} value={a}>{a === 'all' ? 'All actions' : a.replace('_', ' ')}</option>
            ))}
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="btn-secondary py-1.5 text-xs flex items-center gap-1.5"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                {['Time', 'User', 'Action', 'Module', 'Record', 'Details', 'IP'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-500">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-500">No events found</td></tr>
              ) : filtered.map(l => (
                <tr key={l.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                  <td className="px-3 py-2 text-zinc-500 text-xs whitespace-nowrap">{fmt(l.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">{l.user_name || <span className="text-zinc-400">—</span>}</div>
                    <div className="text-[10px] text-zinc-400 dark:text-zinc-600">{l.user_email || 'Unknown'}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ACTION_STYLES[l.action] || 'bg-zinc-700/50 text-zinc-400'}`}>
                      {l.action?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">{MODULE_LABELS[l.table_name] || l.table_name || '—'}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 max-w-[140px] truncate" title={l.record_label}>{l.record_label || '—'}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500 max-w-[180px] truncate" title={l.details}>{l.details || '—'}</td>
                  <td className="px-3 py-2 text-xs text-zinc-400 dark:text-zinc-600 font-mono">{l.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  )
}
