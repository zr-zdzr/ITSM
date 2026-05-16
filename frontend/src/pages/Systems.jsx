import React from 'react'
import ModulePage from './ModulePage'
import Badge from '../components/ui/Badge'
import { fmtDate } from '../lib/utils'
import MaintenanceLog from '../components/ui/MaintenanceLog'

const config = {
  title: 'System',
  module: 'systems',
  apiPath: '/api/systems',
  exportFile: 'systems-export.csv',
  searchPlaceholder: 'Search by tag, serial, brand, model…',
  qrData: row => ({
    label: row.asset_tag || row.serial_number || 'System',
    value: `Tag:${row.asset_tag||''}\nType:${row.type||''}\nBrand:${row.manufacturer||''}\nModel:${row.model||''}\nSN:${row.serial_number||''}`,
    details: [
      row.type && `Type: ${row.type}`,
      (row.manufacturer || row.model) && `${row.manufacturer||''} ${row.model||''}`.trim(),
      row.serial_number && `S/N: ${row.serial_number}`,
      row.status && `Status: ${row.status}`,
    ].filter(Boolean),
  }),
  columns: [
    { key: 'asset_tag',    label: 'Asset Tag',   sortable: true },
    { key: 'type',         label: 'Type',        sortable: true },
    { key: 'manufacturer', label: 'Brand',       sortable: true },
    { key: 'model',        label: 'Model' },
    { key: 'serial_number',label: 'Serial No.' },
    { key: 'status',       label: 'Status',      render: v => <Badge status={v}>{v || '—'}</Badge> },
    { key: 'assigned_to_name', label: 'Assigned To' },
    { key: 'department',   label: 'Department' },
  ],
  fields: [
    { name: 'type',           label: 'Device Type',    type: 'select', required: true,
      options: ['Laptop','Desktop','Server','Tablet','Workstation','Mini PC'] },
    { name: 'manufacturer',   label: 'Manufacturer',   type: 'text', placeholder: 'Dell, HP, Lenovo…' },
    { name: 'model',          label: 'Model',          type: 'text', placeholder: 'Latitude 5540…' },
    { name: 'serial_number',  label: 'Serial Number',  type: 'text', required: true, placeholder: 'SN from label/BIOS' },
    { name: 'generation',     label: 'Generation',     type: 'text', placeholder: '12th Gen' },
    { name: 'cpu',            label: 'CPU',            type: 'text', placeholder: 'Intel Core i7-1255U' },
    { name: 'department',     label: 'Department',     type: 'text', placeholder: 'Engineering, HR…' },
    { name: 'location',       label: 'Location',       type: 'text', placeholder: 'HQ Floor 2…' },
    { name: 'condition',      label: 'Condition',      type: 'select',
      options: ['Working','Damaged','Under Repair'] },
    { name: 'status',         label: 'Status',         type: 'select', required: true,
      options: ['available','assigned','repair','retired','lost'] },
    { name: 'warranty_expiry',label: 'Warranty Expiry',type: 'date' },
    { name: 'purchase_date',  label: 'Purchase Date',  type: 'date' },
    { name: 'invoice_number', label: 'Invoice Number', type: 'text', placeholder: 'INV-2024-001' },
    { name: 'purpose',        label: 'Purpose',        type: 'text', placeholder: 'Daily use, Development…' },
    { name: 'notes',          label: 'Notes',          type: 'textarea', fullWidth: true },
  ],
  viewExtra: (row) => <MaintenanceLog row={row} assetType="system" />,
}

export default function Systems() { return <ModulePage config={config} /> }
