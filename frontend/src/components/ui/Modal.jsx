import React, { useEffect } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const SIZES = {
  sm: "480px",
  md: "560px",
  lg: "720px",
  xl: "900px",
  "2xl": "1100px",
};

export default function Modal({ open, onClose, title, children, size = "md" }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{
            zIndex: 1055,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
            className="itms-card w-100 overflow-hidden"
            style={{ maxWidth: SIZES[size] }}
          >
            <div className="d-flex align-items-center justify-content-between px-4 py-3 border-bottom border-secondary-subtle">
              <h6 className="mb-0 fw-semibold">{title}</h6>
              <button
                onClick={onClose}
                className="btn btn-sm btn-link text-secondary p-1"
              >
                <X size={15} />
              </button>
            </div>
            <div
              className="px-4 py-3 overflow-auto"
              style={{ maxHeight: "80vh" }}
            >
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
