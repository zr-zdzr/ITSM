import React, { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const Ctx = createContext(null);

const META = {
  success: { Icon: CheckCircle2, bg: "bg-success", text: "text-white" },
  error: { Icon: XCircle, bg: "bg-danger", text: "text-white" },
  info: { Icon: Info, bg: "bg-primary", text: "text-white" },
  warning: { Icon: AlertTriangle, bg: "bg-warning", text: "text-dark" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = "info") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3800);
  }, []);

  const remove = (id) => setToasts((p) => p.filter((t) => t.id !== id));

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="itms-toast-container" style={{ pointerEvents: "none" }}>
        <AnimatePresence>
          {toasts.map(({ id, message, type }) => {
            const { Icon, bg, text } = META[type] || META.info;
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                className={`d-flex align-items-center gap-2 px-3 py-2 rounded-3 shadow-lg ${bg} ${text}`}
                style={{
                  pointerEvents: "auto",
                  minWidth: 280,
                  maxWidth: 340,
                  fontSize: "0.875rem",
                }}
              >
                <Icon size={15} className="flex-shrink-0" />
                <span className="flex-grow-1 fw-medium">{message}</span>
                <button
                  onClick={() => remove(id)}
                  className={`btn btn-link p-0 ms-1 ${text} opacity-75`}
                  style={{ lineHeight: 1 }}
                >
                  <X size={13} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
