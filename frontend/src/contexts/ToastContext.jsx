import React, { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

const Ctx = createContext(null)

const META = {
  success: { Icon: CheckCircle2, cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' },
  error:   { Icon: XCircle,      cls: 'border-red-500/40 bg-red-500/10 text-red-400' },
  info:    { Icon: Info,         cls: 'border-brand-500/40 bg-brand-500/10 text-brand-400' },
  warning: { Icon: AlertTriangle,cls: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts(p => [...p, { id, message, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3800)
  }, [])

  const remove = (id) => setToasts(p => p.filter(t => t.id !== id))

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 w-[340px] pointer-events-none">
        <AnimatePresence>
          {toasts.map(({ id, message, type }) => {
            const { Icon, cls } = META[type] || META.info
            return (
              <motion.div key={id}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border backdrop-blur-md text-sm shadow-xl ${cls}`}
              >
                <Icon size={15} className="mt-0.5 flex-shrink-0" />
                <span className="flex-1 text-zinc-200 font-medium">{message}</span>
                <button onClick={() => remove(id)} className="text-zinc-500 hover:text-zinc-300 transition-colors mt-0.5">
                  <X size={13} />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
