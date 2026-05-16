import React, { useEffect, useRef, useState } from 'react'
import {
  Monitor, Network, Smartphone, CreditCard, Cloud, Users,
  TrendingUp, Activity, Clock, ScrollText, Cpu, MapPin, Package, ChevronDown,
  ClipboardList, PackageCheck, AlertTriangle as AlertTriangleIcon, ArrowRight,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useNavigate } from 'react-router-dom'
import StatsCard from '../components/ui/StatsCard'
import Badge from '../components/ui/Badge'
import { api } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { cn } from '../lib/utils'

const COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316','#14b8a6','#a855f7']

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card px-3 py-2 shadow-xl text-xs border border-zinc-200 dark:border-zinc-700">
      <p className="text-zinc-500 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.fill || p.color }} className="font-semibold">{p.name || p.dataKey}: {p.value}</p>
      ))}
    </div>
  )
}

// ── Horizontal bar list ───────────────────────────────────
function BarList({ rows, keyField, valueField = 'n', colorClass = 'bg-brand-500' }) {
  const max = Math.max(...(rows || []).map(r => Number(r[valueField] || 0)), 1)
  return (
    <div className="space-y-1.5">
      {(rows || []).map((r, i) => {
        const val = Number(r[valueField] || 0)
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 w-28 shrink-0 truncate" title={r[keyField]}>{r[keyField] || '—'}</span>
            <div className="flex-1 bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${(val / max) * 100}%` }} />
            </div>
            <span className="text-xs text-zinc-600 dark:text-zinc-400 w-6 text-right shrink-0">{val}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Stat pills ────────────────────────────────────────────
function StatPills({ items }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${item.bg}`}>
          <span className={`text-lg font-bold ${item.color}`}>{item.value ?? '—'}</span>
          <span className={`text-xs opacity-80 ${item.color}`}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Lazy row fetcher ─────────────────────────────────────
function useLazyRows(apiPath, open) {
  const [rows, setRows] = useState([])
  const [fetching, setFetching] = useState(false)
  const fetched = useRef(false)
  useEffect(() => {
    if (!open || fetched.current) return
    fetched.current = true
    setFetching(true)
    api.get(apiPath)
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setFetching(false))
  }, [open, apiPath])
  return { rows, fetching }
}

// ── Mini data table ───────────────────────────────────────
const LIMIT = 12
function MiniTable({ columns, rows, fetching, path, navigate }) {
  const visible = rows.slice(0, LIMIT)
  if (fetching) return (
    <div className="space-y-1.5 mt-3">
      {[1,2,3].map(i => <div key={i} className="h-8 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />)}
    </div>
  )
  if (!rows.length) return (
    <p className="text-xs text-zinc-400 mt-3 text-center py-3">No records found</p>
  )
  return (
    <div className="mt-3 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-100 dark:border-zinc-800">
              {columns.map(c => (
                <th key={c.key} className="px-3 py-2 text-left font-semibold text-zinc-500 uppercase tracking-wider text-[10px] whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={row.id ?? i} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                {columns.map(c => (
                  <td key={c.key} className="px-3 py-2 whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                    {c.render ? c.render(row[c.key], row) : (row[c.key] ?? <span className="text-zinc-400">—</span>)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > LIMIT && (
        <button
          onClick={() => navigate(path)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-brand-500 dark:text-brand-400 hover:bg-brand-500/5 transition-colors border-t border-zinc-100 dark:border-zinc-800"
        >
          View all {rows.length} records <ArrowRight size={12} />
        </button>
      )}
    </div>
  )
}

// ── Accordion section card ────────────────────────────────
function AccordionSection({ id, open, onToggle, icon: Icon, iconColor, title, badge, delay, loading, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
      >
        <Icon size={15} className={iconColor} />
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 flex-1 text-left">{title}</span>
        {badge != null && !loading && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-medium">{badge}</span>
        )}
        <ChevronDown size={14} className={cn('text-zinc-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
              {loading ? (
                <div className="space-y-2 pt-2">
                  <div className="h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                  <div className="h-20 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                </div>
              ) : children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Systems content ───────────────────────────────────────
function SystemsContent({ data, open, navigate }) {
  const { rows, fetching } = useLazyRows('/api/systems', open)
  if (!data) return null
  const { assignment, byLocation, byGeneration, byType } = data
  const typeRows = (byType || []).map(r => ({ ...r, type: r.type === 'System' ? 'PC / Desktop' : r.type }))
  const cols = [
    { key: 'asset_tag',         label: 'Asset Tag' },
    { key: 'type',              label: 'Type' },
    { key: 'manufacturer',      label: 'Brand / Model', render: (_, r) => `${r.manufacturer||''} ${r.model||''}`.trim() || '—' },
    { key: 'serial_number',     label: 'Serial No.' },
    { key: 'status',            label: 'Status', render: v => <Badge status={v}>{v||'—'}</Badge> },
    { key: 'assigned_user_name',label: 'Assigned To', render: v => v || <span className="text-zinc-400">Unassigned</span> },
    { key: 'department',        label: 'Dept.' },
  ]
  return (
    <>
      <StatPills items={[
        { label: 'Assigned',  value: assignment?.assigned_users, bg: 'bg-brand-500/10',   color: 'text-brand-500 dark:text-brand-400' },
        { label: 'Inventory', value: assignment?.in_inventory,   bg: 'bg-emerald-500/10', color: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'Damaged',   value: assignment?.damaged,        bg: 'bg-red-500/10',     color: 'text-red-500 dark:text-red-400' },
        { label: 'Total',     value: assignment?.total,          bg: 'bg-zinc-100 dark:bg-zinc-800', color: 'text-zinc-700 dark:text-zinc-300' },
      ]} />
      <MiniTable columns={cols} rows={rows} fetching={fetching} path="/systems" navigate={navigate} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Monitor size={10} /> Type</p>
          <div className="space-y-1">
            {typeRows.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">{r.type}</span>
                <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{Number(r.n)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1"><MapPin size={10} /> Location</p>
          <BarList rows={byLocation} keyField="location" colorClass="bg-sky-500" />
        </div>
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Cpu size={10} /> Generation</p>
          <BarList rows={byGeneration} keyField="generation" colorClass="bg-violet-500" />
        </div>
      </div>
    </>
  )
}

// ── Mobiles content ───────────────────────────────────────
function MobilesContent({ data, open, navigate }) {
  const { rows, fetching } = useLazyRows('/api/mobiles', open)
  if (!data) return null
  const { assignment, byLocation, byOS, byPurpose } = data
  const purposeLabel = { personal: 'Personal', qa_testing: 'QA Testing', service: 'Service', Unknown: 'Unknown' }
  const cols = [
    { key: 'asset_tag',         label: 'Asset Tag' },
    { key: 'brand',             label: 'Brand / Model', render: (_, r) => `${r.brand||''} ${r.model||''}`.trim() || '—' },
    { key: 'serial_number',     label: 'Serial No.' },
    { key: 'imei1',             label: 'IMEI' },
    { key: 'status',            label: 'Status', render: v => <Badge status={v}>{v||'—'}</Badge> },
    { key: 'assigned_user_name',label: 'Assigned To', render: v => v || <span className="text-zinc-400">Unassigned</span> },
  ]
  return (
    <>
      <StatPills items={[
        { label: 'Assigned',  value: assignment?.assigned_users, bg: 'bg-emerald-500/10', color: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'Inventory', value: assignment?.in_inventory,   bg: 'bg-brand-500/10',   color: 'text-brand-500 dark:text-brand-400' },
        { label: 'Damaged',   value: assignment?.damaged,        bg: 'bg-red-500/10',     color: 'text-red-500 dark:text-red-400' },
        { label: 'Total',     value: assignment?.total,          bg: 'bg-zinc-100 dark:bg-zinc-800', color: 'text-zinc-700 dark:text-zinc-300' },
      ]} />
      <MiniTable columns={cols} rows={rows} fetching={fetching} path="/mobiles" navigate={navigate} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Smartphone size={10} /> Platform</p>
          <div className="space-y-1">
            {(byOS || []).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">{r.os === 'iOS' ? 'Apple (iOS)' : r.os === 'Android' ? 'Android' : r.os}</span>
                <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{Number(r.n)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1"><MapPin size={10} /> Location</p>
          <BarList rows={byLocation} keyField="location" colorClass="bg-emerald-500" />
        </div>
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Activity size={10} /> Purpose</p>
          <div className="space-y-1">
            {(byPurpose || []).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">{purposeLabel[r.purpose] || r.purpose}</span>
                <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{Number(r.n)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

// ── SIMs content ──────────────────────────────────────────
function SIMsContent({ data, open, navigate }) {
  const { rows, fetching } = useLazyRows('/api/sims', open)
  if (!data) return null
  const { assignment, byLocation, byPackage, byVendor } = data
  const cols = [
    { key: 'phone_number',      label: 'Phone #' },
    { key: 'vendor',            label: 'Vendor' },
    { key: 'package_name',      label: 'Package' },
    { key: 'status',            label: 'Status', render: v => <Badge status={v}>{v||'—'}</Badge> },
    { key: 'assigned_user_name',label: 'Assigned To', render: v => v || <span className="text-zinc-400">Unassigned</span> },
    { key: 'monthly_rate',      label: 'Rate/Mo', render: v => v ? `PKR ${Number(v).toLocaleString()}` : '—' },
  ]
  return (
    <>
      <StatPills items={[
        { label: 'Users',     value: assignment?.for_users,    bg: 'bg-purple-500/10', color: 'text-purple-600 dark:text-purple-400' },
        { label: 'Services',  value: assignment?.for_services, bg: 'bg-amber-500/10',  color: 'text-amber-600 dark:text-amber-400' },
        { label: 'Inventory', value: assignment?.in_inventory, bg: 'bg-brand-500/10',  color: 'text-brand-500 dark:text-brand-400' },
        { label: 'Total',     value: assignment?.total,        bg: 'bg-zinc-100 dark:bg-zinc-800', color: 'text-zinc-700 dark:text-zinc-300' },
      ]} />
      <MiniTable columns={cols} rows={rows} fetching={fetching} path="/sims" navigate={navigate} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1"><CreditCard size={10} /> Vendor</p>
          <div className="space-y-1">
            {(byVendor || []).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">{r.vendor}</span>
                <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{Number(r.n)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1"><MapPin size={10} /> Location</p>
          <BarList rows={byLocation} keyField="location" colorClass="bg-purple-500" />
        </div>
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Package size={10} /> Packages</p>
          <BarList rows={byPackage} keyField="package_name" colorClass="bg-amber-500" />
        </div>
      </div>
    </>
  )
}

// ── Employees content ─────────────────────────────────────
function EmployeesContent({ data, open, navigate }) {
  const { rows, fetching } = useLazyRows('/api/employees', open)
  if (!data) return null
  const { byLocation, byDepartment } = data
  const cols = [
    { key: 'display_name', label: 'Name', render: (v, r) => v || `${r.first_name||''} ${r.last_name||''}`.trim() || '—' },
    { key: 'designation',  label: 'Title' },
    { key: 'department',   label: 'Department' },
    { key: 'email',        label: 'Email' },
    { key: 'location',     label: 'Location' },
    { key: 'status',       label: 'Status', render: v => <Badge status={v}>{v||'—'}</Badge> },
  ]
  return (
    <>
      <MiniTable columns={cols} rows={rows} fetching={fetching} path="/employees" navigate={navigate} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1"><MapPin size={10} /> By Location</p>
          <BarList rows={byLocation} keyField="location" colorClass="bg-amber-500" />
        </div>
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Users size={10} /> By Department</p>
          <BarList rows={byDepartment} keyField="department" colorClass="bg-brand-500" />
        </div>
      </div>
    </>
  )
}

// ── 24h activity log ──────────────────────────────────────
const ACTION_DOT = {
  login: 'bg-emerald-500', logout: 'bg-zinc-400', login_failed: 'bg-red-500',
  login_blocked: 'bg-red-500', created: 'bg-brand-500', updated: 'bg-amber-500',
  deleted: 'bg-red-400', deleted_all: 'bg-red-600', imported: 'bg-violet-500',
  password_changed: 'bg-sky-500', password_reset: 'bg-sky-500',
}
const ACTION_BADGE = {
  login: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  logout: 'text-zinc-500 bg-zinc-200 dark:bg-zinc-700/50',
  login_failed: 'text-red-500 dark:text-red-400 bg-red-500/10',
  login_blocked: 'text-red-500 dark:text-red-400 bg-red-500/10',
  created: 'text-brand-500 dark:text-brand-400 bg-brand-500/10',
  updated: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  deleted: 'text-red-500 dark:text-red-400 bg-red-500/10',
  deleted_all: 'text-red-500 dark:text-red-400 bg-red-500/15',
  imported: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
  password_changed: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
  password_reset: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
}
const MODULE_LABEL = {
  auth: 'Auth', users: 'Users', systems: 'Systems', network_devices: 'Network',
  mobiles: 'Mobiles', sims: 'SIMs', gws_accounts: 'Cloud IDs', employees: 'Employees',
}
function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function Activity24h({ logs, loading }) {
  const entries = logs || []
  return (
    <div className="card overflow-hidden h-full flex flex-col">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        <ScrollText size={14} className="text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Last 24 Hours</h3>
        {!loading && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium">
            {entries.length} event{entries.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-zinc-400">No activity in the last 24 hours</div>
      ) : (
        <div className="overflow-y-auto flex-1 divide-y divide-zinc-100 dark:divide-zinc-800/40" style={{ maxHeight: 280 }}>
          {entries.map((a, i) => (
            <div key={a.id ?? i} className="flex items-start gap-3 px-5 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${ACTION_DOT[a.action] || 'bg-zinc-400'}`} />
              <div className="flex-1 min-w-0 flex items-start gap-2 flex-wrap">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200 shrink-0">{a.user_name || a.user_email || 'Unknown'}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${ACTION_BADGE[a.action] || 'text-zinc-500 bg-zinc-100 dark:bg-zinc-700/50'}`}>
                  {a.action?.replace(/_/g, ' ')}
                </span>
                {a.table_name && <span className="text-[10px] text-zinc-400 shrink-0">{MODULE_LABEL[a.table_name] || a.table_name}</span>}
                {a.record_label && <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{a.record_label}</span>}
              </div>
              <span className="text-[10px] text-zinc-400 flex-shrink-0 mt-0.5 whitespace-nowrap">{timeAgo(a.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Network content ───────────────────────────────────────
function NetworkContent({ open, navigate }) {
  const { rows, fetching } = useLazyRows('/api/network', open)
  const cols = [
    { key: 'asset_tag',   label: 'Asset Tag' },
    { key: 'device_type', label: 'Type' },
    { key: 'brand',       label: 'Brand / Model', render: (_, r) => `${r.brand||''} ${r.model||''}`.trim() || '—' },
    { key: 'ip_address',  label: 'IP Address' },
    { key: 'mac_address', label: 'MAC Address' },
    { key: 'location',    label: 'Location' },
    { key: 'status',      label: 'Status', render: v => <Badge status={v}>{v||'—'}</Badge> },
  ]
  return <MiniTable columns={cols} rows={rows} fetching={fetching} path="/network" navigate={navigate} />
}

// ── Inventory section content ─────────────────────────────
function InventoryContent({ stats, open, navigate }) {
  const { rows, fetching } = useLazyRows('/api/inventory/items', open)
  if (!stats) return null
  const cols = [
    { key: 'name',          label: 'Item' },
    { key: 'category_name', label: 'Category' },
    { key: 'sku',           label: 'SKU' },
    { key: 'qty_available', label: 'Available', render: v => <span className={cn('font-semibold', Number(v)===0 ? 'text-red-500' : Number(v) <= 5 ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400')}>{v??0}</span> },
    { key: 'qty_assigned',  label: 'Assigned' },
    { key: 'stock_status',  label: 'Stock', render: v => <Badge status={v === 'out_of_stock' ? 'retired' : v === 'low_stock' ? 'repair' : 'available'}>{(v||'').replace(/_/g,' ')}</Badge> },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Items in Catalog', value: stats.total_items,     color: 'text-brand-500 dark:text-brand-400',   bg: 'bg-brand-500/10' },
          { label: 'Available Stock',  value: stats.total_available, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Currently Assigned', value: stats.total_assigned, color: 'text-sky-600 dark:text-sky-400',       bg: 'bg-sky-500/10' },
          { label: 'Pending Requests', value: stats.pending_requests, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10' },
        ].map((s, i) => (
          <div key={i} className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-lg ${s.bg}`}>
            <span className={`text-xl font-bold ${s.color}`}>{s.value ?? 0}</span>
            <span className={`text-xs ${s.color} opacity-80`}>{s.label}</span>
          </div>
        ))}
      </div>
      {(stats.low_stock > 0 || stats.out_of_stock > 0) && (
        <div className="flex items-center gap-4 text-sm">
          {stats.out_of_stock > 0 && (
            <span className="flex items-center gap-1.5 text-red-500">
              <AlertTriangleIcon size={13} />
              <strong>{stats.out_of_stock}</strong> item{stats.out_of_stock !== 1 ? 's' : ''} out of stock
            </span>
          )}
          {stats.low_stock > 0 && (
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <AlertTriangleIcon size={13} />
              <strong>{stats.low_stock}</strong> item{stats.low_stock !== 1 ? 's' : ''} low on stock
            </span>
          )}
        </div>
      )}
      <MiniTable columns={cols} rows={rows} fetching={fetching} path="/inventory" navigate={navigate} />
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState(null)
  const [empCount, setEmpCount] = useState(null)
  const [invStats, setInvStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openSection, setOpenSection] = useState(null)
  const { toast } = useToast()
  const { canPerm } = useAuth()
  const navigate = useNavigate()

  function toggle(id) { setOpenSection(o => o === id ? null : id) }

  function load() {
    setLoading(true)
    Promise.all([
      api.get('/api/reports/dashboard'),
      api.get('/api/employees').catch(() => []),
      canPerm('inventory', 'read') ? api.get('/api/inventory/stats').catch(() => null) : Promise.resolve(null),
    ]).then(([dash, emps, inv]) => {
      setData(dash)
      setEmpCount(Array.isArray(emps) ? emps.length : null)
      setInvStats(inv)
    }).catch(e => toast(e.message, 'error'))
    .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const handler = (e) => { if (e.detail?.action === 'refresh') load() }
    window.addEventListener('module-action', handler)
    return () => window.removeEventListener('module-action', handler)
  }, [])

  const systemsTotal = Number(data?.systems?.assignment?.total) || 0
  const mobilesTotal = Number(data?.mobiles?.assignment?.total) || 0
  const simsTotal    = Number(data?.sims?.assignment?.total) || 0
  const networkTotal = (data?.networkDevices || []).reduce((a, r) => a + Number(r.n), 0)
  const gwsTotal     = (data?.gws || []).reduce((a, r) => a + Number(r.n), 0)
  const employeesTotal = data?.employees?.active ?? empCount

  const allStats = [
    { label: 'Systems',         value: systemsTotal,    icon: Monitor,    color: 'brand',   module: 'systems'   },
    { label: 'Network Devices', value: networkTotal,    icon: Network,    color: 'sky',     module: 'network'   },
    { label: 'Mobile Devices',  value: mobilesTotal,    icon: Smartphone, color: 'emerald', module: 'mobiles'   },
    { label: 'SIM Cards',       value: simsTotal,       icon: CreditCard, color: 'purple',  module: 'sims'      },
    { label: 'Cloud IDs',       value: gwsTotal,        icon: Cloud,      color: 'cyan',    module: 'gws'       },
    { label: 'Employees',       value: employeesTotal,  icon: Users,      color: 'amber',   module: 'employees' },
  ]
  const stats = allStats.filter(s => canPerm(s.module, 'read'))

  const netByType = (data?.networkDevices || []).map(r => ({ name: r.device_type, value: Number(r.n) }))

  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((s, i) => <StatsCard key={i} {...s} loading={loading} />)}
      </div>

      {/* Accordion sections */}
      {canPerm('systems', 'read') && (
        <AccordionSection id="systems" open={openSection === 'systems'} onToggle={() => toggle('systems')}
          icon={Monitor} iconColor="text-brand-500 dark:text-brand-400" title="Systems"
          badge={systemsTotal} delay={0.05} loading={loading}>
          <SystemsContent data={data?.systems} open={openSection === 'systems'} navigate={navigate} />
        </AccordionSection>
      )}

      {canPerm('network', 'read') && (
        <AccordionSection id="network" open={openSection === 'network'} onToggle={() => toggle('network')}
          icon={Network} iconColor="text-sky-600 dark:text-sky-400" title="Network Devices"
          badge={networkTotal} delay={0.065} loading={loading}>
          <NetworkContent open={openSection === 'network'} navigate={navigate} />
        </AccordionSection>
      )}

      {canPerm('mobiles', 'read') && (
        <AccordionSection id="mobiles" open={openSection === 'mobiles'} onToggle={() => toggle('mobiles')}
          icon={Smartphone} iconColor="text-emerald-600 dark:text-emerald-400" title="Mobile Devices"
          badge={mobilesTotal} delay={0.08} loading={loading}>
          <MobilesContent data={data?.mobiles} open={openSection === 'mobiles'} navigate={navigate} />
        </AccordionSection>
      )}

      {canPerm('sims', 'read') && (
        <AccordionSection id="sims" open={openSection === 'sims'} onToggle={() => toggle('sims')}
          icon={CreditCard} iconColor="text-purple-600 dark:text-purple-400" title="SIM Cards"
          badge={simsTotal} delay={0.11} loading={loading}>
          <SIMsContent data={data?.sims} open={openSection === 'sims'} navigate={navigate} />
        </AccordionSection>
      )}

      {canPerm('employees', 'read') && (
        <AccordionSection id="employees" open={openSection === 'employees'} onToggle={() => toggle('employees')}
          icon={Users} iconColor="text-amber-600 dark:text-amber-400" title="Employees"
          badge={employeesTotal} delay={0.14} loading={loading}>
          <EmployeesContent data={data?.employees} open={openSection === 'employees'} navigate={navigate} />
        </AccordionSection>
      )}

      {canPerm('inventory', 'read') && invStats && (
        <AccordionSection id="inventory" open={openSection === 'inventory'} onToggle={() => toggle('inventory')}
          icon={Package} iconColor="text-teal-600 dark:text-teal-400" title="Inventory Stock"
          badge={invStats.pending_requests > 0 ? `${invStats.pending_requests} pending` : invStats.total_items}
          delay={0.17} loading={loading}>
          <InventoryContent stats={invStats} open={openSection === 'inventory'} navigate={navigate} />
        </AccordionSection>
      )}

      {/* Network chart + 24h log side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {canPerm('network', 'read') && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.20 }} className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} className="text-sky-500 dark:text-sky-400" />
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Network Devices by Type</h3>
            </div>
            {loading ? (
              <div className="h-48 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : netByType.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={netByType} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<Tip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                  <Bar dataKey="value" name="Devices" radius={[4,4,0,0]}>
                    {netByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-sm text-zinc-400">No data yet</div>
            )}
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Activity24h logs={data?.activity24h} loading={loading} />
        </motion.div>
      </div>

      {/* Warranty alerts */}
      {canPerm('systems', 'read') && data && (data.warrantyExpired > 0 || data.warrantySoon > 0) && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.23 }} className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} className="text-amber-500 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Warranty Alerts</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <span className="text-sm text-red-600 dark:text-red-300">Warranties Expired</span>
              <span className="text-lg font-bold text-red-500 dark:text-red-400">{data.warrantyExpired}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="text-sm text-amber-600 dark:text-amber-300">Expiring in 90 days</span>
              <span className="text-lg font-bold text-amber-500 dark:text-amber-400">{data.warrantySoon}</span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
