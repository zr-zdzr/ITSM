import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Monitor, Network, Smartphone, CreditCard, Cloud,
  Users, BarChart3, UserCog, ChevronRight, Layers, Plus, FileDown,
  FileUp, Trash2, PanelLeftClose, PanelLeftOpen, ScrollText,
  Package, ClipboardList, PackageCheck,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../lib/api'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  {
    id: 'systems', label: 'Systems', icon: Monitor, path: '/systems',
    sub: [
      { label: 'Add System',  icon: Plus,    action: 'add' },
      { label: 'Import CSV',  icon: FileUp,  action: 'import', perm: 'create' },
      { label: 'Export CSV',  icon: FileDown,action: 'export' },
      { label: 'Delete All',  icon: Trash2,  action: 'delete-all', perm: 'delete', danger: true },
    ],
  },
  {
    id: 'network', label: 'Network Devices', icon: Network, path: '/network',
    sub: [
      { label: 'Add Device',  icon: Plus,    action: 'add', perm: 'create' },
      { label: 'Import CSV',  icon: FileUp,  action: 'import', perm: 'create' },
      { label: 'Export CSV',  icon: FileDown,action: 'export' },
      { label: 'Delete All',  icon: Trash2,  action: 'delete-all', perm: 'delete', danger: true },
    ],
  },
  {
    id: 'mobiles', label: 'Mobile Devices', icon: Smartphone, path: '/mobiles',
    sub: [
      { label: 'Add Device',  icon: Plus,    action: 'add', perm: 'create' },
      { label: 'Import CSV',  icon: FileUp,  action: 'import', perm: 'create' },
      { label: 'Export CSV',  icon: FileDown,action: 'export' },
      { label: 'Delete All',  icon: Trash2,  action: 'delete-all', perm: 'delete', danger: true },
    ],
  },
  {
    id: 'sims', label: 'SIM Cards', icon: CreditCard, path: '/sims',
    sub: [
      { label: 'Add SIM',     icon: Plus,    action: 'add', perm: 'create' },
      { label: 'Import CSV',  icon: FileUp,  action: 'import', perm: 'create' },
      { label: 'Export CSV',  icon: FileDown,action: 'export' },
      { label: 'Delete All',  icon: Trash2,  action: 'delete-all', perm: 'delete', danger: true },
    ],
  },
  {
    id: 'gws', label: 'Cloud IDs', icon: Cloud, path: '/gws',
    sub: [
      { label: 'Add Cloud ID',icon: Plus,    action: 'add', perm: 'create' },
      { label: 'Import CSV',  icon: FileUp,  action: 'import', perm: 'create' },
      { label: 'Export CSV',  icon: FileDown,action: 'export' },
      { label: 'Delete All',  icon: Trash2,  action: 'delete-all', perm: 'delete', danger: true },
    ],
  },
  {
    id: 'employees', label: 'Employees', icon: Users, path: '/employees',
    sub: [
      { label: 'Add Employee',icon: Plus,    action: 'add', perm: 'create' },
      { label: 'Import CSV',  icon: FileUp,  action: 'import', perm: 'create' },
      { label: 'Export CSV',  icon: FileDown,action: 'export' },
      { label: 'Delete All',  icon: Trash2,  action: 'delete-all', perm: 'delete', danger: true },
    ],
  },
  {
    id: 'reports', label: 'Reports', icon: BarChart3, path: '/reports',
    sub: [
      { label: 'Export Summary', icon: FileDown, action: 'export' },
    ],
  },
]

function StockNavItem({ item, collapsed, badge }) {
  const location = useLocation()
  const navigate  = useNavigate()
  const isActive  = location.pathname.startsWith(item.path)
  const Icon = item.icon
  return (
    <button
      onClick={() => navigate(item.path)}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative',
        isActive
          ? 'bg-brand-500/15 text-brand-500 dark:text-brand-400'
          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/70',
      )}
    >
      {isActive && <span className="absolute left-0 w-0.5 h-5 bg-brand-500 rounded-r" />}
      <Icon size={16} className="flex-shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left truncate">{item.label}</span>
          {badge > 0 && (
            <span className="text-[10px] bg-brand-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
              {badge}
            </span>
          )}
        </>
      )}
    </button>
  )
}

