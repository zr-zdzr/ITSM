import React, { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { cn } from '../../lib/utils'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  function handleRefresh() {
    // Re-navigate to same path to trigger page reload
    navigate(location.pathname + location.search, { replace: true })
    window.dispatchEvent(new CustomEvent('module-action', { detail: { action: 'refresh' } }))
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div className={cn(
        'flex-1 flex flex-col min-h-screen overflow-hidden transition-all duration-300',
        collapsed ? 'ml-[60px]' : 'ml-[240px]'
      )}>
        <Header onRefresh={handleRefresh} />
        <main className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
          <div className="p-5">
            <Outlet />
          </div>
        </main>
        <footer className="flex-shrink-0 px-5 py-3 text-center text-[11px] text-zinc-500 dark:text-zinc-600 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          © {new Date().getFullYear()} Bykea IT Department · Created by Zeeshan Rafiq · v2.0
        </footer>
      </div>
    </div>
  )
}
