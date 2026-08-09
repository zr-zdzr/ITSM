import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Boxes, ArrowLeft } from "lucide-react";
import { api } from "../lib/api";

const STATUS_COLOR = {
  in_stock: "#4ade80",
  reserved: "#7dd3fc",
  installed: "#4ade80",
  faulty: "#fbbf24",
  rma: "#c4b5fd",
  scrapped: "#a1a1aa",
};

/** Scan target for unit QR labels — resolves a label to its record. */
export default function UnitLookup() {
  const { id } = useParams();
  const [unit, setUnit] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get(`/api/inventory/units/${id}`)
      .then(setUnit)
      .catch((e) => setError(e.message));
  }, [id]);

  const Row = ({ label, value }) => (
    <div className="d-flex justify-content-between py-2 border-bottom border-secondary border-opacity-25">
      <span className="small text-secondary">{label}</span>
      <span className="small fw-medium text-end">{value ?? "—"}</span>
    </div>
  );

  return (
    <div className="mx-auto" style={{ maxWidth: 480 }}>
      <div className="itms-card p-4">
        <div className="d-flex align-items-center gap-2 mb-3">
          <Boxes size={16} style={{ color: "var(--brand)" }} />
          <h6 className="fw-bold mb-0">Stock Unit</h6>
        </div>
        {error ? (
          <p className="small text-danger mb-0">{error}</p>
        ) : !unit ? (
          <p className="small text-secondary mb-0">Loading…</p>
        ) : (
          <>
            <Row label="Item" value={unit.item_name} />
            <Row
              label="Serial No."
              value={<span className="font-monospace">{unit.serial_no}</span>}
            />
            <Row
              label="Status"
              value={
                <span
                  style={{ color: STATUS_COLOR[unit.status] || "#a1a1aa" }}
                >
                  {unit.status.replace("_", " ")}
                  {unit.status === "installed" &&
                    ` — ${unit.installed_asset_type} #${unit.installed_asset_id}`}
                </span>
              }
            />
            <Row
              label="Bin"
              value={
                unit.bin_code
                  ? `${unit.bin_code}${unit.bin_location ? ` (${unit.bin_location})` : ""}`
                  : null
              }
            />
            <Row
              label="Make / Model"
              value={
                [unit.manufacturer, unit.model].filter(Boolean).join(" ") ||
                null
              }
            />
            <Row
              label="Cost"
              value={
                unit.cost_pkr
                  ? `PKR ${Number(unit.cost_pkr).toLocaleString()}`
                  : null
              }
            />
            {unit.notes && <Row label="Notes" value={unit.notes} />}
          </>
        )}
        <Link
          to="/inventory"
          className="btn btn-outline-secondary btn-sm mt-3 d-inline-flex align-items-center gap-1"
        >
          <ArrowLeft size={13} /> Inventory
        </Link>
      </div>
    </div>
  );
}
