import React from 'react'
import ModulePage from './ModulePage'
import Badge from '../components/ui/Badge'

const config = {
  title: 'Cloud ID',
  module: 'gws',
  apiPath: '/api/gws',
  exportFile: 'cloudids-export.csv',
  searchPlaceholder: 'Search by email, name, org unit…',
  columns: [
    { key: 'email',        label: 'Email',     sortable: true },
    { key: 'display_name', label: 'Name',      sortable: true },
    { key: 'org_unit',     label: 'Org Unit' },
    { key: 'account_type', label: 'Type' },
    { key: 'status',       label: 'Status',    render: v => <Badge status={v}>{v || '—'}</Badge> },
    { key: 'employee_name',label: 'Employee' },
  ],
  fields: [
    { name: 'email',        label: 'Email Address', type: 'email', required: true, placeholder: 'user@bykea.com' },
    { name: 'display_name', label: 'Display Name',  type: 'text', placeholder: 'John Doe' },
    { name: 'first_name',   label: 'First Name',    type: 'text' },
    { name: 'last_name',    label: 'Last Name',     type: 'text' },
    { name: 'org_unit',     label: 'Org Unit',      type: 'text', placeholder: '/Engineering' },
    { name: 'account_type', label: 'Account Type',  type: 'select',
      options: ['User','Service Account','Shared Mailbox','Group'] },
    { name: 'status',       label: 'Status',        type: 'select', required: true,
      options: ['active','inactive','suspended'] },
    { name: 'recovery_email', label: 'Recovery Email', type: 'email' },
    { name: 'notes',        label: 'Notes',         type: 'textarea', fullWidth: true },
  ],
}

export default function CloudIDs() { return <ModulePage config={config} /> }
