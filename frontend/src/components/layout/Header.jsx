import React, { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { RefreshCw, Sun, Moon, LogOut, KeyRound, ChevronDown, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { api } from '../../lib/api'
import Modal from '../ui/Modal'
import RecycleBinModal from '../ui/RecycleBinModal'

const TITLES = {
  '/':            { title: 'Dashboard',        sub: 'IT inventory overview' },
  '/systems':     { title: 'Systems',          sub: 'Laptop, desktop & server inventory' },
  '/network':     { title: 'Network Devices',  sub: 'Switches, routers, firewalls' },
  '/mobiles':     { title: 'Mobile Devices',   sub: 'Company mobile device inventory' },
  '/sims':        { title: 'SIM Cards',        sub: 'SIM card management' },
  '/gws':         { title: 'Cloud IDs',        sub: 'Cloud account management' },
  '/employees':   { title: 'Employees',        sub: 'Company employee directory' },
  '/reports':     { title: 'Reports',          sub: 'Analytics and exports' },
  '/users':       { title: 'User Management',  sub: 'System access control' },
  '/logs':        { title: 'Activity Log',     sub: 'Portal event history' },
  '/inventory':   { title: 'Inventory Stock',  sub: 'Consumables & returnable item stock' },
  '/requests':    { title: 'Requests',         sub: 'Item requests, approvals & fulfillment' },
  '/assignments': { title: 'Assignments',      sub: 'Assigned items & return tracking' },
}

export default function Header({ onRefresh }) {
  const { user, logout } = useAuth()
  const { toast } = useToast()
  const location = useLocation()
  const { title, sub } = TITLES[location.pathname] || TITLES['/']
  const [open, setOpen] = useState(false)
  const [cpModal, setCpModal] = useState(false)
  const [cpData, setCpData] = useState({ cur: '', nw: '', con: '' })
  const [darkMode, setDarkMode] = useState(document.documentElement.classList.contains('dark'))
  const [recycleBinOpen, setRecycleBinOpen] = useState(false)
  const [recycleBinCount, setRecycleBinCount] = useState(0)
  const dropRef = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (!dropRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    api.get('/api/recycle-bin/count').then(d => setRecycleBinCount(d.count || 0)).catch(() => {})
  }, [])

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark')
    setDarkMode(isDark)
    localStorage.setItem('itms-theme', isDark ? 'dark' : 'light')
    setOpen(false)
  }

  async function handleLogout() { await logout(); window.location.href = '/login' }

  async function changePassword() {
    const { cur, nw, con } = cpData
    if (!cur || !nw || !con) return toast('All fields are required', 'error')
    if (nw.length < 6) return toast('New password must be at least 6 characters', 'error')
    if (nw !== con) return toast('Passwords do not match', 'error')
    try {
      await api.post('/auth/change-password', { current_password: cur, new_password: nw })
      toast('Password changed', 'success')
      setCpModal(false)
      setCpData({ cur: '', nw: '', con: '' })
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <>
      <header className="relative z-30 h-14 flex-shrink-0 flex items-center gap-4 px-5 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/80 backdrop-blur-sm">
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">{title}</h1>
          <p className="text-[11px] text-zinc-500 truncate hidden sm:block">{sub}</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setRecycleBinOpen(true)} title="Recycle Bin"
            className="relative p-2 rounded-lg text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <Trash2 size={15} />
            {recycleBinCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
                {recycleBinCount > 99 ? '99+' : recycleBinCount}
              </span>
            )}
          </button>
          <button onClick={onRefresh} title="Refresh"
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <RefreshCw size={15} />
          </button>

          <div className="relative" ref={dropRef}>
            <button onClick={() => setOpen(o => !o)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              {user?.avatar_url
                ? <img src={user.avatar_url} alt="" className="w-6 h-6 rounded-full ring-1 ring-zinc-300 dark:ring-zinc-700" />
                : <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-500 dark:text-brand-400 text-xs font-bold">
                    {(user?.name || 'U')[0].toUpperCase()}
                  </div>
              }
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 hidden md:block max-w-[120px] truncate">{user?.name}</span>
              <ChevronDown size={13} className="text-zinc-500" />
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-1.5 w-52 card shadow-xl shadow-black/10 dark:shadow-black/20 py-1 z-50 animate-scale-in">
                <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{user?.name}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5 capitalize">{user?.role?.replace('_', ' ')}</p>
                </div>
                <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  {darkMode ? <Sun size={14} /> : <Moon size={14} />}
                  {darkMode ? 'Light mode' : 'Dark mode'}
                </button>
                <button onClick={() => { setCpModal(true); setOpen(false) }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  <KeyRound size={14} /> Change Password
                </button>
                <div className="border-t border-zinc-200 dark:border-zinc-800 mt-1 pt-1">
                  <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-red-500/10 transition-colors">
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <RecycleBinModal
        open={recycleBinOpen}
        onClose={() => setRecycleBinOpen(false)}
        onCountChange={setRecycleBinCount}
      />

      <Modal open={cpModal} onClose={() => setCpModal(false)} title="Change Password" size="sm">
        <div className="space-y-3">
          {['cur', 'nw', 'con'].map((k, i) => (
            <div key={k}>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                {['Current Password', 'New Password', 'Confirm New Password'][i]}
              </label>
              <input type="password" value={cpData[k]}
                onChange={e => setCpData(p => ({ ...p, [k]: e.target.value }))}
                className="input-base" placeholder="••••••••" />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary" onClick={() => setCpModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={changePassword}>Change Password</button>
        </div>
      </Modal>
    </>
  )
}
