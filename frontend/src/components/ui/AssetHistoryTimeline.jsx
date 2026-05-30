import React, { useEffect, useState } from "react";
import {
  UserCheck, UserX, ArrowLeftRight, RefreshCw,
  Wrench, Trash2, Activity, History,
} from "lucide-react";
import { api } from "../../lib/api";
import { fmtDate } from "../../lib/utils";

const EVENT_META = {
  assigned:      { label: "Assigned",     icon: UserCheck,        color: "#4ade80" },
  unassigned:    { label: "Unassigned",   icon: UserX,            color: "#f87171" },
  transferred:   { label: "Transferred",  icon: ArrowLeftRight,   color: "#60a5fa" },
  replaced:      { label: "Replaced",     icon: RefreshCw,        color: "#fb923c" },
  repaired:      { label: "Repaired",     icon: Wrench,           color: "#a78bfa" },
  disposed:      { label: "Disposed",     icon: Trash2,           color: "#71717a" },
  status_change: { label: "Status Change",icon: Activity,         color: "#facc15" },
};

function EventBadge({ eventType }) {
  const meta = EVENT_META[eventType] || EVENT_META.status_change;
  const Icon = meta.icon;
  return (
    <span
      className="d-inline-flex align-items-center gap-1 px-2 py-1 rounded-2 fw-semibold"
      style={{ fontSize: "11px", background: meta.color + "22", color: meta.color }}
    >
      <Icon size={11} />
      {meta.label}
    </span>
  );
}

export default function AssetHistoryTimeline({ assetType, assetId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!assetId) return;
    setLoading(true);
    api
      .get(`/api/asset-history/${assetType}/${assetId}`)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [assetType, assetId]);

  return (
    <div className="mt-4 pt-3 border-top">
      <div className="d-flex align-items-center gap-2 mb-3">
        <History size={13} style={{ color: "#60a5fa" }} />
        <span
          className="fw-semibold text-secondary text-uppercase"
          style={{ fontSize: "0.7rem", letterSpacing: "0.1em" }}
        >
          Asset History
        </span>
      </div>

      {loading ? (
        <div className="d-flex gap-2 flex-column">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton-box rounded" style={{ height: 36 }} />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-secondary small mb-0">No history recorded yet.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="d-flex align-items-start gap-3 p-2 rounded-2"
              style={{ background: "var(--bs-secondary-bg)" }}
            >
              <div className="flex-shrink-0 mt-1">
                <EventBadge eventType={ev.event_type} />
              </div>
              <div className="flex-grow-1 small">
                <div>
                  {ev.from_employee_name && (
                    <span className="text-secondary">{ev.from_employee_name} → </span>
                  )}
                  {ev.to_employee_name ? (
                    <span className="fw-semibold">{ev.to_employee_name}</span>
                  ) : ev.to_status ? (
                    <span className="text-secondary">{ev.to_status}</span>
                  ) : null}
                </div>
                {ev.reason && (
                  <div className="text-secondary" style={{ fontSize: "11px" }}>
                    Reason: {ev.reason}
                  </div>
                )}
                {ev.performed_by_name && (
                  <div className="text-secondary" style={{ fontSize: "11px" }}>
                    By {ev.performed_by_name}
                  </div>
                )}
              </div>
              <div className="flex-shrink-0 text-secondary" style={{ fontSize: "11px", whiteSpace: "nowrap" }}>
                {fmtDate(ev.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
