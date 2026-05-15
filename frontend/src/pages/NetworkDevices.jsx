import React from 'react'
import ModulePage from './ModulePage'
import Badge from '../components/ui/Badge'

const config = {
  title: 'Network Device',
  module: 'network',
  apiPath: '/api/network',
  exportFile: 'network-export.csv',
  searchPlaceholder: 'Search by brand, model, IP, MAC…',
  columns: [
    { key: 'type',       label: 'Type',      sortable: true },
    { key: 'brand',      label: 'Brand',     sortable: true },
    { key: 'model',      label: 'Model' },
    { key: 'serial',     label: 'Serial No.' },
    { key: 'ip_address', label: 'IP Address' },
    { key: 'mac_address',label: 'MAC Address' },
    { key: 'location',   label: 'Location' },
    { key: 'status',     label: 'Status', render: v => <Badge status={v}>{v || '—'}</Badge> },
  ],
  fields: [
    { name: 'type',       label: 'Device Type',  type: 'select', required: true,
      options: ['Switch','Router','Firewall','Access Point','Modem','Hub','Patch Panel','Other'] },
    { name: 'brand',      label: 'Brand',        type: 'text', required: true, placeholder: 'Cisco, TP-Link…' },
    { name: 'model',      label: 'Model',        type: 'text', placeholder: 'SG350-28…' },
    { name: 'serial',     label: 'Serial No.',   type: 'text' },
    { name: 'ip_address', label: 'IP Address',   type: 'text', placeholder: '192.168.1.1' },
    { name: 'mac_address',label: 'MAC Address',  type: 'text', placeholder: 'AA:BB:CC:DD:EE:FF' },
    { name: 'location',   label: 'Location',     type: 'text', placeholder: 'Server Room, Floor 2…' },
    { name: 'assigned_to',label: 'Assigned To',  type: 'text' },
    { name: 'status',     label: 'Status',       type: 'select', required: true,
      options: ['active','inactive','repair','retired'] },
    { name: 'purchase_date', label: 'Purchase Date', type: 'date' },
    { name: 'notes',      label: 'Notes',        type: 'textarea', fullWidth: true },
  ],
}

export default function NetworkDevices() { return <ModulePage config={config} /> }
