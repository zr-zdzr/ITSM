import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

export default function StatsCard({ icon: Icon, label, value, sub, color = 'brand', loading }) {
  const colors = {
    brand:   'from-brand-500/10 to-brand-600/5 text-brand-400 ring-brand-500/20',
    emerald: 'from-emerald-500/10 to-emerald-600/5 text-emerald-400 ring-emerald-500/20',
    amber:   'from-amber-500/10 to-amber-600/5 text-amber-400 ring-amber-500/20',
    rose:    'from-rose-500/10 to-rose-600/5 text-rose-400 ring-rose-500/20',
    purple:  'from-purple-500/10 to-purple-600/5 text-purple-400 ring-purple-500/20',
    cyan:    'from-cyan-500/10 to-cyan-600/5 text-cyan-400 ring-cyan-500/20',
    sky:     'from-sky-500/10 to-sky-600/5 text-sky-400 ring-sky-500/20',
  }
  const c = colors[color] || colors.brand
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="card p-5 flex items-start gap-4"
    >
      <div className={cn('flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ring-1 flex items-center justify-center', c)}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 font-medium truncate">{label}</p>
        {loading
          ? <div className="h-7 w-12 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mt-1" />
          : <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight">{value ?? '—'}</p>
        }
        {sub && <p className="text-[11px] text-zinc-600 mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  )
}
