import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...i) => twMerge(clsx(i))

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const debounce = (fn, ms = 300) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }
}
