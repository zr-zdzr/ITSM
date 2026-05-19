import React, { useEffect, useState } from 'react'
import ModulePage from './ModulePage'
import Badge from '../components/ui/Badge'
import MaintenanceLog from '../components/ui/MaintenanceLog'
import { genAssetTag } from '../lib/utils'
import { api } from '../lib/api'

// ── Helpers ───────────────────────────────────────────────
function Fld({ label, required, children, half = true }) {
  return (
    <div className={half ? '' : 'col-span-2'}>
      <label className="form-label small fw-medium mb-1">
        {label}{required && <span className="text-danger ms-1">*</span>}
      </label>
      {children}
    </div>
  )
}

const inp = "form-control form-control-sm"
const sel = "form-select form-select-sm"

function SecHead({ title }) {
  return (
    <div className="col-span-2 form-sec-head">
      <span>{title}</span>
      <hr />
    </div>
  )
}

// ── Custom Form ───────────────────────────────────────────
function SystemDeviceForm({ vals, setVals }) {
  const [employees, setEmployees] = useState([])

  useEffect(() => {
    api.get('/api/employees')
      .then(d => setEmployees(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  const set = (k, v) => setVals(p => ({ ...p, [k]: v }))
  const needEmployee = vals.assigned_type === 'employee' || vals.assigned_type === 'wfh' || vals.assigned_type === 'user'

  return (
    <div className="row g-3" style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: 4 }}>
      {/* ── Basic Info ── */}
      <SecHead title="Basic Information" />

      <Fld label="Asset Tag" required>
        <input className={inp} value={vals.asset_tag || ''} onChange={e => set('asset_tag', e.target.value)} placeholder="IT-SYS-0001" />
      </Fld>

      <Fld label="Assigned To">
        <select className={sel} value={vals.assigned_type || 'inventory'} onChange={e => {
          set('assigned_type', e.target.value)
          if (!['employee','wfh','user'].includes(e.target.value)) set('assigned_user_id', null)
        }}>
          <option value="inventory">Inventory</option>
          <option value="employee">Employee</option>
          <option value="wfh">WFH (Work From Home)</option>
          <option value="damaged">Damaged</option>
        </select>
      </Fld>

      {needEmployee && (
        <div className="col-12">
          <Fld label="Employee Name" half={false}>
            <select className={sel} value={vals.assigned_user_id || ''} onChange={e => set('assigned_user_id', e.target.value || null)}>
              <option value="">— Select Employee —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.full_name}{e.designation ? ` — ${e.designation}` : ''}</option>
              ))}
            </select>
          </Fld>
        </div>
      )}

      <div className="col-md-6">
        <Fld label="Department">
          <input className={inp} value={vals.department || ''} onChange={e => set('department', e.target.value)} placeholder="Engineering, HR…" />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Type" required>
          <select className={sel} value={vals.type || ''} onChange={e => set('type', e.target.value)}>
            <option value="">— Select Type —</option>
            {['Laptop','PC','Server','Workstation','Other Device'].map(t => <option key={t}>{t}</option>)}
          </select>
        </Fld>
      </div>

      {/* Device Details */}
      <SecHead title="Device Details" />

      <div className="col-md-6">
        <Fld label="Brand">
          <select className={sel} value={vals.brand_type || ''} onChange={e => set('brand_type', e.target.value)}>
            <option value="">— Select —</option>
            <option>Branded</option>
            <option>Unbranded</option>
          </select>
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Manufacturer" required>
          <input className={inp} value={vals.manufacturer || ''} onChange={e => set('manufacturer', e.target.value)} placeholder="Dell, HP, Lenovo…" />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Model" required>
          <input className={inp} value={vals.model || ''} onChange={e => set('model', e.target.value)} placeholder="Latitude 5540…" />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Serial No." required>
          <input className={inp} value={vals.serial_number || ''} onChange={e => set('serial_number', e.target.value)} onBlur={e => set('serial_number', e.target.value.toUpperCase())} placeholder="SN from BIOS/label" autoCapitalize="characters" style={{ textTransform: 'uppercase' }} />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Generation">
          <input className={inp} value={vals.generation || ''} onChange={e => set('generation', e.target.value)} placeholder="12th Gen…" />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Location">
          <input className={inp} value={vals.location || ''} onChange={e => set('location', e.target.value)} placeholder="HQ Floor 2…" />
        </Fld>
      </div>

      {/* Processor */}
      <SecHead title="Processor (CPU)" />

      <div className="col-md-6">
        <Fld label="CPU 1 — Model">
          <input className={inp} value={vals.cpu || ''} onChange={e => set('cpu', e.target.value)} placeholder="Intel Core i7-1255U" />
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="CPU 1 — Cores">
          <input className={inp} value={vals.cpu_cores || ''} onChange={e => set('cpu_cores', e.target.value)} placeholder="10" />
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="CPU 2 — Model (optional)">
          <input className={inp} value={vals.cpu2 || ''} onChange={e => set('cpu2', e.target.value)} placeholder="Intel Xeon E5-2630" />
        </Fld>
      </div>
      <div className="col-md-6">
        <Fld label="CPU 2 — Cores">
          <input className={inp} value={vals.cpu2_cores || ''} onChange={e => set('cpu2_cores', e.target.value)} placeholder="8" />
        </Fld>
      </div>

      {/* RAM */}
      <SecHead title="RAM" />

      {[1,2,3,4].map(n => (
        <React.Fragment key={n}>
          <div className="col-12">
            <div className="row g-2">
              <div className="col-3">
                <Fld label={`Slot ${n} — Size (GB)`} half={false}>
                  <input className={inp} value={vals[`ram${n}_size`] || ''} onChange={e => set(`ram${n}_size`, e.target.value)} placeholder="8" />
                </Fld>
              </div>
              <div className="col-3">
                <Fld label="Bus" half={false}>
                  <input className={inp} value={vals[`ram${n}_bus`] || ''} onChange={e => set(`ram${n}_bus`, e.target.value)} placeholder="3200MHz" />
                </Fld>
              </div>
              <div className="col-3">
                <Fld label="Slot No." half={false}>
                  <input className={inp} value={vals[`ram${n}_slot`] || ''} onChange={e => set(`ram${n}_slot`, e.target.value)} placeholder="A1" />
                </Fld>
              </div>
              <div className="col-3">
                <Fld label="Serial No." half={false}>
                  <input className={inp} value={vals[`ram${n}_serial`] || ''} onChange={e => set(`ram${n}_serial`, e.target.value)} placeholder="SN…" />
                </Fld>
              </div>
            </div>
          </div>
        </React.Fragment>
      ))}

      {/* Disks */}
      <SecHead title="Storage (Disks)" />

      {[1,2,3].map(n => (
        <React.Fragment key={n}>
          <div className="col-md-6">
            <Fld label={`Disk ${n} — Type`} half={false}>
              <select className={sel} value={vals[`disk${n}_type`] || ''} onChange={e => set(`disk${n}_type`, e.target.value)}>
                <option value="">— Select —</option>
                {['SATA','SSD','NVMe','NVMe2','SATA SSD'].map(t => <option key={t}>{t}</option>)}
              </select>
            </Fld>
          </div>
          <div className="col-md-6">
            <Fld label={`Disk ${n} — Size`} half={false}>
              <input className={inp} value={vals[`disk${n}_size`] || ''} onChange={e => set(`disk${n}_size`, e.target.value)} placeholder="512GB, 1TB…" />
            </Fld>
          </div>
        </React.Fragment>
      ))}

      {/* Other Details */}
      <SecHead title="Other Details" />

      <div className="col-12">
        <Fld label="Purpose of Use" half={false}>
          <input className={inp} value={vals.purpose || ''} onChange={e => set('purpose', e.target.value)} placeholder="Daily use, Development, Server…" />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Status">
          <select className={sel} value={vals.status || 'available'} onChange={e => set('status', e.target.value)}>
            {['available','assigned','repair','retired','lost'].map(s => <option key={s}>{s}</option>)}
          </select>
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Condition">
          <select className={sel} value={vals.condition || ''} onChange={e => set('condition', e.target.value)}>
            <option value="">— Select —</option>
            {['Working','Good','Fair','Damaged','Under Repair'].map(c => <option key={c}>{c}</option>)}
          </select>
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Warranty Expiry">
          <input type="date" className={inp} value={vals.warranty_expiry || ''} onChange={e => set('warranty_expiry', e.target.value)} />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Purchase Date">
          <input type="date" className={inp} value={vals.purchase_date || ''} onChange={e => set('purchase_date', e.target.value)} />
        </Fld>
      </div>

      <div className="col-md-6">
        <Fld label="Invoice Number">
          <input className={inp} value={vals.invoice_number || ''} onChange={e => set('invoice_number', e.target.value)} placeholder="INV-2024-001" />
        </Fld>
      </div>

      <div className="col-12">
        <Fld label="Notes" half={false}>
          <textarea className={inp} rows={3} value={vals.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes…" style={{ resize: 'none' }} />
        </Fld>
      </div>
    </div>
  )
}

