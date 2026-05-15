import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { UserPlus, Trash2, Shield, AlertTriangle, Check } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import Modal from '../components/ui/Modal'
import { Navigate } from 'react-router-dom'

const ROLE_COLORS = {
  super_admin: 'bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20',
  user:        'bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/20',
}

const MODULES = [
  { id: 'systems',   label: 'Systems' },
  { id: 'network',   label: 'Network Devices' },
  { id: 'mobiles',   label: 'Mobile Devices' },
  { id: 'sims',      label: 'SIM Cards' },
  { id: 'gws',       label: 'Cloud IDs' },
  { id: 'employees', label: 'Employees' },
  { id: 'reports',   label: 'Reports' },
]
const CRUDS = ['create','read','update','delete']

function emptyPerms() {
  const p = {}
  MODULES.forEach(m => { p[m.id] = { can_create:false, can_read:false, can_update:false, can_delete:false } })
  return p
}

export default function UserManagement() {
  const { user: me } = useAuth()
  const { toast } = useToast()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [addModal, setAddModal] = useState(false)
  const [delTarget, setDelTarget] = useState(null)
  const [form, setForm] = useState({ employee_id: '', role: 'user', password: '' })
  const [employees, setEmployees] = useState([])
  const [saving, setSaving] = useState(false)

  // Permissions editor
  const [permTarget, setPermTarget] = useState(null)   // user object
  const [perms, setPerms] = useState(emptyPerms())
  const [permSaving, setPermSaving] = useState(false)

  if (me?.role !== 'super_admin') return <Navigate to="/" replace />

  async function load() {
    setLoading(true)
    try {
      const [userList, permsList] = await Promise.all([
        api.get('/api/users'),
        Promise.resolve([]),
      ])
      setUsers(userList)
    }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    api.get('/api/users/employees/available').then(setEmployees).catch(() => {})
  }, [])

  async function addUser() {
    if (!form.employee_id) return toast('Select an employee', 'error')
    if (!form.password || form.password.length < 6) return toast('Password must be at least 6 characters', 'error')
    setSaving(true)
    try {
      await api.post('/api/users', form)
      toast('User created', 'success')
      setAddModal(false)
      setForm({ employee_id: '', role: 'user', password: '' })
      await load()
      // refresh available employees
      api.get('/api/users/employees/available').then(setEmployees).catch(() => {})
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function deleteUser(u) {
    try {
      await api.del(`/api/users/${u.id}`)
      toast('User removed', 'success')
      setDelTarget(null)
      setUsers(p => p.filter(x => x.id !== u.id))
    } catch (e) { toast(e.message, 'error') }
  }

  async function openPerms(u) {
    setPermTarget(u)
    try {
      const data = await api.get(`/api/users/${u.id}/permissions`)
      setPerms(data)
    } catch (e) {
      toast(e.message, 'error')
      setPerms(emptyPerms())
    }
  }

  function togglePerm(mod, action) {
    setPerms(p => ({
      ...p,
      [mod]: { ...p[mod], [`can_${action}`]: !p[mod]?.[`can_${action}`] }
    }))
  }

  async function savePerms() {
    setPermSaving(true)
    try {
      await api.put(`/api/users/${permTarget.id}/permissions`, { permissions: perms })
      toast('Permissions saved', 'success')
      setPermTarget(null)
      await load()
    } catch (e) { toast(e.message, 'error') }
    finally { setPermSaving(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">{users.length} portal user{users.length !== 1 ? 's' : ''}</p>
        <button className="btn-primary" onClick={() => setAddModal(true)}>
          <UserPlus size={14} /> Add User
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                {['Name','Email','Role','Modules with Access',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-zinc-500">Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-zinc-500">No users found</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                  <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] || ROLE_COLORS.user}`}>
                      {u.role?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'super_admin' ? (
                      <span className="text-xs text-zinc-500">All modules (full access)</span>
                    ) : u.permissions ? (
                      <div className="flex flex-wrap gap-1">
                        {Object.keys(u.permissions).filter(k => u.permissions[k].can_read).map(k => (
                          <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{k}</span>
                        ))}
                        {Object.keys(u.permissions).every(k => !u.permissions[k].can_read) && (
                          <span className="text-xs text-zinc-600">No access</span>
                        )}
                      </div>
                    ) : <span className="text-xs text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {u.role !== 'super_admin' && (
                        <button onClick={() => openPerms(u)} title="Edit Permissions"
                          className="p-1.5 rounded hover:bg-brand-500/15 text-zinc-500 hover:text-brand-400 transition-colors">
                          <Shield size={13} />
                        </button>
                      )}
                      {u.id !== me?.id && (
                        <button onClick={() => setDelTarget(u)}
                          className="p-1.5 rounded hover:bg-red-500/15 text-zinc-500 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add User Modal ── */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Portal User" size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Employee<span className="text-red-400 ml-0.5">*</span></label>
            <select value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))} className="input-base">
              <option value="">— Select employee —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name} — {e.designation}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Password<span className="text-red-400 ml-0.5">*</span></label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              className="input-base"
              placeholder="Min. 6 characters"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Role</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="input-base">
              <option value="user">User</option>
              <option value="super_admin">Super Admin (full access)</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary" onClick={() => setAddModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={addUser} disabled={saving}>
            {saving ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </Modal>

      {/* ── Permissions Modal ── */}
      <Modal open={!!permTarget} onClose={() => setPermTarget(null)} title={`Permissions — ${permTarget?.name}`} size="lg">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide w-40">Module</th>
                {CRUDS.map(c => (
                  <th key={c} className="px-3 py-2.5 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wide">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map(m => (
                <tr key={m.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                  <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300 font-medium">{m.label}</td>
                  {CRUDS.map(action => (
                    <td key={action} className="px-3 py-3 text-center">
                      <button
                        onClick={() => togglePerm(m.id, action)}
                        className={`w-5 h-5 rounded flex items-center justify-center mx-auto transition-colors ${
                          perms[m.id]?.[`can_${action}`]
                            ? 'bg-brand-500 text-white hover:bg-brand-600'
                            : 'bg-zinc-800 border border-zinc-700 text-transparent hover:border-zinc-500'
                        }`}
                      >
                        <Check size={11} />
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-zinc-800">
          <button className="btn-secondary" onClick={() => setPermTarget(null)}>Cancel</button>
          <button className="btn-primary" onClick={savePerms} disabled={permSaving}>
            {permSaving ? 'Saving…' : 'Save Permissions'}
          </button>
        </div>
      </Modal>

      {/* ── Delete confirm ── */}
      <Modal open={!!delTarget} onClose={() => setDelTarget(null)} title="Remove User" size="sm">
        <div className="flex gap-3">
          <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-300">Remove <strong className="text-zinc-100">{delTarget?.name}</strong> from portal access?</p>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary" onClick={() => setDelTarget(null)}>Cancel</button>
          <button className="btn-base bg-red-500 hover:bg-red-600 text-white" onClick={() => deleteUser(delTarget)}>Remove</button>
        </div>
      </Modal>
    </motion.div>
  )
}
