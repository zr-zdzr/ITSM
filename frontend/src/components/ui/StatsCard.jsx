import React from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

const ICON_BG = {
  brand: "#00AA2F",
  emerald: "#22c55e",
  amber: "#f59e0b",
  rose: "#f43f5e",
  purple: "#a855f7",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
};

const ACCENT_COLOR = {
  brand: "#00AA2F",
  emerald: "#22c55e",
  amber: "#f59e0b",
  rose: "#f43f5e",
  purple: "#a855f7",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
};

export default function StatsCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "brand",
  loading,
  onClick,
  active,
}) {
  const iconBg = ICON_BG[color] || ICON_BG.brand;
  const accent = ACCENT_COLOR[color] || ACCENT_COLOR.brand;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={cn("itms-card p-3 stats-card", active && "active-card")}
    >
      {/* Colored top accent bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: accent,
          borderRadius: "0.75rem 0.75rem 0 0",
        }}
      />

      <div className="d-flex align-items-start gap-3 mt-1">
        <div
          className="flex-shrink-0 rounded-3 d-flex align-items-center justify-content-center"
          style={{
            width: 40,
            height: 40,
            background: iconBg,
            boxShadow: `0 4px 12px ${iconBg}44`,
          }}
        >
          <Icon size={18} color="#fff" />
        </div>

        <div className="min-w-0 flex-grow-1">
          <p
            className="small text-secondary fw-medium mb-0"
            style={{ fontSize: "0.75rem" }}
          >
            {label}
          </p>
          {loading ? (
            <div
              style={{ height: 28, width: 56 }}
              className="bg-secondary bg-opacity-25 rounded mt-1 placeholder-glow"
            >
              <span className="placeholder w-100 h-100 d-block rounded" />
            </div>
          ) : (
            <p className="fw-bold mb-0 lh-1" style={{ fontSize: "1.5rem" }}>
              {value ?? "—"}
            </p>
          )}
          {sub && (
            <p
              className="mb-0 text-secondary"
              style={{ fontSize: "0.68rem", marginTop: 2 }}
            >
              {sub}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
