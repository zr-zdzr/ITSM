import React from 'react'
import { cn } from '../../lib/utils'

const PRESETS = {
  active:      'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  available:   'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  assigned:    'bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/20',
  inactive:    'bg-zinc-500/10 text-zinc-400 ring-1 ring-zinc-500/20',
  retired:     'bg-zinc-500/10 text-zinc-400 ring-1 ring-zinc-500/20',
  repair:      'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
  damaged:     'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
  lost:        'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
  suspended:   'bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20',
  working:     'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  permanent:   'bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/20',
  contractual: 'bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20',
  default:     'bg-zinc-500/10 text-zinc-400 ring-1 ring-zinc-500/20',
}

export default function Badge({ children, status, className }) {
  const key = (status || String(children || '')).toLowerCase().replace(/[^a-z]/g, '')
  return (
    <span className={cn('badge', PRESETS[key] || PRESETS.default, className)}>
      {children}
    </span>
  )
}
