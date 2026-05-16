import React, { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RefreshCw, Sun, Moon, LogOut, KeyRound, ChevronDown, Trash2, Bell, Search, AlertTriangle, Package, RotateCcw, Clock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import Modal from '../ui/Modal'
import RecycleBinModal from '../ui/RecycleBinModal'
import GlobalSearch from '../ui/GlobalSearch'

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
  const navigate = useNavigate()
  const location = useLocation()
  const { title, sub } = TITLES[location.pathname] || TITLES['/']
  const [open, setOpen] = useState(false)
  const [cpModal, setCpModal] = useState(false)
  const [cpData, setCpData] = useState({ cur: '', nw: '', con: '' })
  const [darkMode, setDarkMode] = useState(document.documentElement.classList.contains('dark'))
  const [recycleBinOpen, setRecycleBinOpen] = useState(false)
  const [recycleBinCount, setRecycleBinCount] = useState(0)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [alertCount, setAlertCount] = useState(0)
  const [alertData, setAlertData] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const dropRef = useRef(null)
  const alertRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (!dropRef.current?.contains(e.target)) setOpen(false)
      if (!alertRef.current?.contains(e.target)) setAlertsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    api.get('/api/recycle-bin/count').then(d => setRecycleBinCount(d.count || 0)).catch(() => {})
  }, [])

  useEffect(() => {
    function loadAlerts() {
      api.get('/api/alerts/count').then(d => setAlertCount(d.count || 0)).catch(() => {})
    }
    loadAlerts()
    const interval = setInterval(loadAlerts, 60000)
    return () => clearInterval(interval)
  }, [])

  async function openAlerts() {
    setAlertsOpen(o => !o)
    if (!alertData) {
      try {
        const data = await api.get('/api/alerts')
        setAlertData(data)
      } catch { /* silent */ }
    }
  }

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
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
          {/* Global Search trigger */}
          <button onClick={() => setSearchOpen(true)} title="Search (Ctrl+K)"
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-xs">
            <Search size={13} />
            <span className="text-zinc-400">Search…</span>
            <kbd className="ml-1 text-[9px] font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">⌘K</kbd>
          </button>
          <button onClick={() => setSearchOpen(true)} title="Search" className="sm:hidden p-2 rounded-lg text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <Search size={15} />
          </button>

          {/* Alerts bell */}
          <div className="relative" ref={alertRef}>
            <button onClick={openAlerts} title="Alerts"
              className="relative p-2 rounded-lg text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              <Bell size={15} />
              {alertCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white leading-none">
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
            </button>
            {alertsOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-80 card shadow-xl shadow-black/10 dark:shadow-black/20 z-50 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Alerts</span>
                  <span className="text-[10px] text-zinc-400">{alertData?.totalCount ?? '…'} active</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {!alertData ? (
                    <div className="px-4 py-6 text-center text-xs text-zinc-400">Loading…</div>
                  ) : alertData.totalCount === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-zinc-400">No active alerts</div>
                  ) : (
                    <>
                      {alertData.inventory?.length > 0 && (
                        <div>
                          <div className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-1.5">
                            <Package size={10} /> Inventory Stock
                          </div>
                          {alertData.inventory.map((a, i) => (
                            <button key={i} onClick={() => { navigate('/inventory'); setAlertsOpen(false) }}
                              className="w-full flex items-start gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 border-b border-zinc-100 dark:border-zinc-800/40 transition-colors text-left">
                              <AlertTriangle size={12} className={a.alert_type === 'out_of_stock' ? 'text-red-500 mt-0.5 flex-shrink-0' : 'text-amber-500 mt-0.5 flex-shrink-0'} />
                              <div>
                                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{a.item_name}</p>
                                <p className="text-[10px] text-zinc-500">{a.alert_type === 'out_of_stock' ? 'Out of stock' : `Low stock — ${a.current_value} ${a.unit || ''} remaining`}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {alertData.overdueReturns?.length > 0 && (
                        <div>
                          <div className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-1.5">
                            <RotateCcw size={10} /> Overdue Returns
                          </div>
                          {alertData.overdueReturns.map((a, i) => (
                            <button key={i} onClick={() => { navigate('/assignments'); setAlertsOpen(false) }}
                              className="w-full flex items-start gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 border-b border-zinc-100 dark:border-zinc-800/40 transition-colors text-left">
                              <RotateCcw size={12} className="text-red-500 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{a.asn_number} · {a.assignee_name}</p>
                                <p className="text-[10px] text-red-500">Due {new Date(a.expected_return_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {alertData.warranties?.length > 0 && (
                        <div>
                          <div className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-1.5">
                            <Clock size={10} /> Expiring Warranties
                          </div>
                          {alertData.warranties.map((a, i) => (
                            <button key={i} onClick={() => { navigate('/reports'); setAlertsOpen(false) }}
                              className="w-full flex items-start gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 border-b border-zinc-100 dark:border-zinc-800/40 transition-colors text-left">
                              <Clock size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{a.label} · {a.manufacturer} {a.model}</p>
                                <p className="text-[10px] text-amber-600 dark:text-amber-400">{a.category} · {a.days_remaining}d remaining</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

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

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

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
