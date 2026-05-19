import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Monitor, Network, Smartphone, CreditCard, Cloud, Users,
  TrendingUp, Clock, ScrollText, Cpu, MapPin, Package,
  AlertTriangle as AlertTriangleIcon, ArrowRight, Layers, Database,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { useNavigate } from 'react-router-dom'
import StatsCard from '../components/ui/StatsCard'
import Badge from '../components/ui/Badge'
import SeedModal from '../components/ui/SeedModal'
import { api } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { cn } from '../lib/utils'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316','#14b8a6','#a855f7']

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="itms-card px-3 py-2 shadow-lg" style={{ fontSize: '0.75rem' }}>
      <p className="text-secondary mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.fill || p.color }} className="fw-semibold mb-0">{p.name || p.dataKey}: {p.value}</p>
      ))}
    </div>
  )
}

function BarList({ rows, keyField, valueField = 'n', colorHex = '#00AA2F' }) {
  const max = Math.max(...(rows || []).map(r => Number(r[valueField] || 0)), 1)
  return (
    <div className="d-flex flex-column gap-2">
      {(rows || []).map((r, i) => {
        const val = Number(r[valueField] || 0)
        return (
          <div key={i} className="d-flex align-items-center gap-2">
            <span className="text-secondary text-truncate flex-shrink-0" style={{ fontSize: '0.75rem', width: 112 }} title={r[keyField]}>{r[keyField] || '—'}</span>
            <div className="flex-grow-1 rounded-pill overflow-hidden" style={{ height: 6, background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-100 rounded-pill" style={{ width: `${(val / max) * 100}%`, background: colorHex }} />
            </div>
            <span className="text-secondary text-end flex-shrink-0" style={{ fontSize: '0.75rem', width: 24 }}>{val}</span>
          </div>
        )
      })}
    </div>
  )
}

const LIMIT = 12
function MiniTable({ columns, rows, fetching, path, navigate }) {
  const visible = rows.slice(0, LIMIT)
  if (fetching) return (
    <div className="d-flex flex-column gap-2 mt-3">
      {[1,2,3].map(i => <div key={i} className="rounded placeholder-glow" style={{ height: 32 }}><span className="placeholder w-100 h-100 d-block rounded" /></div>)}
    </div>
  )
  if (!rows.length) return (
    <p className="text-secondary small mt-3 text-center py-3 mb-0">No records found</p>
  )
  return (
    <div className="mt-3 itms-card overflow-hidden">
      <div className="table-responsive">
        <table className="table table-hover mb-0" style={{ fontSize: '0.75rem' }}>
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c.key} style={{ whiteSpace: 'nowrap' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={row.id ?? i}>
                {columns.map(c => (
                  <td key={c.key} style={{ whiteSpace: 'nowrap' }}>
                    {c.render ? c.render(row[c.key], row) : (row[c.key] ?? <span className="text-secondary">—</span>)}
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
          className="w-100 d-flex align-items-center justify-content-center gap-2 py-2 btn btn-link border-top text-decoration-none"
          style={{ color: 'var(--brand)', fontSize: '0.75rem' }}
        >
          View all {rows.length} records <ArrowRight size={12} />
        </button>
      )}
    </div>
  )
}

function ContentPanel({ open, loading, children }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div className="itms-card p-4">
            {loading ? (
              <div className="d-flex flex-column gap-2 placeholder-glow">
                <span className="placeholder w-100 rounded" style={{ height: 32 }} />
                <span className="placeholder w-100 rounded" style={{ height: 80 }} />
              </div>
            ) : children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const SYS_ASSIGN_COLORS = { Employees: '#6366f1', WFH: '#0ea5e9', Inventory: '#22c55e', Damaged: '#ef4444' }

function SystemsContent({ data, navigate }) {
  if (!data) return null
  const { assignment, byLocation, byGeneration, byType } = data

  const total = Number(assignment?.total || 0)
  const assignSlices = [
    { name: 'Employees', value: Number(assignment?.employees    || 0), fill: SYS_ASSIGN_COLORS.Employees },
    { name: 'WFH',       value: Number(assignment?.wfh          || 0), fill: SYS_ASSIGN_COLORS.WFH },
    { name: 'Inventory', value: Number(assignment?.in_inventory || 0), fill: SYS_ASSIGN_COLORS.Inventory },
    { name: 'Damaged',   value: Number(assignment?.damaged      || 0), fill: SYS_ASSIGN_COLORS.Damaged },
  ].filter(d => d.value > 0)

  const locData  = (byLocation  || []).slice(0,8).map(r => ({ name: r.location  || 'Unknown', n: Number(r.n) }))
  const genData  = (byGeneration|| []).slice(0,8).map(r => ({ name: r.generation|| 'Unknown', n: Number(r.n) }))
  const typeData = (byType      || []).map(r => ({ name: r.type === 'System' ? 'PC/Desktop' : (r.type||'Other'), n: Number(r.n) }))

  return (
    <>
      <div className="row g-4">
        <div className="col-12 col-sm-6">
          <p className="text-secondary text-uppercase mb-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}>Assigned To — breakdown</p>
          {assignSlices.length > 0 ? (
            <div className="position-relative">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={assignSlices} cx="50%" cy="50%" innerRadius={48} outerRadius={70}
                    dataKey="value" paddingAngle={3}>
                    {assignSlices.map((s, i) => <Cell key={i} fill={s.fill} />)}
                  </Pie>
                  <Tooltip content={<Tip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center" style={{ pointerEvents: 'none' }}>
                <span className="fw-bold" style={{ fontSize: '1.5rem' }}>{total}</span>
                <span className="text-secondary" style={{ fontSize: '10px' }}>Total</span>
              </div>
            </div>
          ) : <p className="text-secondary small py-4 mb-0">No data yet</p>}
        </div>

        <div className="col-12 col-sm-6">
          <div className="row g-2">
            {[
              { label: 'Employees', value: assignment?.employees,    color: '#00AA2F', bg: 'rgba(0,170,47,0.1)' },
              { label: 'WFH',       value: assignment?.wfh,          color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)' },
              { label: 'Inventory', value: assignment?.in_inventory, color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
              { label: 'Damaged',   value: assignment?.damaged,      color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
            ].map((s, i) => (
              <div key={i} className="col-6">
                <div className="rounded-3 px-3 py-2" style={{ background: s.bg }}>
                  <div className="d-flex align-items-center gap-1 mb-1">
                    <span className="rounded-circle flex-shrink-0" style={{ width: 6, height: 6, background: s.color, display: 'inline-block' }} />
                    <span style={{ fontSize: '0.75rem', color: s.color, opacity: 0.8 }}>{s.label}</span>
                  </div>
                  <span className="fw-bold" style={{ fontSize: '1.5rem', color: s.color }}>{s.value ?? 0}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="row g-4 pt-3 mt-0 border-top">
        <div className="col-12 col-sm-4">
          <p className="text-secondary text-uppercase mb-2 d-flex align-items-center gap-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}><Monitor size={10} /> By Type</p>
          {typeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={typeData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip content={<Tip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                <Bar dataKey="n" name="Devices" radius={[0,4,4,0]}>
                  {typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-secondary small mb-0">No data</p>}
        </div>

        <div className="col-12 col-sm-4">
          <p className="text-secondary text-uppercase mb-2 d-flex align-items-center gap-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}><MapPin size={10} /> By Location</p>
          {locData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(100, locData.length * 22)}>
              <BarChart data={locData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<Tip />} cursor={{ fill: 'rgba(14,165,233,0.06)' }} />
                <Bar dataKey="n" name="Devices" radius={[0,4,4,0]} fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-secondary small mb-0">No data</p>}
        </div>

        <div className="col-12 col-sm-4">
          <p className="text-secondary text-uppercase mb-2 d-flex align-items-center gap-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}><Cpu size={10} /> By Generation</p>
          {genData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(100, genData.length * 22)}>
              <BarChart data={genData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip content={<Tip />} cursor={{ fill: 'rgba(139,92,246,0.06)' }} />
                <Bar dataKey="n" name="Devices" radius={[0,4,4,0]} fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-secondary small mb-0">No data</p>}
        </div>
      </div>
    </>
  )
}

const MOB_ASSIGN_COLORS = { Employees: '#6366f1', WFH: '#0ea5e9', Inventory: '#22c55e', Damaged: '#ef4444' }

function MobilesContent({ data, navigate }) {
  if (!data) return null
  const { assignment, byLocation, byOS } = data

  const total = Number(assignment?.total || 0)
  const assignSlices = [
    { name: 'Employees', value: Number(assignment?.employees    || 0), fill: MOB_ASSIGN_COLORS.Employees },
    { name: 'WFH',       value: Number(assignment?.wfh          || 0), fill: MOB_ASSIGN_COLORS.WFH },
    { name: 'Inventory', value: Number(assignment?.in_inventory || 0), fill: MOB_ASSIGN_COLORS.Inventory },
    { name: 'Damaged',   value: Number(assignment?.damaged      || 0), fill: MOB_ASSIGN_COLORS.Damaged },
  ].filter(d => d.value > 0)

  const locData = (byLocation || []).slice(0, 8).map(r => ({ name: r.location || 'Unknown', n: Number(r.n) }))

  return (
    <>
      <div className="row g-4">
        <div className="col-12 col-sm-6">
          <p className="text-secondary text-uppercase mb-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}>Assigned To — breakdown</p>
          {assignSlices.length > 0 ? (
            <div className="position-relative">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={assignSlices} cx="50%" cy="50%" innerRadius={48} outerRadius={70} dataKey="value" paddingAngle={3}>
                    {assignSlices.map((s, i) => <Cell key={i} fill={s.fill} />)}
                  </Pie>
                  <Tooltip content={<Tip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center" style={{ pointerEvents: 'none' }}>
                <span className="fw-bold" style={{ fontSize: '1.5rem' }}>{total}</span>
                <span className="text-secondary" style={{ fontSize: '10px' }}>Total</span>
              </div>
            </div>
          ) : <p className="text-secondary small py-4 mb-0">No data yet</p>}
        </div>

        <div className="col-12 col-sm-6">
          <div className="row g-2">
            {[
              { label: 'Employees', value: assignment?.employees,    color: '#00AA2F', bg: 'rgba(0,170,47,0.1)' },
              { label: 'WFH',       value: assignment?.wfh,          color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)' },
              { label: 'Inventory', value: assignment?.in_inventory, color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
              { label: 'Damaged',   value: assignment?.damaged,      color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
            ].map((s, i) => (
              <div key={i} className="col-6">
                <div className="rounded-3 px-3 py-2" style={{ background: s.bg }}>
                  <div className="d-flex align-items-center gap-1 mb-1">
                    <span className="rounded-circle flex-shrink-0" style={{ width: 6, height: 6, background: s.color, display: 'inline-block' }} />
                    <span style={{ fontSize: '0.75rem', color: s.color, opacity: 0.8 }}>{s.label}</span>
                  </div>
                  <span className="fw-bold" style={{ fontSize: '1.5rem', color: s.color }}>{s.value ?? 0}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="row g-4 pt-3 mt-0 border-top">
        <div className="col-12 col-sm-6">
          <p className="text-secondary text-uppercase mb-2 d-flex align-items-center gap-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}><MapPin size={10} /> By Location</p>
          {locData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(80, locData.length * 22)}>
              <BarChart data={locData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip content={<Tip />} cursor={{ fill: 'rgba(14,165,233,0.06)' }} />
                <Bar dataKey="n" name="Devices" radius={[0, 4, 4, 0]} fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-secondary small mb-0">No data</p>}
        </div>
        <div className="col-12 col-sm-6">
          <p className="text-secondary text-uppercase mb-2 d-flex align-items-center gap-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}><Smartphone size={10} /> By OS</p>
          <div className="d-flex flex-column gap-2">
            {(byOS || []).map((r, i) => (
              <div key={i} className="d-flex align-items-center gap-2" style={{ fontSize: '0.75rem' }}>
                <span className="text-secondary flex-shrink-0" style={{ width: 80 }}>{r.os === 'iOS' ? 'Apple iOS' : r.os}</span>
                <div className="flex-grow-1 rounded-pill overflow-hidden" style={{ height: 6, background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-100 rounded-pill" style={{ width: `${(Number(r.n) / total) * 100}%`, background: '#0ea5e9' }} />
                </div>
                <span className="text-secondary flex-shrink-0" style={{ width: 20 }}>{Number(r.n)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

const SIM_ASSIGN_COLORS = { Employees: '#6366f1', WFH: '#0ea5e9', Services: '#f59e0b' }

function SIMsContent({ data, navigate }) {
  if (!data) return null
  const { assignment, byLocation } = data

  const total = Number(assignment?.total || 0)
  const assignSlices = [
    { name: 'Employees', value: Number(assignment?.employees   || 0), fill: SIM_ASSIGN_COLORS.Employees },
    { name: 'WFH',       value: Number(assignment?.wfh         || 0), fill: SIM_ASSIGN_COLORS.WFH },
    { name: 'Services',  value: Number(assignment?.for_services|| 0), fill: SIM_ASSIGN_COLORS.Services },
  ].filter(d => d.value > 0)

  const locData = (byLocation || []).slice(0, 8).map(r => ({ name: r.location || 'Unknown', n: Number(r.n) }))

  return (
    <>
      <div className="row g-4">
        <div className="col-12 col-sm-6">
          <p className="text-secondary text-uppercase mb-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}>Named On — breakdown</p>
          {assignSlices.length > 0 ? (
            <div className="position-relative">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={assignSlices} cx="50%" cy="50%" innerRadius={48} outerRadius={70} dataKey="value" paddingAngle={3}>
                    {assignSlices.map((s, i) => <Cell key={i} fill={s.fill} />)}
                  </Pie>
                  <Tooltip content={<Tip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center" style={{ pointerEvents: 'none' }}>
                <span className="fw-bold" style={{ fontSize: '1.5rem' }}>{total}</span>
                <span className="text-secondary" style={{ fontSize: '10px' }}>Total</span>
              </div>
            </div>
          ) : <p className="text-secondary small py-4 mb-0">No data yet</p>}
        </div>

        <div className="col-12 col-sm-6 d-flex flex-column gap-2">
          {[
            { label: 'Employees', value: assignment?.employees,    color: '#00AA2F', bg: 'rgba(0,170,47,0.1)' },
            { label: 'WFH',       value: assignment?.wfh,          color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)' },
            { label: 'Services',  value: assignment?.for_services, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
          ].map((s, i) => (
            <div key={i} className="d-flex align-items-center justify-content-between rounded-3 px-3 py-2" style={{ background: s.bg }}>
              <div className="d-flex align-items-center gap-2">
                <span className="rounded-circle flex-shrink-0" style={{ width: 6, height: 6, background: s.color, display: 'inline-block' }} />
                <span style={{ fontSize: '0.75rem', color: s.color, opacity: 0.8 }}>{s.label}</span>
              </div>
              <span className="fw-bold" style={{ fontSize: '1.5rem', color: s.color }}>{s.value ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-3 mt-0 border-top">
        <p className="text-secondary text-uppercase mb-2 d-flex align-items-center gap-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}><MapPin size={10} /> By Location</p>
        {locData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(80, locData.length * 22)}>
            <BarChart data={locData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
              <Tooltip content={<Tip />} cursor={{ fill: 'rgba(139,92,246,0.06)' }} />
              <Bar dataKey="n" name="SIMs" radius={[0, 4, 4, 0]} fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-secondary small mb-0">No data</p>}
      </div>
    </>
  )
}

const TYPE_COLORS = { Permanent: '#00AA2F', Contractual: '#8b5cf6', Unknown: '#71717a' }

function EmployeesContent({ data, navigate }) {
  if (!data) return null
  const { byLocation, byDepartment, byType, total, active } = data

  const totalAll    = Number(total  || 0)
  const activeCount = Number(active || 0)
  const typeSlices  = (byType || []).map(r => ({
    name:  r.type === 'Unknown' ? 'Not Set' : (r.type || 'Not Set'),
    value: Number(r.n),
    fill:  TYPE_COLORS[r.type] || '#71717a',
  }))
  const permanentCount    = typeSlices.find(t => t.name === 'Permanent')?.value    ?? 0
  const contractualCount  = typeSlices.find(t => t.name === 'Contractual')?.value  ?? 0

  return (
    <>
      {/* Summary stat cards */}
      <div className="row g-2 mb-4">
        {[
          { label: 'Total Employees', value: totalAll,        color: '#4ade80', bg: 'rgba(0,170,47,0.1)'     },
          { label: 'Active',          value: activeCount,      color: '#22c55e', bg: 'rgba(34,197,94,0.1)'    },
          { label: 'Permanent',       value: permanentCount,   color: '#00AA2F', bg: 'rgba(0,170,47,0.1)'     },
          { label: 'Contractual',     value: contractualCount, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)'   },
        ].map((s, i) => (
          <div key={i} className="col-6 col-md-3">
            <div className="rounded-3 px-3 py-2" style={{ background: s.bg }}>
              <span className="fw-bold d-block" style={{ fontSize: '1.5rem', color: s.color }}>{s.value}</span>
              <span style={{ fontSize: '0.75rem', color: s.color, opacity: 0.85 }}>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Breakdown charts */}
      <div className="row g-4 border-top pt-4">
        <div className="col-12 col-sm-4">
          <p className="text-secondary text-uppercase mb-2 d-flex align-items-center gap-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}><Users size={10} /> By Type</p>
          {typeSlices.length > 0 ? (
            <>
              <div className="position-relative mb-2">
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={typeSlices} cx="50%" cy="50%" innerRadius={40} outerRadius={60}
                      dataKey="value" paddingAngle={3}>
                      {typeSlices.map((s, i) => <Cell key={i} fill={s.fill} />)}
                    </Pie>
                    <Tooltip content={<Tip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center" style={{ pointerEvents: 'none' }}>
                  <span className="fw-bold" style={{ fontSize: '1.25rem' }}>{totalAll}</span>
                  <span className="text-secondary" style={{ fontSize: '10px' }}>Total</span>
                </div>
              </div>
              <div className="d-flex flex-column gap-1">
                {typeSlices.map((s, i) => (
                  <div key={i} className="d-flex align-items-center justify-content-between rounded-2 px-2 py-1" style={{ background: `${s.fill}18` }}>
                    <span style={{ fontSize: '0.75rem', color: s.fill }}>{s.name}</span>
                    <span className="fw-bold" style={{ fontSize: '0.875rem', color: s.fill }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-secondary small mb-0">No data</p>}
        </div>

        <div className="col-12 col-sm-4">
          <p className="text-secondary text-uppercase mb-2 d-flex align-items-center gap-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}><MapPin size={10} /> By Location</p>
          {(byLocation || []).length > 0
            ? <BarList rows={byLocation} keyField="location" colorHex="#f59e0b" />
            : <p className="text-secondary small mb-0">No data</p>}
        </div>

        <div className="col-12 col-sm-4">
          <p className="text-secondary text-uppercase mb-2 d-flex align-items-center gap-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}><Users size={10} /> By Department</p>
          {(byDepartment || []).length > 0
            ? <BarList rows={byDepartment} keyField="department" colorHex="#00AA2F" />
            : <p className="text-secondary small mb-0">No data</p>}
        </div>
      </div>
    </>
  )
}

const ACTION_DOT = {
  login: '#22c55e', logout: '#71717a', login_failed: '#ef4444',
  login_blocked: '#ef4444', created: '#00AA2F', updated: '#f59e0b',
  deleted: '#f87171', deleted_all: '#dc2626', imported: '#8b5cf6',
  password_changed: '#0ea5e9', password_reset: '#0ea5e9',
}
const ACTION_BADGE = {
  login:            { bg: 'rgba(34,197,94,0.1)',   color: '#4ade80' },
  logout:           { bg: 'rgba(113,113,122,0.2)', color: '#a1a1aa' },
  login_failed:     { bg: 'rgba(239,68,68,0.1)',   color: '#f87171' },
  login_blocked:    { bg: 'rgba(239,68,68,0.1)',   color: '#f87171' },
  created:          { bg: 'rgba(0,170,47,0.1)',    color: '#4ade80' },
  updated:          { bg: 'rgba(245,158,11,0.1)',  color: '#fbbf24' },
  deleted:          { bg: 'rgba(239,68,68,0.1)',   color: '#f87171' },
  deleted_all:      { bg: 'rgba(239,68,68,0.15)',  color: '#f87171' },
  imported:         { bg: 'rgba(139,92,246,0.1)',  color: '#c4b5fd' },
  password_changed: { bg: 'rgba(14,165,233,0.1)',  color: '#7dd3fc' },
  password_reset:   { bg: 'rgba(14,165,233,0.1)',  color: '#7dd3fc' },
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
    <div className="itms-card overflow-hidden h-100 d-flex flex-column">
      <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom flex-shrink-0">
        <ScrollText size={14} className="text-secondary" />
        <h3 className="mb-0 fw-semibold" style={{ fontSize: '0.875rem' }}>Last 24 Hours</h3>
        {!loading && (
          <span className="badge bg-secondary bg-opacity-25 text-secondary ms-1" style={{ fontSize: '11px' }}>
            {entries.length} event{entries.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {loading ? (
        <div className="d-flex align-items-center justify-content-center py-5">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
        </div>
      ) : entries.length === 0 ? (
        <div className="px-3 py-5 text-center text-secondary small">No activity in the last 24 hours</div>
      ) : (
        <div className="overflow-auto flex-grow-1" style={{ maxHeight: 280 }}>
          {entries.map((a, i) => {
            const badge = ACTION_BADGE[a.action] || { bg: 'rgba(113,113,122,0.2)', color: '#a1a1aa' }
            return (
              <div key={a.id ?? i} className="d-flex align-items-start gap-2 px-3 py-2 border-bottom" style={{ borderColor: 'rgba(255,255,255,0.04) !important' }}>
                <div className="rounded-circle mt-1 flex-shrink-0"
                  style={{ width: 6, height: 6, background: ACTION_DOT[a.action] || '#71717a' }} />
                <div className="flex-grow-1 min-w-0 d-flex align-items-start flex-wrap gap-1">
                  <span className="small fw-medium flex-shrink-0">{a.user_name || a.user_email || 'Unknown'}</span>
                  <span className="rounded flex-shrink-0 px-1"
                    style={{ fontSize: '10px', background: badge.bg, color: badge.color, fontWeight: 500 }}>
                    {a.action?.replace(/_/g, ' ')}
                  </span>
                  {a.table_name && <span className="text-secondary flex-shrink-0" style={{ fontSize: '10px' }}>{MODULE_LABEL[a.table_name] || a.table_name}</span>}
                  {a.record_label && <span className="text-secondary text-truncate" style={{ fontSize: '0.75rem' }}>{a.record_label}</span>}
                </div>
                <span className="text-secondary flex-shrink-0 mt-0" style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>{timeAgo(a.created_at)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function InventoryContent({ stats, rows, rowsLoading, navigate }) {
  if (!stats) return null
  const cols = [
    { key: 'name',          label: 'Item' },
    { key: 'category_name', label: 'Category' },
    { key: 'sku',           label: 'SKU' },
    { key: 'qty_available', label: 'Available', render: v => <span style={{ fontWeight: 600, color: Number(v)===0 ? '#ef4444' : Number(v) <= 5 ? '#f59e0b' : '#4ade80' }}>{v??0}</span> },
    { key: 'qty_assigned',  label: 'Assigned' },
    { key: 'stock_status',  label: 'Stock', render: v => <Badge status={v === 'out_of_stock' ? 'retired' : v === 'low_stock' ? 'repair' : 'available'}>{(v||'').replace(/_/g,' ')}</Badge> },
  ]
  return (
    <div className="d-flex flex-column gap-3">
      <div className="row g-2">
        {[
          { label: 'Items in Catalog',   value: stats.total_items,      color: '#00AA2F', bg: 'rgba(0,170,47,0.1)' },
          { label: 'Available Stock',    value: stats.total_available,  color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
          { label: 'Currently Assigned', value: stats.total_assigned,   color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)' },
          { label: 'Pending Requests',   value: stats.pending_requests, color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
        ].map((s, i) => (
          <div key={i} className="col-6 col-md-3">
            <div className="rounded-3 px-3 py-2" style={{ background: s.bg }}>
              <span className="fw-bold d-block" style={{ fontSize: '1.25rem', color: s.color }}>{s.value ?? 0}</span>
              <span style={{ fontSize: '0.75rem', color: s.color, opacity: 0.8 }}>{s.label}</span>
            </div>
          </div>
        ))}
      </div>
      {(stats.low_stock > 0 || stats.out_of_stock > 0) && (
        <div className="d-flex align-items-center gap-4 small">
          {stats.out_of_stock > 0 && (
            <span className="d-flex align-items-center gap-1 text-danger">
              <AlertTriangleIcon size={13} />
              <strong>{stats.out_of_stock}</strong> item{stats.out_of_stock !== 1 ? 's' : ''} out of stock
            </span>
          )}
          {stats.low_stock > 0 && (
            <span className="d-flex align-items-center gap-1 text-warning">
              <AlertTriangleIcon size={13} />
              <strong>{stats.low_stock}</strong> item{stats.low_stock !== 1 ? 's' : ''} low on stock
            </span>
          )}
        </div>
      )}
      <MiniTable columns={cols} rows={rows} fetching={rowsLoading} path="/inventory" navigate={navigate} />
    </div>
  )
}

const SECTION_API = {
  systems:   '/api/systems',
  network:   '/api/network',
  mobiles:   '/api/mobiles',
  sims:      '/api/sims',
  employees: '/api/employees',
  inventory: '/api/inventory/items',
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [empCount, setEmpCount] = useState(null)
  const [invStats, setInvStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openSection, setOpenSection] = useState(null)
  const [sectionRows, setSectionRows] = useState({})
  const [sectionLoading, setSectionLoading] = useState({})
  const fetchedSections = useRef(new Set())
  const { toast } = useToast()
  const { canPerm, user } = useAuth()
  const navigate = useNavigate()

  const toggle = useCallback((id) => {
    setOpenSection(o => (o !== id ? id : null))
    if (SECTION_API[id] && !fetchedSections.current.has(id)) {
      fetchedSections.current.add(id)
      setSectionLoading(p => ({ ...p, [id]: true }))
      api.get(SECTION_API[id])
        .then(d => setSectionRows(p => ({ ...p, [id]: Array.isArray(d) ? d : [] })))
        .catch(() => setSectionRows(p => ({ ...p, [id]: [] })))
        .finally(() => setSectionLoading(p => ({ ...p, [id]: false })))
    }
  }, [])

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
    { label: 'System Devices',   value: systemsTotal,   icon: Monitor,    color: 'brand',   module: 'systems'   },
    { label: 'Network Devices', value: networkTotal,   icon: Network,    color: 'sky',     module: 'network'   },
    { label: 'Mobile Devices',  value: mobilesTotal,   icon: Smartphone, color: 'emerald', module: 'mobiles'   },
    { label: 'SIM Cards',       value: simsTotal,      icon: CreditCard, color: 'purple',  module: 'sims'      },
    { label: 'Cloud IDs',       value: gwsTotal,       icon: Cloud,      color: 'cyan',    module: 'gws'       },
    { label: 'Employees',       value: employeesTotal, icon: Users,      color: 'amber',   module: 'employees' },
  ]
  const stats = allStats.filter(s => canPerm(s.module, 'read'))

  const netByType = (data?.networkDevices || []).map(r => ({ name: r.device_type, value: Number(r.n) }))

  const [seedOpen, setSeedOpen] = useState(false)
  const isSA = user?.role === 'super_admin'

  const firstName = user?.name?.split(' ')[0] || 'Admin'
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="d-flex flex-column gap-4">
      <SeedModal open={seedOpen} onClose={() => setSeedOpen(false)} />

      {/* Hero welcome banner */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="dashboard-hero p-4 text-white"
      >
        <div className="position-absolute top-0 end-0 bottom-0 start-0" style={{ background: 'radial-gradient(ellipse at top right, rgba(255,255,255,0.08) 0%, transparent 60%)', pointerEvents: 'none', borderRadius: '1rem' }} />
        <div className="position-absolute" style={{ right: -40, top: -40, width: 176, height: 176, background: 'rgba(255,255,255,0.05)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div className="d-flex align-items-center justify-content-between gap-3">
          <div className="position-relative">
            <p className="mb-1 fw-semibold text-uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.12em', opacity: 0.9 }}>{getGreeting()}</p>
            <h2 className="fw-bold text-white mb-0" style={{ fontSize: '1.25rem' }}>{firstName}</h2>
            <p className="mb-0 d-none d-sm-block" style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: 4 }}>{today}</p>
          </div>
          <div className="d-flex align-items-center gap-2">
            {isSA && (
              <button
                onClick={() => setSeedOpen(true)}
                title="Load sample data"
                className="d-flex align-items-center gap-2 btn btn-sm"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(8px)', fontSize: '0.75rem', borderRadius: '0.5rem' }}
              >
                <Database size={13} />
                <span className="d-none d-sm-inline">Load Demo Data</span>
              </button>
            )}
            <div className="d-none d-sm-flex align-items-center justify-content-center flex-shrink-0 rounded-3"
              style={{ width: 48, height: 48, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
              <Layers size={22} style={{ opacity: 0.8 }} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats grid */}
      <div className="row g-3">
        {stats.map((s, i) => (
          <div key={i} className="col-6 col-md-4 col-lg-2">
            <StatsCard {...s} loading={loading}
              onClick={() => toggle(s.module)}
              active={openSection === s.module}
            />
          </div>
        ))}
      </div>

      {/* Detail panels */}
      {canPerm('systems', 'read') && (
        <ContentPanel open={openSection === 'systems'} loading={loading}>
          <SystemsContent data={data?.systems} navigate={navigate} />
        </ContentPanel>
      )}
      {canPerm('mobiles', 'read') && (
        <ContentPanel open={openSection === 'mobiles'} loading={loading}>
          <MobilesContent data={data?.mobiles} navigate={navigate} />
        </ContentPanel>
      )}
      {canPerm('sims', 'read') && (
        <ContentPanel open={openSection === 'sims'} loading={loading}>
          <SIMsContent data={data?.sims} navigate={navigate} />
        </ContentPanel>
      )}
      {canPerm('employees', 'read') && (
        <ContentPanel open={openSection === 'employees'} loading={loading}>
          <EmployeesContent data={data?.employees} navigate={navigate} />
        </ContentPanel>
      )}
      {canPerm('inventory', 'read') && invStats && (
        <ContentPanel open={openSection === 'inventory'} loading={loading}>
          <InventoryContent stats={invStats} rows={sectionRows['inventory'] || []} rowsLoading={sectionLoading['inventory'] || false} navigate={navigate} />
        </ContentPanel>
      )}

      {/* Network chart + 24h log */}
      <div className="row g-4">
        {canPerm('network', 'read') && (
          <div className="col-12 col-lg-6">
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.20 }} className="itms-card p-4 h-100">
              <div className="d-flex align-items-center gap-2 mb-3">
                <TrendingUp size={14} style={{ color: '#0ea5e9' }} />
                <h3 className="mb-0 fw-semibold" style={{ fontSize: '0.875rem' }}>Network Devices by Type</h3>
              </div>
              {loading ? (
                <div className="d-flex align-items-center justify-content-center" style={{ height: 192 }}>
                  <div className="spinner-border spinner-border-sm text-primary" role="status" />
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
                <div className="d-flex align-items-center justify-content-center text-secondary small" style={{ height: 192 }}>No data yet</div>
              )}
            </motion.div>
          </div>
        )}

        <div className={cn('col-12', canPerm('network', 'read') ? 'col-lg-6' : '')}>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="h-100">
            <Activity24h logs={data?.activity24h} loading={loading} />
          </motion.div>
        </div>
      </div>

      {/* Warranty alerts */}
      {canPerm('systems', 'read') && data && (data.warrantyExpired > 0 || data.warrantySoon > 0) && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.23 }} className="itms-card p-4">
          <div className="d-flex align-items-center gap-2 mb-3">
            <Clock size={14} style={{ color: '#f59e0b' }} />
            <h3 className="mb-0 fw-semibold" style={{ fontSize: '0.875rem' }}>Warranty Alerts</h3>
          </div>
          <div className="row g-3">
            <div className="col-12 col-sm-6">
              <div className="d-flex align-items-center justify-content-between p-3 rounded-3" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <span className="small" style={{ color: '#fca5a5' }}>Warranties Expired</span>
                <span className="fw-bold" style={{ fontSize: '1.1rem', color: '#ef4444' }}>{data.warrantyExpired}</span>
              </div>
            </div>
            <div className="col-12 col-sm-6">
              <div className="d-flex align-items-center justify-content-between p-3 rounded-3" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <span className="small" style={{ color: '#fcd34d' }}>Expiring in 90 days</span>
                <span className="fw-bold" style={{ fontSize: '1.1rem', color: '#f59e0b' }}>{data.warrantySoon}</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
