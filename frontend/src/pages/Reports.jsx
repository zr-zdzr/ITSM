import React, { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileDown, AlertTriangle, Package, Users, Monitor, Smartphone,
  CreditCard, ChevronDown, Search, Building2, Wrench, FileText, BarChart3,
  PackageCheck, Network, DollarSign,
} from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { cn } from '../lib/utils'

// ── PDF export helper ─────────────────────────────────────
async function exportPDF(title, head, body) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: body[0]?.length > 6 ? 'landscape' : 'portrait' })
  doc.setFontSize(13)
  doc.setTextColor(40, 40, 40)
  doc.text(title, 14, 16)
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text(`Bykea IT  ·  Generated ${new Date().toLocaleString('en-GB')}`, 14, 23)
  autoTable(doc, {
    startY: 28,
    head: [head],
    body,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 252] },
    margin: { left: 14, right: 14 },
  })
  doc.save(`${title.toLowerCase().replace(/\s+/g, '-')}.pdf`)
}

function fmtDate(v) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Status badge ──────────────────────────────────────────
const STATUS_STYLE = {
  in_use:    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  available: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  repair:    'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  retired:   'bg-zinc-200 dark:bg-zinc-700/50 text-zinc-500',
  active:    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  inactive:  'bg-red-500/10 text-red-500 dark:text-red-400',
  suspended: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
}
function StatusBadge({ v }) {
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', STATUS_STYLE[v] || 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500')}>
      {v?.replace('_', ' ') || '—'}
    </span>
  )
}

// ── Th / Td helpers ───────────────────────────────────────
const Th = ({ children }) => (
  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{children}</th>
)
const Td = ({ children, mono, dim }) => (
  <td className={cn('px-3 py-2.5 text-xs whitespace-nowrap',
    mono ? 'font-mono text-zinc-500' : dim ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-700 dark:text-zinc-300'
  )}>{children ?? '—'}</td>
)

// ── Search + filter bar ───────────────────────────────────
function FilterBar({ search, onSearch, children }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        <input value={search} onChange={e => onSearch(e.target.value)}
          placeholder="Search…" className="input-base pl-8 py-1.5 text-xs" />
      </div>
      {children}
    </div>
  )
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="input-base py-1.5 text-xs min-w-[140px]">
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function ExportBtn({ label, icon: Icon = FileDown, onClick, variant = 'secondary' }) {
  return (
    <button onClick={onClick}
      className={cn('btn-base py-1.5 text-xs gap-1.5', variant === 'primary' ? 'btn-primary' : 'btn-secondary')}>
      <Icon size={13} /> {label}
    </button>
  )
}

// ── Tab bar ───────────────────────────────────────────────
const TABS = [
  { id: 'employee-assets', label: 'Employee Assets',    icon: Users },
  { id: 'warranty',        label: 'Warranty',           icon: AlertTriangle },
  { id: 'unassigned',      label: 'Unassigned',         icon: Package },
  { id: 'damage',          label: 'Damage & Repair',    icon: Wrench },
  { id: 'department',      label: 'Department Summary', icon: Building2 },
  { id: 'inv-stock',       label: 'Inventory Stock',    icon: Network },
  { id: 'inv-assignments', label: 'Inv. Assignments',   icon: PackageCheck },
  { id: 'sim-costs',       label: 'SIM Costs',          icon: CreditCard },
  { id: 'cost-analytics',  label: 'Cost Analytics',     icon: DollarSign },
  { id: 'full-export',     label: 'Full Export',        icon: FileText },
]

