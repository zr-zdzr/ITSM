import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Monitor, Network, Smartphone, CreditCard, Cloud, Users, Package } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'

const MODULE_META = {
  systems:   { label: 'Systems',       icon: Monitor,     color: 'text-brand-500 dark:text-brand-400',   bg: 'bg-brand-500/10' },
  network:   { label: 'Network',       icon: Network,     color: 'text-sky-600 dark:text-sky-400',       bg: 'bg-sky-500/10' },
  mobiles:   { label: 'Mobile',        icon: Smartphone,  color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  sims:      { label: 'SIM',           icon: CreditCard,  color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10' },
  gws:       { label: 'Cloud ID',      icon: Cloud,       color: 'text-cyan-600 dark:text-cyan-400',     bg: 'bg-cyan-500/10' },
  employees: { label: 'Employee',      icon: Users,       color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-500/10' },
  inventory: { label: 'Inventory',     icon: Package,     color: 'text-teal-600 dark:text-teal-400',     bg: 'bg-teal-500/10' },
}

export default function GlobalSearch({ open, onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const search = useCallback((q) => {
    clearTimeout(timerRef.current)
    if (q.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      try {
        const data = await api.get(`/api/search?q=${encodeURIComponent(q)}`)
        setResults(data)
        setActiveIdx(0)
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 280)
  }, [])

  function handleChange(e) {
    const q = e.target.value
    setQuery(q)
    search(q)
  }

  function go(result) {
    navigate(result.path)
    onClose()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[activeIdx]) go(results[activeIdx])
  }

  // Group results by module
  const grouped = results.reduce((acc, r) => {
    if (!acc[r.module]) acc[r.module] = []
    acc[r.module].push(r)
    return acc
  }, {})

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl shadow-black/30 border border-zinc-200 dark:border-zinc-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <Search size={16} className="text-zinc-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search across all modules…"
            className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
              <X size={14} />
            </button>
          )}
          <kbd className="hidden sm:block text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="px-4 py-8 text-center text-sm text-zinc-400">Searching…</div>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-zinc-400">No results for <strong>"{query}"</strong></div>
          )}
          {!loading && query.length < 2 && (
            <div className="px-4 py-6 text-center text-xs text-zinc-500">Type at least 2 characters to search</div>
          )}
          {!loading && Object.entries(grouped).map(([module, items]) => {
            const meta = MODULE_META[module] || { label: module, icon: Package, color: 'text-zinc-500', bg: 'bg-zinc-100 dark:bg-zinc-800' }
            const Icon = meta.icon
            return (
              <div key={module}>
                <div className="flex items-center gap-2 px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
                  <Icon size={11} className={meta.color} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{meta.label}</span>
                  <span className="ml-auto text-[10px] text-zinc-400">{items.length}</span>
                </div>
                {items.map((r, i) => {
                  const globalIdx = results.indexOf(r)
                  return (
                    <button
                      key={`${r.module}-${r.id}`}
                      onClick={() => go(r)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-zinc-100 dark:border-zinc-800/50',
                        globalIdx === activeIdx
                          ? 'bg-brand-500/10 dark:bg-brand-500/10'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30'
                      )}
                    >
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0', meta.bg, meta.color)}>
                        {meta.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{r.label}</div>
                        {r.sub && <div className="text-[10px] text-zinc-400 truncate">{r.sub}</div>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-3 text-[10px] text-zinc-400">
            <span><kbd className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">↵</kbd> go to module</span>
            <span className="ml-auto">{results.length} result{results.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  )
}
