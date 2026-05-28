import React from "react";

const MAP = {
  active: "badge-active",
  available: "badge-available",
  assigned: "badge-assigned",
  inactive: "badge-inactive",
  retired: "badge-retired",
  repair: "badge-repair",
  damaged: "badge-damaged",
  lost: "badge-lost",
  suspended: "badge-suspended",
  working: "badge-working",
  permanent: "badge-permanent",
  contractual: "badge-contractual",
};

export default function Badge({ children, status, className }) {
  const key = (status || String(children || ""))
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const cls = MAP[key] || "bg-secondary bg-opacity-25 text-secondary";
  return (
    <span
      className={`badge rounded-pill px-2 py-1 ${cls}${className ? " " + className : ""}`}
    >
      {children}
    </span>
  );
}
