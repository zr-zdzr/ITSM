import React from 'react'
import ModulePage from './ModulePage'
import Badge from '../components/ui/Badge'

const config = {
  title: 'SIM Card',
  module: 'sims',
  apiPath: '/api/sims',
  exportFile: 'sims-export.csv',
  searchPlaceholder: 'Search by number, vendor, plan…',
  columns: [
    { key: 'number',      label: 'Number',    sortable: true },
    { key: 'vendor',      label: 'Vendor',    sortable: true },
    { key: 'plan',        label: 'Plan' },
    { key: 'monthly_cost',label: 'Cost/Mo',   render: v => v ? `Rs. ${v}` : '—' },
    { key: 'status',      label: 'Status',    render: v => <Badge status={v}>{v || '—'}</Badge> },
    { key: 'assigned_to_name', label: 'Assigned To' },
  ],
  fields: [
    { name: 'number',       label: 'SIM Number',   type: 'text', required: true, placeholder: '0321-0000000' },
    { name: 'vendor',       label: 'Vendor',       type: 'select', required: true,
      options: ['Jazz','Telenor','Zong','Ufone','SCOM','Other'] },
    { name: 'plan',         label: 'Plan/Package', type: 'text', placeholder: 'Business 3000…' },
    { name: 'monthly_cost', label: 'Monthly Cost', type: 'number', placeholder: '0' },
    { name: 'sim_type',     label: 'SIM Type',     type: 'select',
      options: ['Standard','Micro','Nano','eSIM'] },
    { name: 'status',       label: 'Status',       type: 'select', required: true,
      options: ['active','inactive','suspended','lost'] },
    { name: 'purchase_date',label: 'Purchase Date',type: 'date' },
    { name: 'notes',        label: 'Notes',        type: 'textarea', fullWidth: true },
  ],
}

export default function SIMCards() { return <ModulePage config={config} /> }