function NavItem({ item, collapsed, canPerm }) {
  const location = useLocation()
  const navigate = useNavigate()
  const isActive = item.path === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(item.path)
  const [open, setOpen] = useState(isActive && !!item.sub)
  const Icon = item.icon

  const visibleSubs = item.sub?.filter(s =>
    !s.perm || canPerm(item.id, s.perm)
  )

  function handleNav(e) {
    e.preventDefault()
    navigate(item.path)
    if (item.sub) setOpen(o => !o)
  }

  function handleSubAction(action) {
    navigate(item.path)
    setTimeout(() => window.dispatchEvent(new CustomEvent('module-action', { detail: { action } })), 80)
  }

  return (
    <div>
      <button
        onClick={handleNav}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
          isActive
            ? 'bg-brand-500/15 text-brand-500 dark:text-brand-400'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/70',
        )}
      >
        {isActive && <span className="absolute left-0 w-0.5 h-5 bg-brand-500 rounded-r" />}
        <Icon size={16} className="flex-shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left truncate">{item.label}</span>
            {item.sub && (
              <ChevronRight size={13} className={cn(
                'flex-shrink-0 transition-transform duration-200 opacity-40',
                open && 'rotate-90 opacity-100'
              )} />
            )}
          </>
        )}
      </button>

      {!collapsed && item.sub && (
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className={cn(
                'mt-0.5 ml-0 rounded-b-lg overflow-hidden',
                isActive ? 'bg-brand-500/5' : 'bg-zinc-50 dark:bg-zinc-800/30'
              )}>
                {visibleSubs?.map(s => {
                  const SIcon = s.icon
                  return (
                    <button
                      key={s.action}
                      onClick={() => handleSubAction(s.action)}
                      className={cn(
                        'w-full flex items-center gap-2.5 pl-8 pr-3 py-2 text-xs transition-colors',
                        s.danger
                          ? 'text-red-400/70 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10'
                          : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/50'
                      )}
                    >
                      <SIcon size={12} className="flex-shrink-0" />
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  )
}

const STOCK_NAV = [
  { id: 'inventory',   label: 'Inventory Stock', icon: Package,       path: '/inventory' },
  { id: 'requests',    label: 'Requests',         icon: ClipboardList, path: '/requests' },
  { id: 'assignments', label: 'Assignments',      icon: PackageCheck,  path: '/assignments' },
]

export default function Sidebar({ collapsed, onToggle }) {
  const { user, canPerm } = useAuth()
  const isSA = user?.role === 'super_admin'
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!user) return
    api.get('/api/requests/count').then(r => setPendingCount(r.count || 0)).catch(() => {})
    const interval = setInterval(() => {
      api.get('/api/requests/count').then(r => setPendingCount(r.count || 0)).catch(() => {})
    }, 60000)
    return () => clearInterval(interval)
  }, [user])

  return (
    <aside className={cn(
      'fixed inset-y-0 left-0 z-40 flex flex-col bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 transition-all duration-300',
      collapsed ? 'w-[60px]' : 'w-[240px]'
    )}>
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center flex-shrink-0">
          <Layers size={14} className="text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-tight">ITMS</div>
            <div className="text-[10px] text-zinc-500 leading-tight">Bykea IT</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-0.5 relative">
        {!collapsed && (
          <p className="px-3 pt-1 pb-2 text-[10px] font-semibold tracking-widest text-zinc-400 dark:text-zinc-600 uppercase">Overview</p>
        )}
        <NavItem item={NAV[0]} collapsed={collapsed} canPerm={canPerm} />

        {!collapsed && (
          <p className="px-3 pt-3 pb-2 text-[10px] font-semibold tracking-widest text-zinc-400 dark:text-zinc-600 uppercase">Inventory</p>
        )}
        {NAV.slice(1, 7).filter(item => canPerm(item.id, 'read')).map(item => (
          <NavItem key={item.id} item={item} collapsed={collapsed} canPerm={canPerm} />
        ))}

        {!collapsed && (
          <p className="px-3 pt-3 pb-2 text-[10px] font-semibold tracking-widest text-zinc-400 dark:text-zinc-600 uppercase">Stock & Requests</p>
        )}
        {STOCK_NAV.map(item => (
          <StockNavItem key={item.id} item={item} collapsed={collapsed} badge={item.id === 'requests' ? pendingCount : 0} />
        ))}

        {!collapsed && (
          <p className="px-3 pt-3 pb-2 text-[10px] font-semibold tracking-widest text-zinc-400 dark:text-zinc-600 uppercase">Analytics</p>
        )}
        {canPerm('reports', 'read') && (
          <NavItem item={NAV[7]} collapsed={collapsed} canPerm={canPerm} />
        )}

        {isSA && (
          <>
            {!collapsed && (
              <p className="px-3 pt-3 pb-2 text-[10px] font-semibold tracking-widest text-zinc-400 dark:text-zinc-600 uppercase">Management</p>
            )}
            <NavItem
              item={{ id: 'users', label: 'User Management', icon: UserCog, path: '/users' }}
              collapsed={collapsed}
              canPerm={canPerm}
            />
            <NavItem
              item={{ id: 'logs', label: 'Activity Log', icon: ScrollText, path: '/logs' }}
              collapsed={collapsed}
              canPerm={canPerm}
            />
          </>
        )}
      </nav>

      {/* Toggle */}
      <div className="flex-shrink-0 p-2 border-t border-zinc-200 dark:border-zinc-800">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <><PanelLeftClose size={15} /><span className="text-zinc-500 dark:text-zinc-400">Collapse</span></>}
        </button>
      </div>
    </aside>
  )
}
