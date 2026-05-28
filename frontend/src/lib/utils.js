export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

export const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

export const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

// Generate a date-based asset tag, e.g. "5M26ID" (5 May 2026, individual purchase)
// suffix: 'ID' = individual device, 'IN' = inventory/bulk purchase
const MONTH_LETTER = [
  "J",
  "F",
  "M",
  "A",
  "M",
  "J",
  "J",
  "A",
  "S",
  "O",
  "N",
  "D",
];
export function genAssetTag(dateStr, suffix = "ID") {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getDate()}${MONTH_LETTER[d.getMonth()]}${String(d.getFullYear()).slice(-2)}${suffix}`;
}
