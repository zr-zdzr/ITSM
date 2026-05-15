import React from 'react'
import ModulePage from './ModulePage'
import Badge from '../components/ui/Badge'

const config = {
  title: 'Mobile Device',
  module: 'mobiles',
  apiPath: '/api/mobiles',
  exportFile: 'mobiles-export.csv',
  searchPlaceholder: 'Search by brand, model, serial, IMEI…',
  qrData: row => ({
    label: row.asset_tag || `${row.brand||''} ${row.model||''}`.trim() || 'Mobile Device',
    value: `Tag:${row.asset_tag||''}\nBrand:${row.brand||''}\nModel:${row.model||''}\nSN:${row.serial_number||''}\nIMEI:${row.imei1||''}`,
    details: [
      (row.brand || row.model) && `${row.brand||''} ${row.model||''}`.trim(),
      row.serial_number && `S/N: ${row.serial_number}`,
      row.imei1 && `IMEI: ${row.imei1}`,
      row.status && `Status: ${row.status}`,
    ].filter(Boolean),
  }),
  columns: [
    { key: 'asset_tag',    label: 'Asset Tag',  sortable: true },
    { key: 'brand',        label: 'Brand',      sortable: true },
    { key: 'model',        label: 'Model' },
    { key: 'serial_number',label: 'Serial No.' },
    { key: 'imei1',        label: 'IMEI 1' },
    { key: 'status',       label: 'Status', render: v => <Badge status={v}>{v || '—'}</Badge> },
    { key: 'assigned_to_name', label: 'Assigned To' },
  ],
  fields: [
    { name: 'brand',        label: 'Brand',         type: 'text', required: true, placeholder: 'Samsung, Apple…' },
    { name: 'model',        label: 'Model',         type: 'text', required: true, placeholder: 'Galaxy S23…' },
    { name: 'serial_number',label: 'Serial Number', type: 'text', placeholder: 'IMEI/SN from device' },
    { name: 'imei1',        label: 'IMEI 1',        type: 'text', placeholder: '15-digit IMEI' },
    { name: 'imei2',        label: 'IMEI 2',        type: 'text', placeholder: '15-digit IMEI (dual SIM)' },
    { name: 'color',        label: 'Color',         type: 'text', placeholder: 'Midnight Black' },
    { name: 'storage',      label: 'Storage',       type: 'text', placeholder: '128GB, 256GB…' },
    { name: 'status',       label: 'Status',        type: 'select', required: true,
      options: ['available','assigned','repair','retired','lost'] },
    { name: 'condition',    label: 'Condition',     type: 'select',
      options: ['New','Good','Fair','Damaged'] },
    { name: 'purchase_date',label: 'Purchase Date', type: 'date' },
    { name: 'notes',        label: 'Notes',         type: 'textarea', fullWidth: true },
  ],
}

export default function MobileDevices() { return <ModulePage config={config} /> }