// ── EMPLOYEE ASSETS TAB ───────────────────────────────────
function EmployeeAssetsTab({ filterOpts, toast }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState('')
  const [loc, setLoc] = useState('')
  const [expanded, setExpanded] = useState(null)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (dept) params.set('department', dept)
    if (loc)  params.set('location', loc)
    try {
      const data = await api.get(`/api/reports/employee-assets?${params}`)
      setRows(data)
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [dept, loc])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.designation?.toLowerCase().includes(q) ||
      r.department?.toLowerCase().includes(q)
    )
  }, [rows, search])

  function csvExport() {
    const params = new URLSearchParams()
    if (dept) params.set('department', dept)
    if (loc)  params.set('location', loc)
    api.download(`/api/reports/employee-assets/csv?${params}`, 'employee-assets.csv')
      .catch(e => toast(e.message, 'error'))
  }

  async function pdfExport() {
    const head = ['Employee', 'Designation', 'Department', 'Location', 'Asset Type', 'Asset Tag / Number', 'Brand', 'Model', 'Status']
    const body = []
    filtered.forEach(emp => {
      const name = `${emp.first_name} ${emp.last_name}`
      const base = [name, emp.designation || '', emp.department || '', emp.location || '']
      ;(emp.systems || []).forEach(s => body.push([...base, s.type || 'System', s.asset_tag || '', s.manufacturer || '', s.model || '', s.status || '']))
      ;(emp.mobiles || []).forEach(m => body.push([...base, 'Mobile', m.asset_tag || '', m.manufacturer || '', m.model || '', m.status || '']))
      ;(emp.sims    || []).forEach(s => body.push([...base, 'SIM Card', s.phone_number || '', s.vendor || '', s.package_name || '', s.status || '']))
      if (!emp.systems?.length && !emp.mobiles?.length && !emp.sims?.length)
        body.push([...base, '—', '—', '—', '—', '—'])
    })
    await exportPDF('Employee Asset Report', head, body)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <FilterBar search={search} onSearch={setSearch}>
          <Select value={dept} onChange={setDept} options={filterOpts.departments} placeholder="All Departments" />
          <Select value={loc}  onChange={setLoc}  options={filterOpts.locations}   placeholder="All Locations" />
        </FilterBar>
        <div className="flex gap-2">
          <ExportBtn label="CSV" onClick={csvExport} />
          <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
        </div>
      </div>

      <p className="text-xs text-zinc-500">{filtered.length} employee{filtered.length !== 1 ? 's' : ''}</p>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-200 dark:border-zinc-800">
              <Th></Th><Th>Employee</Th><Th>Designation</Th><Th>Department</Th><Th>Location</Th>
              <Th>Systems</Th><Th>Mobiles</Th><Th>SIMs</Th><Th>Total</Th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-zinc-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-zinc-400">No records found</td></tr>
              ) : filtered.map(emp => {
                const sysCount = emp.systems?.length || 0
                const mobCount = emp.mobiles?.length || 0
                const simCount = emp.sims?.length || 0
                const total = sysCount + mobCount + simCount
                const isOpen = expanded === emp.id
                return (
                  <React.Fragment key={emp.id}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : emp.id)}
                      className={cn('border-b border-zinc-100 dark:border-zinc-800/50 cursor-pointer transition-colors',
                        isOpen ? 'bg-brand-500/5' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/20'
                      )}
                    >
                      <td className="px-3 py-2.5 w-8">
                        <ChevronDown size={13} className={cn('text-zinc-400 transition-transform', isOpen && 'rotate-180')} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{emp.first_name} {emp.last_name}</div>
                        <div className="text-[10px] text-zinc-400">{emp.email}</div>
                      </td>
                      <Td dim>{emp.designation}</Td>
                      <Td dim>{emp.department}</Td>
                      <Td dim>{emp.location}</Td>
                      <td className="px-3 py-2.5">
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', sysCount > 0 ? 'bg-brand-500/10 text-brand-500 dark:text-brand-400' : 'text-zinc-400')}>{sysCount}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', mobCount > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-zinc-400')}>{mobCount}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', simCount > 0 ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'text-zinc-400')}>{simCount}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn('text-xs font-bold', total > 0 ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-400')}>{total}</span>
                      </td>
                    </tr>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <tr key="detail">
                          <td colSpan={9} className="p-0 border-b border-zinc-200 dark:border-zinc-800">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
                              className="overflow-hidden bg-zinc-50 dark:bg-zinc-900/60"
                            >
                              <div className="px-8 py-4 space-y-4">
                                {/* Systems */}
                                {sysCount > 0 && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-brand-500 dark:text-brand-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Monitor size={10} /> Systems</p>
                                    <div className="overflow-x-auto">
                                      <table className="text-xs w-full">
                                        <thead><tr className="border-b border-zinc-200 dark:border-zinc-800">
                                          <Th>Asset Tag</Th><Th>Type</Th><Th>Brand</Th><Th>Model</Th><Th>Serial</Th><Th>Gen</Th><Th>Status</Th><Th>Condition</Th><Th>Location</Th>
                                        </tr></thead>
                                        <tbody>{emp.systems.map((s, i) => (
                                          <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/30">
                                            <Td mono>{s.asset_tag}</Td><Td>{s.type}</Td><Td>{s.manufacturer}</Td><Td>{s.model}</Td>
                                            <Td mono>{s.serial_number}</Td><Td dim>{s.generation}</Td>
                                            <td className="px-3 py-2"><StatusBadge v={s.status} /></td>
                                            <Td dim>{s.condition}</Td><Td dim>{s.location}</Td>
                                          </tr>
                                        ))}</tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                                {/* Mobiles */}
                                {mobCount > 0 && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Smartphone size={10} /> Mobile Devices</p>
                                    <div className="overflow-x-auto">
                                      <table className="text-xs w-full">
                                        <thead><tr className="border-b border-zinc-200 dark:border-zinc-800">
                                          <Th>Asset Tag</Th><Th>Brand</Th><Th>Model</Th><Th>OS</Th><Th>Storage</Th><Th>Status</Th><Th>Condition</Th>
                                        </tr></thead>
                                        <tbody>{emp.mobiles.map((m, i) => (
                                          <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/30">
                                            <Td mono>{m.asset_tag}</Td><Td>{m.manufacturer}</Td><Td>{m.model}</Td>
                                            <Td dim>{m.os}</Td><Td dim>{m.storage_capacity}</Td>
                                            <td className="px-3 py-2"><StatusBadge v={m.status} /></td>
                                            <Td dim>{m.condition}</Td>
                                          </tr>
                                        ))}</tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                                {/* SIMs */}
                                {simCount > 0 && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><CreditCard size={10} /> SIM Cards</p>
                                    <div className="overflow-x-auto">
                                      <table className="text-xs w-full">
                                        <thead><tr className="border-b border-zinc-200 dark:border-zinc-800">
                                          <Th>Phone Number</Th><Th>Vendor</Th><Th>Package</Th><Th>Service Type</Th><Th>Status</Th>
                                        </tr></thead>
                                        <tbody>{emp.sims.map((s, i) => (
                                          <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/30">
                                            <Td mono>{s.phone_number}</Td><Td>{s.vendor}</Td>
                                            <Td dim>{s.package_name}</Td><Td dim>{s.service_type}</Td>
                                            <td className="px-3 py-2"><StatusBadge v={s.status} /></td>
                                          </tr>
                                        ))}</tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                                {total === 0 && <p className="text-xs text-zinc-400 italic">No assets assigned</p>}
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── WARRANTY TAB ──────────────────────────────────────────
const WARRANTY_CAT_STYLE = {
  System:  'bg-brand-500/10 text-brand-500 dark:text-brand-400',
  Mobile:  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  Network: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
}

function WarrantyTab({ toast }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('')

  useEffect(() => {
    api.get('/api/reports/warranty').then(setRows).catch(e => toast(e.message, 'error')).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let out = rows
    if (filter === 'expired') out = out.filter(r => Number(r.days_remaining) < 0)
    else if (filter === '30') out = out.filter(r => Number(r.days_remaining) >= 0 && Number(r.days_remaining) <= 30)
    else if (filter === '90') out = out.filter(r => Number(r.days_remaining) >= 0 && Number(r.days_remaining) <= 90)
    if (catFilter) out = out.filter(r => r.category === catFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(r => [r.asset_tag, r.manufacturer, r.model, r.assigned_user_name, r.type].some(v => v?.toLowerCase().includes(q)))
    }
    return out
  }, [rows, filter, catFilter, search])

  function csvExport() { api.download('/api/reports/warranty/csv', 'warranty-report.csv').catch(e => toast(e.message, 'error')) }

  async function pdfExport() {
    const head = ['Category', 'Asset Tag', 'Type', 'Brand', 'Model', 'Warranty Expiry', 'Days Left', 'Status', 'Assigned To']
    const body = filtered.map(r => [
      r.category || '', r.asset_tag || '', r.type || '', r.manufacturer || '', r.model || '',
      fmtDate(r.warranty_expiry), String(r.days_remaining ?? ''), r.status || '', r.assigned_user_name || 'N/A',
    ])
    await exportPDF('Warranty Report', head, body)
  }

  const warningColor = (days) => {
    const d = Number(days)
    if (d < 0) return 'text-red-500 dark:text-red-400'
    if (d <= 30) return 'text-red-400'
    if (d <= 90) return 'text-amber-500 dark:text-amber-400'
    return 'text-zinc-600 dark:text-zinc-400'
  }

  const cats = [...new Set(rows.map(r => r.category).filter(Boolean))]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <FilterBar search={search} onSearch={setSearch}>
          <Select value={catFilter} onChange={setCatFilter} options={cats} placeholder="All categories" />
          <Select value={filter} onChange={setFilter} options={['expired','30','90']} placeholder="All warranties" />
        </FilterBar>
        <div className="flex gap-2">
          <ExportBtn label="CSV" onClick={csvExport} />
          <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
        </div>
      </div>
      <p className="text-xs text-zinc-500">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
      <div className="card overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-zinc-200 dark:border-zinc-800">
            <Th>Category</Th><Th>Asset Tag</Th><Th>Type</Th><Th>Brand</Th><Th>Model</Th>
            <Th>Warranty Expiry</Th><Th>Days Left</Th><Th>Status</Th><Th>Assigned To</Th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="py-12 text-center text-zinc-400">Loading…</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={9} className="py-12 text-center text-zinc-400">No records</td></tr>
            : filtered.map((r, i) => (
              <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                <td className="px-3 py-2.5">
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', WARRANTY_CAT_STYLE[r.category] || 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500')}>{r.category}</span>
                </td>
                <Td mono>{r.asset_tag}</Td><Td>{r.type}</Td><Td dim>{r.manufacturer}</Td><Td dim>{r.model}</Td>
                <td className="px-3 py-2.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">{fmtDate(r.warranty_expiry)}</td>
                <td className={cn('px-3 py-2.5 text-xs font-bold', warningColor(r.days_remaining))}>
                  {Number(r.days_remaining) < 0 ? `${Math.abs(r.days_remaining)}d expired` : `${r.days_remaining}d`}
                </td>
                <td className="px-3 py-2.5"><StatusBadge v={r.status} /></td>
                <Td dim>{r.assigned_user_name || '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </div>
  )
}

// ── UNASSIGNED TAB ────────────────────────────────────────
function UnassignedTab({ toast }) {
  const [data, setData] = useState({ systems: [], mobiles: [], sims: [] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')

  useEffect(() => {
    api.get('/api/reports/unassigned').then(setData).catch(e => toast(e.message, 'error')).finally(() => setLoading(false))
  }, [])

  const all = useMemo(() => {
    const merged = [
      ...(data.systems || []),
      ...(data.mobiles || []),
      ...(data.sims || []),
    ]
    let out = type === 'all' ? merged : merged.filter(r => r.category === (type === 'system' ? 'System' : type === 'mobile' ? 'Mobile' : 'SIM Card'))
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(r => [r.asset_tag, r.manufacturer, r.model, r.serial_number, r.type].some(v => v?.toLowerCase().includes(q)))
    }
    return out
  }, [data, search, type])

  async function pdfExport() {
    const head = ['Category', 'Asset Tag', 'Type', 'Brand', 'Model', 'Serial / Number', 'Status', 'Condition', 'Location']
    const body = all.map(r => [r.category || '', r.asset_tag || '', r.type || '', r.manufacturer || '', r.model || '', r.serial_number || '', r.status || '', r.condition || '', r.location || ''])
    await exportPDF('Unassigned Inventory', head, body)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <FilterBar search={search} onSearch={setSearch}>
          <Select value={type} onChange={setType} options={['system','mobile','sim']} placeholder="All types" />
        </FilterBar>
        <div className="flex gap-2">
          <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
        </div>
      </div>
      <div className="flex gap-4 text-xs text-zinc-500">
        <span><span className="font-semibold text-brand-500 dark:text-brand-400">{data.systems?.length}</span> Systems</span>
        <span><span className="font-semibold text-emerald-600 dark:text-emerald-400">{data.mobiles?.length}</span> Mobiles</span>
        <span><span className="font-semibold text-purple-600 dark:text-purple-400">{data.sims?.length}</span> SIM Cards</span>
      </div>
      <div className="card overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-zinc-200 dark:border-zinc-800">
            <Th>Category</Th><Th>Asset Tag</Th><Th>Type</Th><Th>Brand</Th><Th>Model</Th><Th>Serial / Number</Th><Th>Status</Th><Th>Condition</Th><Th>Location</Th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="py-12 text-center text-zinc-400">Loading…</td></tr>
            : all.length === 0 ? <tr><td colSpan={9} className="py-12 text-center text-zinc-400">No unassigned assets</td></tr>
            : all.map((r, i) => (
              <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                <td className="px-3 py-2.5">
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium',
                    r.category === 'System' ? 'bg-brand-500/10 text-brand-500 dark:text-brand-400' :
                    r.category === 'Mobile' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                    'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                  )}>{r.category}</span>
                </td>
                <Td mono>{r.asset_tag}</Td><Td>{r.type}</Td><Td dim>{r.manufacturer}</Td><Td dim>{r.model}</Td>
                <Td mono>{r.serial_number}</Td>
                <td className="px-3 py-2.5"><StatusBadge v={r.status} /></td>
                <Td dim>{r.condition}</Td><Td dim>{r.location}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </div>
  )
}

// ── DAMAGE TAB ────────────────────────────────────────────
function DamageTab({ toast }) {
  const [data, setData] = useState({ systems: [], mobiles: [] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')

  useEffect(() => {
    api.get('/api/reports/damage').then(setData).catch(e => toast(e.message, 'error')).finally(() => setLoading(false))
  }, [])

  const all = useMemo(() => {
    const merged = [...(data.systems || []), ...(data.mobiles || [])]
    let out = type === 'all' ? merged : merged.filter(r => r.category === (type === 'system' ? 'System' : 'Mobile'))
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(r => [r.asset_tag, r.manufacturer, r.model, r.assigned_to].some(v => v?.toLowerCase().includes(q)))
    }
    return out
  }, [data, search, type])

  async function pdfExport() {
    const head = ['Category', 'Asset Tag', 'Type/OS', 'Brand', 'Model', 'Serial', 'Status', 'Condition', 'Assigned To', 'Notes']
    const body = all.map(r => [r.category || '', r.asset_tag || '', r.type || '', r.manufacturer || '', r.model || '', r.serial_number || '', r.status || '', r.condition || '', r.assigned_to || 'Inventory', r.notes || ''])
    await exportPDF('Damage & Repair Report', head, body)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <FilterBar search={search} onSearch={setSearch}>
          <Select value={type} onChange={setType} options={['system','mobile']} placeholder="All types" />
        </FilterBar>
        <div className="flex gap-2">
          <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
        </div>
      </div>
      <p className="text-xs text-zinc-500">{all.length} item{all.length !== 1 ? 's' : ''}</p>
      <div className="card overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-zinc-200 dark:border-zinc-800">
            <Th>Category</Th><Th>Asset Tag</Th><Th>Brand</Th><Th>Model</Th><Th>Serial</Th><Th>Status</Th><Th>Condition</Th><Th>Assigned To</Th><Th>Notes</Th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="py-12 text-center text-zinc-400">Loading…</td></tr>
            : all.length === 0 ? <tr><td colSpan={9} className="py-12 text-center text-emerald-500">No damaged or repair items</td></tr>
            : all.map((r, i) => (
              <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                <td className="px-3 py-2.5">
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium',
                    r.category === 'System' ? 'bg-brand-500/10 text-brand-500 dark:text-brand-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  )}>{r.category}</span>
                </td>
                <Td mono>{r.asset_tag}</Td><Td>{r.manufacturer}</Td><Td dim>{r.model}</Td><Td mono>{r.serial_number}</Td>
                <td className="px-3 py-2.5"><StatusBadge v={r.status} /></td>
                <td className="px-3 py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-red-500/10 text-red-500 dark:text-red-400">{r.condition || '—'}</span></td>
                <Td dim>{r.assigned_to || 'Inventory'}</Td>
                <td className="px-3 py-2.5 text-xs text-zinc-500 max-w-[200px] truncate" title={r.notes}>{r.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </div>
  )
}

// ── DEPARTMENT SUMMARY TAB ────────────────────────────────
function DepartmentTab({ toast }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/reports/department-summary').then(setRows).catch(e => toast(e.message, 'error')).finally(() => setLoading(false))
  }, [])

  const grouped = useMemo(() => {
    const map = {}
    rows.forEach(r => {
      if (!map[r.dept]) map[r.dept] = {}
      map[r.dept][r.category] = r
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [rows])

  const cats = ['Systems', 'Mobiles', 'SIM Cards']

  async function pdfExport() {
    const head = ['Department', 'Category', 'Total', 'Assigned', 'Inventory']
    const body = rows.map(r => [r.dept, r.category, String(r.total), String(r.assigned), String(r.inventory)])
    await exportPDF('Department Asset Summary', head, body)
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
      </div>
      <div className="card overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-zinc-200 dark:border-zinc-800">
            <Th>Department</Th>
            {cats.map(c => (
              <React.Fragment key={c}>
                <Th>{c} Total</Th><Th>Assigned</Th><Th>Inventory</Th>
              </React.Fragment>
            ))}
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={10} className="py-12 text-center text-zinc-400">Loading…</td></tr>
            : grouped.length === 0 ? <tr><td colSpan={10} className="py-12 text-center text-zinc-400">No data</td></tr>
            : grouped.map(([dept, catMap]) => (
              <tr key={dept} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                <td className="px-3 py-2.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">{dept}</td>
                {cats.map(c => {
                  const d = catMap[c] || {}
                  return (
                    <React.Fragment key={c}>
                      <td className="px-3 py-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-300">{d.total ?? 0}</td>
                      <td className="px-3 py-2.5 text-xs text-brand-500 dark:text-brand-400">{d.assigned ?? 0}</td>
                      <td className="px-3 py-2.5 text-xs text-zinc-400">{d.inventory ?? 0}</td>
                    </React.Fragment>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </div>
  )
}

// ── SIM COSTS TAB ─────────────────────────────────────────
function SIMCostsTab({ toast }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/reports/sim-costs').then(setRows).catch(e => toast(e.message, 'error')).finally(() => setLoading(false))
  }, [])

  const total = rows.reduce((a, r) => a + Number(r.total_monthly || 0), 0)

  function csvExport() { api.download('/api/reports/sim-costs/csv', 'sim-costs.csv').catch(e => toast(e.message, 'error')) }

  async function pdfExport() {
    const head = ['Vendor', 'Active SIMs', 'Monthly Cost (PKR)']
    const body = rows.map(r => [r.vendor, String(r.count), Number(r.total_monthly || 0).toLocaleString()])
    body.push(['TOTAL', String(rows.reduce((a, r) => a + Number(r.count), 0)), total.toLocaleString()])
    await exportPDF('SIM Cost Analysis', head, body)
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <ExportBtn label="CSV" onClick={csvExport} />
        <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
      </div>
      <div className="card overflow-hidden max-w-lg">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Total monthly spend (active SIMs)</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
            PKR {total.toLocaleString()}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-200 dark:border-zinc-800">
              <Th>Vendor</Th><Th>Active SIMs</Th><Th>Monthly Cost (PKR)</Th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={3} className="py-12 text-center text-zinc-400">Loading…</td></tr>
              : rows.map((r, i) => (
                <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                  <td className="px-3 py-2.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">{r.vendor}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-600 dark:text-zinc-400">{r.count}</td>
                  <td className="px-3 py-2.5 text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    {Number(r.total_monthly || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
              <tr className="bg-zinc-50 dark:bg-zinc-800/30 font-bold">
                <td className="px-3 py-2.5 text-xs text-zinc-700 dark:text-zinc-300">Total</td>
                <td className="px-3 py-2.5 text-xs text-zinc-700 dark:text-zinc-300">{rows.reduce((a, r) => a + Number(r.count), 0)}</td>
                <td className="px-3 py-2.5 text-xs text-brand-500 dark:text-brand-400">PKR {total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── INVENTORY STOCK TAB ───────────────────────────────────
const STOCK_STATUS_STYLE = {
  in_stock:     'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  low_stock:    'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  out_of_stock: 'bg-red-500/10 text-red-500 dark:text-red-400',
}

function InvStockTab({ toast }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    api.get('/api/inventory/items').then(setRows).catch(e => toast(e.message, 'error')).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let out = rows
    if (statusFilter) out = out.filter(r => r.stock_status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(r => [r.name, r.category_name, r.sku, r.model].some(v => v?.toLowerCase().includes(q)))
    }
    return out
  }, [rows, search, statusFilter])

  const totals = useMemo(() => ({
    available: rows.reduce((s, r) => s + Number(r.qty_available || 0), 0),
    assigned:  rows.reduce((s, r) => s + Number(r.qty_assigned || 0), 0),
    damaged:   rows.reduce((s, r) => s + Number(r.qty_damaged || 0), 0),
    low:       rows.filter(r => r.stock_status === 'low_stock').length,
    out:       rows.filter(r => r.stock_status === 'out_of_stock').length,
  }), [rows])

  async function pdfExport() {
    const head = ['Item', 'Category', 'SKU', 'Available', 'Assigned', 'Damaged', 'Reorder At', 'Status']
    const body = filtered.map(r => [
      r.name || '', r.category_name || '', r.sku || '',
      String(r.qty_available ?? 0), String(r.qty_assigned ?? 0), String(r.qty_damaged ?? 0),
      String(r.reorder_level ?? 0), r.stock_status?.replace('_', ' ') || '',
    ])
    await exportPDF('Inventory Stock Report', head, body)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <FilterBar search={search} onSearch={setSearch}>
          <Select value={statusFilter} onChange={setStatusFilter}
            options={['in_stock', 'low_stock', 'out_of_stock']} placeholder="All stock levels" />
        </FilterBar>
        <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { label: 'Available', value: totals.available, cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
          { label: 'Assigned',  value: totals.assigned,  cls: 'text-sky-600 dark:text-sky-400 bg-sky-500/10' },
          { label: 'Damaged',   value: totals.damaged,   cls: 'text-red-500 bg-red-500/10' },
          { label: 'Low Stock', value: totals.low,        cls: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
          { label: 'Out of Stock', value: totals.out,    cls: 'text-red-500 bg-red-500/10' },
        ].map((p, i) => (
          <span key={i} className={cn('px-2.5 py-1.5 rounded-lg font-semibold', p.cls)}>
            {p.value} <span className="font-normal opacity-80">{p.label}</span>
          </span>
        ))}
      </div>

      <p className="text-xs text-zinc-500">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</p>
      <div className="card overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-zinc-200 dark:border-zinc-800">
            <Th>Item</Th><Th>Category</Th><Th>SKU</Th>
            <Th>Available</Th><Th>Assigned</Th><Th>Damaged</Th><Th>Reorder At</Th><Th>Status</Th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="py-12 text-center text-zinc-400">Loading…</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={8} className="py-12 text-center text-zinc-400">No items found</td></tr>
            : filtered.map((r, i) => (
              <tr key={i} className={cn('border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors',
                r.stock_status === 'out_of_stock' && 'bg-red-500/5',
                r.stock_status === 'low_stock' && 'bg-amber-500/5')}>
                <td className="px-3 py-2.5">
                  <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{r.name}</div>
                  {r.model && <div className="text-[10px] text-zinc-400">{r.model}</div>}
                </td>
                <Td dim>{r.category_name || '—'}</Td>
                <Td mono>{r.sku || '—'}</Td>
                <td className={cn('px-3 py-2.5 text-xs font-bold',
                  r.qty_available === 0 ? 'text-red-500 dark:text-red-400' :
                  r.qty_available <= r.reorder_level ? 'text-amber-600 dark:text-amber-400' :
                  'text-emerald-600 dark:text-emerald-400')}>{r.qty_available ?? 0}</td>
                <Td>{r.qty_assigned ?? 0}</Td>
                <Td dim>{r.qty_damaged ?? 0}</Td>
                <Td dim>{r.reorder_level ?? 0}</Td>
                <td className="px-3 py-2.5">
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium',
                    STOCK_STATUS_STYLE[r.stock_status] || 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500')}>
                    {r.stock_status?.replace(/_/g, ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </div>
  )
}

// ── INV. ASSIGNMENTS TAB ──────────────────────────────────
const ASN_STATUS_STYLE = {
  active:              'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  partially_returned:  'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  fully_returned:      'bg-zinc-200 dark:bg-zinc-700/50 text-zinc-500',
}

function InvAssignmentsTab({ toast }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    try {
      const data = await api.get(`/api/assignments?${params}`)
      setRows(data)
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [statusFilter])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      [r.asn_number, r.assignee_name, r.department, r.assigned_by_name].some(v => v?.toLowerCase().includes(q))
    )
  }, [rows, search])

  async function pdfExport() {
    const head = ['ASN #', 'Employee', 'Department', 'Assigned By', 'Assigned Date', 'Return By', 'Status']
    const body = filtered.map(r => [
      r.asn_number || '', r.assignee_name || '', r.department || '',
      r.assigned_by_name || '', fmtDate(r.assigned_date), fmtDate(r.expected_return_date),
      r.status?.replace(/_/g, ' ') || '',
    ])
    await exportPDF('Inventory Assignments Report', head, body)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <FilterBar search={search} onSearch={setSearch}>
          <Select value={statusFilter} onChange={setStatusFilter}
            options={['active', 'partially_returned', 'fully_returned']} placeholder="Active only" />
        </FilterBar>
        <ExportBtn label="PDF" onClick={pdfExport} variant="primary" />
      </div>
      <p className="text-xs text-zinc-500">{filtered.length} assignment{filtered.length !== 1 ? 's' : ''}</p>
      <div className="card overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-zinc-200 dark:border-zinc-800">
            <Th>ASN #</Th><Th>Employee</Th><Th>Department</Th><Th>Assigned By</Th>
            <Th>Date</Th><Th>Return By</Th><Th>Status</Th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="py-12 text-center text-zinc-400">Loading…</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={7} className="py-12 text-center text-zinc-400">No assignments found</td></tr>
            : filtered.map((r, i) => (
              <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                <Td mono>{r.asn_number}</Td>
                <td className="px-3 py-2.5">
                  <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{r.assignee_name}</div>
                  {r.designation && <div className="text-[10px] text-zinc-400">{r.designation}</div>}
                </td>
                <Td dim>{r.department || '—'}</Td>
                <Td dim>{r.assigned_by_name}</Td>
                <td className="px-3 py-2.5 text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{fmtDate(r.assigned_date)}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  {r.expected_return_date
                    ? <span className={cn(new Date(r.expected_return_date) < new Date() && r.status === 'active' ? 'text-red-500 font-medium' : 'text-zinc-400')}>
                        {fmtDate(r.expected_return_date)}
                      </span>
                    : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium',
                    ASN_STATUS_STYLE[r.status] || 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500')}>
                    {r.status?.replace(/_/g, ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </div>
  )
}

// ── COST ANALYTICS TAB ───────────────────────────────────
function CostAnalyticsTab({ toast }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/reports/cost-analytics')
      .then(setData)
      .catch(e => toast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [])

  function fmtPKR(v) {
    const n = Number(v || 0)
    if (n >= 1_000_000) return `PKR ${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000)     return `PKR ${(n / 1_000).toFixed(1)}K`
    return `PKR ${n.toLocaleString()}`
  }

  if (loading) return <div className="py-16 text-center text-zinc-400 text-sm">Loading…</div>
  if (!data)   return null

  const totalMaint = data.maintenanceByType.reduce((s, r) => s + Number(r.total_cost || 0), 0)

  const TYPE_COLOR = {
    system:  'bg-brand-500/10 text-brand-500',
    mobile:  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    network: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="card p-4 space-y-1">
          <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Total Maintenance Spend</p>
          <p className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">{fmtPKR(totalMaint)}</p>
          <p className="text-xs text-zinc-400">all time</p>
        </div>
        <div className="card p-4 space-y-1">
          <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">SIM Monthly Cost</p>
          <p className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">{fmtPKR(data.simMonthlyTotal)}</p>
          <p className="text-xs text-zinc-400">active SIMs / month</p>
        </div>
        <div className="card p-4 space-y-1">
          <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Est. Annual SIM Cost</p>
          <p className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">{fmtPKR(data.simMonthlyTotal * 12)}</p>
          <p className="text-xs text-zinc-400">projected</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Maintenance by asset type */}
        <div className="card p-4 space-y-3">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Maintenance Cost by Asset Type</p>
          {data.maintenanceByType.length === 0
            ? <p className="text-xs text-zinc-400 py-4 text-center">No maintenance costs recorded</p>
            : data.maintenanceByType.map((r, i) => {
                const pct = totalMaint > 0 ? (Number(r.total_cost) / totalMaint) * 100 : 0
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium capitalize',
                        TYPE_COLOR[r.asset_type] || 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500')}>
                        {r.asset_type}
                      </span>
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">{fmtPKR(r.total_cost)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-zinc-400">{r.events} event{r.events !== '1' ? 's' : ''} · {pct.toFixed(1)}%</p>
                  </div>
                )
              })
          }
        </div>

        {/* SIM costs by vendor */}
        <div className="card p-4 space-y-3">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">SIM Monthly Cost by Vendor</p>
          {data.simByVendor.length === 0
            ? <p className="text-xs text-zinc-400 py-4 text-center">No active SIMs with monthly rates</p>
            : data.simByVendor.map((r, i) => {
                const pct = data.simMonthlyTotal > 0
                  ? (Number(r.monthly_total) / data.simMonthlyTotal) * 100 : 0
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-700 dark:text-zinc-300 font-medium">{r.vendor || 'Unknown'}</span>
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">{fmtPKR(r.monthly_total)}/mo</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-zinc-400">{r.sim_count} SIM{r.sim_count !== '1' ? 's' : ''} · {pct.toFixed(1)}%</p>
                  </div>
                )
              })
          }
        </div>
      </div>

      {/* Maintenance by month table */}
      {data.maintenanceByMonth.length > 0 && (
        <div className="card p-4 space-y-3">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Monthly Maintenance Spend (Last 12 Months)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-zinc-200 dark:border-zinc-800">
                <Th>Month</Th><Th>Events</Th><Th>Total Spend</Th>
              </tr></thead>
              <tbody>
                {data.maintenanceByMonth.map((r, i) => (
                  <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20">
                    <Td mono>{r.month}</Td>
                    <Td>{r.events}</Td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-brand-600 dark:text-brand-400">{fmtPKR(r.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── FULL EXPORT TAB ───────────────────────────────────────
function FullExportTab({ toast }) {
  const exports = [
    { label: 'Full Inventory (All Modules)', file: 'full-report.csv', url: '/api/reports/summary/csv', desc: 'Systems, Network, Mobiles, SIMs, Cloud IDs' },
    { label: 'Employee Assets',              file: 'employee-assets.csv', url: '/api/reports/employee-assets/csv', desc: 'All assigned assets per employee' },
    { label: 'Warranty Report',              file: 'warranty-report.csv', url: '/api/reports/warranty/csv', desc: 'All systems with warranty dates' },
    { label: 'SIM Costs',                    file: 'sim-costs.csv', url: '/api/reports/sim-costs/csv', desc: 'Active SIM breakdown with monthly rates' },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
      {exports.map((e, i) => (
        <div key={i} className="card p-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{e.label}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{e.desc}</p>
          </div>
          <button
            onClick={() => api.download(e.url, e.file).catch(err => toast(err.message, 'error'))}
            className="btn-secondary py-1.5 text-xs flex-shrink-0 gap-1.5"
          >
            <FileDown size={13} /> CSV
          </button>
        </div>
      ))}
    </div>
  )
}

// ── MAIN REPORTS PAGE ─────────────────────────────────────
export default function Reports() {
  const { toast } = useToast()
  const { canPerm } = useAuth()
  const [tab, setTab] = useState('employee-assets')
  const [filterOpts, setFilterOpts] = useState({ departments: [], locations: [] })

  useEffect(() => {
    api.get('/api/reports/filter-options').then(setFilterOpts).catch(() => {})

    const handler = e => {
      if (e.detail?.action === 'export')
        api.download('/api/reports/summary/csv', 'full-report.csv').catch(err => toast(err.message, 'error'))
    }
    window.addEventListener('module-action', handler)
    return () => window.removeEventListener('module-action', handler)
  }, [])

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Tab navigation */}
      <div className="flex gap-1 flex-wrap border-b border-zinc-200 dark:border-zinc-800 pb-0">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors -mb-px border-b-2',
                tab === t.id
                  ? 'border-brand-500 text-brand-500 dark:text-brand-400 bg-brand-500/5'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
              )}
            >
              <Icon size={12} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
          {tab === 'employee-assets' && <EmployeeAssetsTab filterOpts={filterOpts} toast={toast} />}
          {tab === 'warranty'        && <WarrantyTab toast={toast} />}
          {tab === 'unassigned'      && <UnassignedTab toast={toast} />}
          {tab === 'damage'          && <DamageTab toast={toast} />}
          {tab === 'department'      && <DepartmentTab toast={toast} />}
          {tab === 'inv-stock'       && <InvStockTab toast={toast} />}
          {tab === 'inv-assignments' && <InvAssignmentsTab toast={toast} />}
          {tab === 'sim-costs'       && <SIMCostsTab toast={toast} />}
          {tab === 'cost-analytics'  && <CostAnalyticsTab toast={toast} />}
          {tab === 'full-export'     && <FullExportTab toast={toast} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