// ── View Renderer ─────────────────────────────────────────
function SystemDeviceView({ row }) {
  const assignedDisplay = () => {
    if (row.assigned_type === 'employee' || row.assigned_type === 'user') return row.assigned_user_name || '—'
    if (row.assigned_type === 'wfh') return `WFH${row.assigned_user_name ? ' — ' + row.assigned_user_name : ''}`
    if (row.assigned_type === 'inventory') return 'Inventory'
    if (row.assigned_type === 'damaged') return 'Damaged'
    return '—'
  }

  const DT = ({ label, value }) => (
    <div className="col-6">
      <dt className="text-secondary fw-semibold text-uppercase mb-1" style={{ fontSize: '11px', letterSpacing: '0.05em' }}>{label}</dt>
      <dd className="small mb-0">{value || <span className="text-secondary">—</span>}</dd>
    </div>
  )

  const ramCount = [1,2,3,4].filter(n => row[`ram${n}_size`]).length
  const diskCount = [1,2,3].filter(n => row[`disk${n}_size`] || row[`disk${n}_type`]).length

  return (
    <div className="d-flex flex-column gap-4">
      <dl className="row g-3">
        <DT label="Asset Tag" value={row.asset_tag} />
        <DT label="Assigned To" value={assignedDisplay()} />
        <DT label="Type" value={row.type} />
        <DT label="Brand" value={row.brand_type} />
        <DT label="Manufacturer" value={row.manufacturer} />
        <DT label="Model" value={row.model} />
        <DT label="Serial No." value={row.serial_number?.toUpperCase()} />
        <DT label="Generation" value={row.generation} />
        <DT label="Department" value={row.department} />
        <DT label="Location" value={row.location} />
        <DT label="Status" value={<Badge status={row.status}>{row.status || '—'}</Badge>} />
        <DT label="Condition" value={row.condition} />
        <DT label="Purpose" value={row.purpose} />
        <DT label="Warranty Expiry" value={row.warranty_expiry} />
      </dl>

      {/* CPU */}
      {(row.cpu || row.cpu2) && (
        <div className="pt-3 border-top">
          <p className="fw-bold text-secondary text-uppercase mb-2" style={{ fontSize: '10px', letterSpacing: '0.1em' }}>Processor</p>
          <div className="row g-2 small">
            {row.cpu && <div className="col-6"><span className="text-secondary">CPU 1:</span> {row.cpu}{row.cpu_cores ? ` (${row.cpu_cores} cores)` : ''}</div>}
            {row.cpu2 && <div className="col-6"><span className="text-secondary">CPU 2:</span> {row.cpu2}{row.cpu2_cores ? ` (${row.cpu2_cores} cores)` : ''}</div>}
          </div>
        </div>
      )}

      {/* RAM */}
      {ramCount > 0 && (
        <div className="pt-3 border-top">
          <p className="fw-bold text-secondary text-uppercase mb-2" style={{ fontSize: '10px', letterSpacing: '0.1em' }}>RAM — {ramCount} slot{ramCount !== 1 ? 's' : ''} installed</p>
          <div className="d-flex flex-column gap-1">
            {[1,2,3,4].filter(n => row[`ram${n}_size`]).map(n => (
              <div key={n} className="d-flex gap-3 small rounded-2 px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <span className="text-secondary fw-medium">Slot {n}</span>
                <span>{row[`ram${n}_size`]}GB</span>
                {row[`ram${n}_bus`] && <span className="text-secondary">{row[`ram${n}_bus`]}</span>}
                {row[`ram${n}_slot`] && <span className="text-secondary">#{row[`ram${n}_slot`]}</span>}
                {row[`ram${n}_serial`] && <span className="text-secondary">SN: {row[`ram${n}_serial`]}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disks */}
      {diskCount > 0 && (
        <div className="pt-3 border-top">
          <p className="fw-bold text-secondary text-uppercase mb-2" style={{ fontSize: '10px', letterSpacing: '0.1em' }}>Storage — {diskCount} disk{diskCount !== 1 ? 's' : ''}</p>
          <div className="d-flex flex-column gap-1">
            {[1,2,3].filter(n => row[`disk${n}_size`] || row[`disk${n}_type`]).map(n => (
              <div key={n} className="d-flex gap-3 small rounded-2 px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <span className="text-secondary fw-medium">Disk {n}</span>
                {row[`disk${n}_type`] && <span>{row[`disk${n}_type`]}</span>}
                {row[`disk${n}_size`] && <span className="text-secondary">{row[`disk${n}_size`]}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {row.notes && (
        <div className="pt-3 border-top">
          <p className="fw-bold text-secondary text-uppercase mb-2" style={{ fontSize: '10px', letterSpacing: '0.1em' }}>Notes</p>
          <p className="small text-secondary mb-0">{row.notes}</p>
        </div>
      )}
    </div>
  )
}

// ── Assigned To display helper ────────────────────────────
function AssignedBadge({ row }) {
  if (row.assigned_type === 'employee' || row.assigned_type === 'user')
    return <span>{row.assigned_user_name || '—'}</span>
  if (row.assigned_type === 'wfh')
    return (
      <span>
        <span className="badge me-1 badge-assign-wfh" style={{ fontSize: '10px' }}>WFH</span>
        {row.assigned_user_name && <span className="text-secondary small">{row.assigned_user_name}</span>}
      </span>
    )
  if (row.assigned_type === 'inventory')
    return <span className="badge badge-assign-inventory" style={{ fontSize: '10px' }}>Inventory</span>
  if (row.assigned_type === 'damaged')
    return <span className="badge badge-assign-damaged" style={{ fontSize: '10px' }}>Damaged</span>
  return <span className="text-secondary">—</span>
}

// ── Module Config ─────────────────────────────────────────
const config = {
  title: 'System Device',
  module: 'systems',
  apiPath: '/api/systems',
  exportFile: 'system-devices-export.csv',
  searchPlaceholder: 'Search by tag, serial, brand, model…',

  qrData: row => {
    const tag = row.asset_tag || genAssetTag(row.purchase_date, 'ID') || row.serial_number || 'System Device'
    const assignedName = (row.assigned_type === 'employee' || row.assigned_type === 'user' || row.assigned_type === 'wfh')
      ? row.assigned_user_name
      : null
    return {
      label: tag,
      value: `Tag:${tag}\nType:${row.type||''}\nBrand:${row.manufacturer||''}\nModel:${row.model||''}\nSN:${row.serial_number||''}\nAssigned:${assignedName||row.assigned_type||'Inventory'}`,
      details: [
        row.type && `Type: ${row.type}`,
        (row.manufacturer || row.model) && `${row.manufacturer||''} ${row.model||''}`.trim(),
        row.serial_number && `S/N: ${row.serial_number}`,
        assignedName ? `Assigned To: ${assignedName}` : row.assigned_type === 'wfh' ? 'WFH' : row.assigned_type === 'damaged' ? 'Damaged' : 'Inventory',
      ].filter(Boolean),
    }
  },

  columns: [
    { key: 'asset_tag',     label: 'Asset Tag',    sortable: true },
    { key: '_assigned',     label: 'Assigned To',  render: (_, row) => <AssignedBadge row={row} /> },
    { key: 'type',          label: 'Type',         sortable: true },
    { key: 'brand_type',    label: 'Brand',        render: v => v || <span className="text-secondary">—</span> },
    { key: 'manufacturer',  label: 'Manufacturer', sortable: true },
    { key: 'model',         label: 'Model' },
    { key: 'serial_number', label: 'Serial No.', render: v => v ? v.toUpperCase() : '—' },
  ],

  fields: [], // validation handled by config.validate

  validate: vals => {
    if (!vals.asset_tag) return 'Asset Tag is required'
    if (!vals.type) return 'Type is required'
    if (!vals.manufacturer) return 'Manufacturer is required'
    if (!vals.model) return 'Model is required'
    if (!vals.serial_number) return 'Serial No. is required'
    return null
  },

  renderForm: (vals, setVals) => <SystemDeviceForm vals={vals} setVals={setVals} />,

  renderView: row => <SystemDeviceView row={row} />,

  viewExtra: row => <MaintenanceLog row={row} assetType="system" />,
}

export default function SystemDevices() { return <ModulePage config={config} /> }
