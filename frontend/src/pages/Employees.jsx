import React, { useEffect, useState } from 'react'
import ModulePage from './ModulePage'
import Badge from '../components/ui/Badge'
import { api } from '../lib/api'
import { PackageCheck, RotateCcw } from 'lucide-react'
import { cn } from '../lib/utils'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
}

const ASN_STATUS = {
  active:             'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  partially_returned: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  fully_returned:     'bg-zinc-500/15 text-zinc-500',
}

function EmployeeAssignments({ row }) {
  const [assignments, setAssignments] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!row?.id) return
    setLoading(true)
    api.get(`/api/assignments/employee/${row.id}`)
      .then(setAssignments)
      .catch(() => setAssignments([]))
      .finally(() => setLoading(false))
  }, [row?.id])

  const active = assignments?.filter(a => a.status !== 'fully_returned') || []

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <PackageCheck size={13} className="text-teal-500" />
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Inventory Assignments</span>
        {!loading && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{active.length} active</span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-zinc-500 py-2">Loading…</p>
      ) : active.length === 0 ? (
        <p className="text-xs text-zinc-500 py-2">No active inventory assignments</p>
      ) : (
        <div className="space-y-3">
          {active.map(asn => (
            <div key={asn.id} className="rounded-lg border border-zinc-700/60 bg-zinc-800/30 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700/40">
                <span className="font-mono text-xs text-zinc-400">{asn.asn_number}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">{fmtDate(asn.assigned_date)}</span>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', ASN_STATUS[asn.status] || '')}>
                    {asn.status?.replace('_', ' ')}
                  </span>
                </div>
              </div>
              <div className="px-3 py-2 space-y-1">
                {(asn.items || []).filter(i => i.status === 'active').map(item => (
                  <div key={item.id} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">{item.item_name}</span>
                    <span className="text-zinc-500">× {item.qty} {item.unit}</span>
                  </div>
                ))}
                {asn.expected_return_date && (
                  <p className={cn('text-[10px] mt-1', new Date(asn.expected_return_date) < new Date() ? 'text-red-400' : 'text-zinc-500')}>
                    <RotateCcw size={9} className="inline mr-1" />
                    Return by {fmtDate(asn.expected_return_date)}
                    {new Date(asn.expected_return_date) < new Date() && ' · OVERDUE'}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const config = {
  title: 'Employee',
  module: 'employees',
  apiPath: '/api/employees',
  exportFile: 'employees-export.csv',
  searchPlaceholder: 'Search by name, email, designation, department…',
  columns: [
    {
      key: 'first_name',
      label: 'Name',
      sortable: true,
      render: (_, row) => {
        const name = `${row.first_name || ''} ${row.last_name || ''}`.trim()
        return name || <span className="text-zinc-600">—</span>
      },
    },
    { key: 'email',           label: 'Email',       sortable: true },
    { key: 'designation',     label: 'Designation', sortable: true },
    { key: 'department',      label: 'Department',  sortable: true },
    { key: 'mobile_number',   label: 'Mobile' },
    {
      key: 'employment_type',
      label: 'Type',
      render: v => v ? <Badge status={v}>{v}</Badge> : <span className="text-zinc-600">—</span>,
    },
    {
      key: 'is_active',
      label: 'Status',
      render: v => v
        ? <Badge status="active">Active</Badge>
        : <Badge status="inactive">Inactive</Badge>,
    },
  ],
  fields: [
    { name: 'first_name',     label: 'First Name',   type: 'text', required: true },
    { name: 'last_name',      label: 'Last Name',    type: 'text', required: true },
    { name: 'designation',    label: 'Designation',  type: 'text', required: true, placeholder: 'Software Engineer…' },
    { name: 'department',     label: 'Department',   type: 'text', required: true, placeholder: 'Engineering, HR…' },
    { name: 'email',          label: 'Email',        type: 'email', placeholder: 'name@bykea.com' },
    { name: 'mobile_number',  label: 'Mobile',       type: 'tel',  placeholder: '0321-0000000' },
    { name: 'location',       label: 'Location',     type: 'select',
      options: ['Karachi','Lahore','Islamabad','Multan','Peshawar','Other'] },
    { name: 'employment_type',label: 'Employee Type',type: 'select',
      options: ['Permanent','Contractual','Intern','Consultant'] },
  ],
  viewExtra: (row) => <EmployeeAssignments row={row} />,
}

export default function Employees() { return <ModulePage config={config} /> }
