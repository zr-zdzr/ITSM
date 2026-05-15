import React, { useMemo, useRef, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'

const PAGE_SIZE = 25

export default function DataTable({
  columns, data, loading, searchPlaceholder = 'Search…',
  selectable = false, selectedIds, onSelectionChange,
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    if (!query.trim()) return data
    const q = query.toLowerCase()
    return data.filter(row =>
      columns.some(col => String(row[col.key] ?? '').toLowerCase().includes(q))
    )
  }, [data, query, columns])

  const sorted = useMemo(() => {
    if (!sort.key) return filtered
    return [...filtered].sort((a, b) => {
      const va = String(a[sort.key] ?? ''), vb = String(b[sort.key] ?? '')
      return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
  }, [filtered, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Selection helpers
  const filteredIds = useMemo(() => filtered.map(r => r.id).filter(Boolean), [filtered])
  const allChecked = selectable && filteredIds.length > 0 && filteredIds.every(id => selectedIds?.has(id))
  const someChecked = selectable && filteredIds.some(id => selectedIds?.has(id))
  const headerCheckRef = useRef(null)

  useMemo(() => {
    if (headerCheckRef.current) headerCheckRef.current.indeterminate = someChecked && !allChecked
  }, [someChecked, allChecked])

  function toggleAll() {
    if (!onSelectionChange) return
    if (allChecked) {
      const next = new Set(selectedIds)
      filteredIds.forEach(id => next.delete(id))
      onSelectionChange(next)
    } else {
      onSelectionChange(new Set([...(selectedIds || []), ...filteredIds]))
    }
  }

  function toggleRow(id) {
    if (!onSelectionChange) return
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    onSelectionChange(next)
  }

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
    setPage(1)
  }

  function SortIcon({ colKey }) {
    if (sort.key !== colKey) return <ChevronsUpDown size={12} className="opacity-30" />
    return sort.dir === 'asc' ? <ChevronUp size={12} className="text-brand-400" /> : <ChevronDown size={12} className="text-brand-400" />
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setPage(1) }}
          placeholder={searchPlaceholder}
          className="input-base pl-9"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                {selectable && (
                  <th className="px-3 py-2 w-10">
                    <input
                      type="checkbox"
                      ref={headerCheckRef}
                      checked={allChecked}
                      onChange={toggleAll}
                      className="rounded border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-800 accent-indigo-500 cursor-pointer"
                    />
                  </th>
                )}
                {columns.map(col => (
                  <th key={col.key}
                    onClick={() => col.sortable !== false && toggleSort(col.key)}
                    className={cn(
                      'px-3 py-2 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider select-none whitespace-nowrap',
                      col.sortable !== false && 'cursor-pointer hover:text-zinc-800 dark:hover:text-zinc-200'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.label}
                      {col.sortable !== false && <SortIcon colKey={col.key} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-8 text-center">
                    <div className="flex items-center justify-center gap-2 text-zinc-500">
                      <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                      Loading…
                    </div>
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-12 text-center text-zinc-500 text-sm">
                    {query ? `No results for "${query}"` : 'No records found'}
                  </td>
                </tr>
              ) : paginated.map((row, i) => (
                <tr key={row.id ?? i}
                  className={cn(
                    'border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors',
                    selectable && selectedIds?.has(row.id) && 'bg-brand-500/5'
                  )}
                >
                  {selectable && (
                    <td className="px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds?.has(row.id) ?? false}
                        onChange={() => toggleRow(row.id)}
                        className="rounded border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-800 accent-indigo-500 cursor-pointer"
                      />
                    </td>
                  )}
                  {columns.map(col => (
                    <td key={col.key} className={cn('px-3 py-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap', col.className)}>
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? <span className="text-zinc-400 dark:text-zinc-600">—</span>)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{sorted.length} record{sorted.length !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="px-2">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
