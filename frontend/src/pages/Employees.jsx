import React from 'react'
import ModulePage from './ModulePage'
import Badge from '../components/ui/Badge'

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
}

export default function Employees() { return <ModulePage config={config} /> }
