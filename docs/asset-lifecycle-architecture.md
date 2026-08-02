# Asset & Employee Lifecycle Management — Reference Architecture

> **Status:** Reference blueprint. This document specifies an *ideal* production-grade design using
> the **event-ledger / junction-table** pattern. It is **not** the schema ITMS runs today — ITMS
> assigns hardware via `assigned_user_id`/`assigned_type` columns on each asset table plus an
> append-only `asset_history` event log. For how the current system meets these requirements, see
> [`asset-lifecycle-design.md`](./asset-lifecycle-design.md). Migrating ITMS onto this model is out
> of scope (see the appendix).

PostgreSQL 14+ is assumed (partial indexes, `GENERATED ALWAYS AS IDENTITY`, enums).

---

## 1. Overview & Entity Model

Four core tables plus an immutable audit log:

```
employees ──1:N── cloud_identities
    │
    │ 1:N (assigned_by / returned_by / employee_id)
    ▼
asset_assignments ──N:1── assets
    │
    ▼
asset_events   (append-only audit; references assets, assignments, employees)
```

- **`assets`** — one row per physical asset (serialized device) *or* per stock pool (bulk
  accessory). The asset's own lifecycle status lives here.
- **`asset_assignments`** — the **event ledger**: one row per *assignment episode*. An open episode
  (`returned_at IS NULL`) means the employee currently holds the asset. A return **closes** the
  episode; rows are never deleted or re-pointed, so every past holding is preserved verbatim.
- **`asset_events`** — optional append-only audit trail (DB-enforced immutable) for tamper-proof
  lineage beyond assignment episodes (status changes, loss/damage reports, sale/disposal).

**Soft-delete philosophy.** `employees` and `cloud_identities` are **never hard-deleted** —
offboarding sets `status = 'DEACTIVATED'`. All FKs into them use `ON DELETE RESTRICT`, so the
database physically refuses to orphan history. There are no hard-delete endpoints.

---

## 2. Schema (DDL)

```sql
-- ─── Enumerated domains ──────────────────────────────────────────────────────
CREATE TYPE employee_status       AS ENUM ('ACTIVE','DEACTIVATED');
CREATE TYPE cloud_identity_status AS ENUM ('ACTIVE','SUSPENDED','DEACTIVATED');
CREATE TYPE asset_kind            AS ENUM ('LAPTOP','DESKTOP','MOBILE','SIM','ACCESSORY');
CREATE TYPE asset_status          AS ENUM
  ('IN_STOCK','ASSIGNED','IN_REPAIR','LOST','DAMAGED','SOLD','DISPOSED');
CREATE TYPE assignment_reason     AS ENUM
  ('NEW_ASSIGNMENT','TRANSFER','RETURN','LOST','DAMAGED','SOLD','DISPOSED','OFFBOARDING');

-- ─── Employees (soft-delete only) ────────────────────────────────────────────
CREATE TABLE employees (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name      TEXT            NOT NULL,
  email          TEXT            UNIQUE,
  department     TEXT,
  designation    TEXT,
  status         employee_status NOT NULL DEFAULT 'ACTIVE',
  joined_at      DATE,
  deactivated_at TIMESTAMPTZ,
  deactivated_by BIGINT          REFERENCES employees(id),
  created_at     TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ     NOT NULL DEFAULT now(),
  -- deactivated_at is set IFF the row is DEACTIVATED
  CONSTRAINT chk_employee_deactivation
    CHECK ((status = 'DEACTIVATED') = (deactivated_at IS NOT NULL))
);

-- ─── Cloud identities (soft-delete only) ─────────────────────────────────────
CREATE TABLE cloud_identities (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  provider    TEXT   NOT NULL,                      -- 'GOOGLE_WORKSPACE', 'AZURE_AD', …
  email       TEXT   NOT NULL,
  external_id TEXT,                                 -- immutable provider-side id
  status      cloud_identity_status NOT NULL DEFAULT 'ACTIVE',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, email)
);
CREATE INDEX idx_cloud_identity_employee ON cloud_identities (employee_id);

-- ─── Assets (serialized device OR bulk stock pool) ───────────────────────────
CREATE TABLE assets (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_tag      TEXT UNIQUE,
  kind           asset_kind   NOT NULL,
  is_serialized  BOOLEAN      NOT NULL DEFAULT true,
  serial_number  TEXT,                              -- required if serialized, NULL for bulk
  make           TEXT,
  model          TEXT,
  status         asset_status NOT NULL DEFAULT 'IN_STOCK',
  stock_qty      INTEGER      NOT NULL DEFAULT 1 CHECK (stock_qty >= 0),  -- pool size for bulk
  purchase_cost  NUMERIC(12,2),
  purchased_at   DATE,
  warranty_until DATE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT chk_serialized_has_serial
    CHECK (NOT is_serialized OR serial_number IS NOT NULL),
  CONSTRAINT chk_serialized_qty_one
    CHECK (NOT is_serialized OR stock_qty = 1)
);
-- serials unique only when present (bulk pools have none)
CREATE UNIQUE INDEX uq_asset_serial ON assets (serial_number) WHERE serial_number IS NOT NULL;

-- ─── Asset assignments (the event ledger) ────────────────────────────────────
CREATE TABLE asset_assignments (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id         BIGINT  NOT NULL REFERENCES assets(id)    ON DELETE RESTRICT,
  employee_id      BIGINT  NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  quantity         INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  is_serialized    BOOLEAN NOT NULL,                -- denormalized from assets (see trigger)
  assigned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by      BIGINT REFERENCES employees(id),
  returned_at      TIMESTAMPTZ,                     -- NULL ⇒ open episode (currently held)
  returned_by      BIGINT REFERENCES employees(id),
  return_condition TEXT,                            -- 'GOOD' | 'DAMAGED' | 'LOST'
  reason           assignment_reason NOT NULL DEFAULT 'NEW_ASSIGNMENT',
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_return_after_assign
    CHECK (returned_at IS NULL OR returned_at >= assigned_at),
  CONSTRAINT chk_serialized_qty_one
    CHECK (NOT is_serialized OR quantity = 1)
);

-- Integrity: keep is_serialized in lockstep with the parent asset.
CREATE FUNCTION set_assignment_serialized() RETURNS trigger AS $$
BEGIN
  SELECT is_serialized INTO NEW.is_serialized FROM assets WHERE id = NEW.asset_id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_assignment_serialized
  BEFORE INSERT ON asset_assignments
  FOR EACH ROW EXECUTE FUNCTION set_assignment_serialized();

-- ★ Concurrency guard: a serialized asset can have AT MOST ONE open episode.
CREATE UNIQUE INDEX uq_asset_active_holder
  ON asset_assignments (asset_id)
  WHERE returned_at IS NULL AND is_serialized;

-- Hot-path partial/covering indexes
CREATE INDEX idx_active_by_employee  ON asset_assignments (employee_id)
  WHERE returned_at IS NULL;                        -- Current view (small, hot)
CREATE INDEX idx_history_by_employee ON asset_assignments (employee_id, assigned_at DESC);
CREATE INDEX idx_lineage_by_asset    ON asset_assignments (asset_id, assigned_at);

-- ─── Append-only audit log (DB-enforced immutable) ───────────────────────────
CREATE TABLE asset_events (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id      BIGINT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  assignment_id BIGINT REFERENCES asset_assignments(id),
  employee_id   BIGINT REFERENCES employees(id),
  event_type    TEXT   NOT NULL,                    -- ASSIGNED | RETURNED | TRANSFERRED |
                                                    -- REPORTED_LOST | REPORTED_DAMAGED |
                                                    -- REPAIRED | SOLD | DISPOSED | STATUS_CHANGE
  from_status   asset_status,
  to_status     asset_status,
  performed_by  BIGINT REFERENCES employees(id),
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_asset ON asset_events (asset_id, created_at);

CREATE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'asset_events is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_events_immutable
  BEFORE UPDATE OR DELETE ON asset_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
```

**Why this shape.** The single junction table with a nullable `returned_at` is the canonical
event-ledger pattern: "current" is the open subset, "history" is the whole set, and the *same*
lifetime record is never rewritten on transfer — only closed and superseded by a new row.

---

## 3. Core SQL

### 3.1 Current view — assets an employee holds right now
```sql
SELECT a.id            AS asset_id,
       a.asset_tag,
       a.kind,
       a.serial_number,
       aa.quantity,
       aa.assigned_at,
       ab.full_name    AS assigned_by
FROM   asset_assignments aa
JOIN   assets    a  ON a.id  = aa.asset_id
LEFT   JOIN employees ab ON ab.id = aa.assigned_by
WHERE  aa.employee_id = $1
  AND  aa.returned_at IS NULL          -- ← served by idx_active_by_employee
ORDER  BY aa.assigned_at DESC;
```

### 3.2 History view — chronological lifetime of assignments
```sql
SELECT a.asset_tag,
       a.kind,
       a.serial_number,
       aa.assigned_at,
       aa.returned_at,                 -- NULL = still held
       aa.reason,
       aa.return_condition,
       ab.full_name AS assigned_by,
       rb.full_name AS returned_by
FROM   asset_assignments aa
JOIN   assets    a  ON a.id  = aa.asset_id
LEFT   JOIN employees ab ON ab.id = aa.assigned_by
LEFT   JOIN employees rb ON rb.id = aa.returned_by
WHERE  aa.employee_id = $1             -- ← served by idx_history_by_employee
ORDER  BY aa.assigned_at DESC, aa.id DESC;
```

### 3.3 Available quantity of a bulk accessory pool
```sql
SELECT a.stock_qty
       - COALESCE((SELECT SUM(quantity) FROM asset_assignments
                   WHERE asset_id = a.id AND returned_at IS NULL), 0) AS available
FROM   assets a
WHERE  a.id = $1 AND a.is_serialized = false;
```

### 3.4 Asset transfer (A → B) — one atomic transaction
```sql
BEGIN;

-- (1) Serialize concurrent transfers of THIS asset; also our consistency anchor.
SELECT id, status FROM assets WHERE id = $asset_id FOR UPDATE;

-- (2) Close A's open episode. If 0 rows → A didn't hold it → ROLLBACK (app raises 409/422).
UPDATE asset_assignments
   SET returned_at      = now(),
       returned_by      = $performed_by,
       return_condition = 'GOOD',
       reason           = 'TRANSFER'
 WHERE asset_id    = $asset_id
   AND employee_id = $from_employee_id
   AND returned_at IS NULL;

-- (3) Open a fresh episode for B. The partial unique index blocks a racing double-open.
INSERT INTO asset_assignments (asset_id, employee_id, assigned_by, reason)
VALUES ($asset_id, $to_employee_id, $performed_by, 'TRANSFER');

-- (4) Asset remains ASSIGNED (status unchanged, bump updated_at).
UPDATE assets SET status = 'ASSIGNED', updated_at = now() WHERE id = $asset_id;

-- (5) Audit both sides.
INSERT INTO asset_events (asset_id, employee_id, event_type, performed_by, detail)
VALUES ($asset_id, $from_employee_id, 'TRANSFERRED', $performed_by,
        jsonb_build_object('to_employee_id', $to_employee_id));

COMMIT;
```
A's row from step (2) stays forever with its `assigned_at`/`returned_at` — the History view is
untouched by the transfer.

---

## 4. Edge Cases & Data-Integrity Strategy

### Concurrent assignment of the same serialized asset
Two requests race to assign asset X. Both open a transaction; the `FOR UPDATE` on `assets` serializes
them, but the real backstop is `uq_asset_active_holder`: the second `INSERT` of an open episode for
the same `asset_id` violates the partial unique index → Postgres error `23505` → API returns **409
Conflict**. Correctness does not depend on app-level locking or read-then-write timing.

### Loss / damage reported mid-assignment
The episode need not close on a mere status change:
- **Repairable** — `INSERT asset_events(event_type='REPORTED_DAMAGED')`, `UPDATE assets.status =
  'IN_REPAIR'`; the assignment stays **open** (employee is still the responsible holder).
- **Write-off / lost** — close the episode (`returned_at = now()`, `return_condition='LOST'`,
  `reason='LOST'`), set `assets.status = 'LOST'`, and log an event. The asset leaves circulation but
  the historical holding remains.

### Bulk accessories vs. uniquely serialized devices
| | Serialized device | Bulk accessory pool |
|---|---|---|
| `assets.is_serialized` | `true` | `false` |
| `serial_number` | required, unique | `NULL` |
| `stock_qty` | `1` | pool size (e.g. 200) |
| Active-holder unique index | **enforced** (one holder) | not applicable (many holders) |
| Assignment `quantity` | always 1 | 1..N |
| Oversell guard | unique index | `SELECT … FOR UPDATE` on the asset row + recompute available (§3.3) inside the txn |

### Immutability guarantees
- Assignment rows are never `DELETE`d; a return only *sets* `returned_at`. Past holdings are stable.
- `asset_events` is **hard-immutable** — the `trg_events_immutable` trigger rejects any `UPDATE`/
  `DELETE`. Use it as the source of truth for audits.
- `ON DELETE RESTRICT` on every FK into `employees`/`assets` means the DB refuses to erase an entity
  that any ledger row references — deactivate, never delete.

### FK / cascade policy (summary)
All history-bearing FKs are `ON DELETE RESTRICT` (never cascade a delete through the ledger).
Soft-delete is expressed by `status` columns, not row removal.

---

## 5. REST API

| Method & path | Purpose | Success | Notable errors |
|---|---|---|---|
| `GET /employees/{id}/assets?view=current` | Open episodes only | 200 | 404 employee |
| `GET /employees/{id}/assets?view=history` | Full chronological ledger | 200 | 404 employee |
| `POST /assets/{id}/assign` | Open an episode for an employee | 201 | 409 already held (serialized) |
| `POST /assets/{id}/return` | Close the open episode | 200 | 409 not currently held |
| `POST /assets/transfer` | Atomic A→B (§3.4) | 200 | 409 race / 422 A not holder |
| `POST /assets/{id}/report` | Loss/damage report | 200 | 422 invalid transition |
| `POST /employees/{id}/deactivate` | Soft-delete (offboard) | 200 | 409 open assignments* |

\* Optionally block deactivation while the employee still holds assets, forcing return/transfer first.
There is intentionally **no** `DELETE` endpoint for employees, cloud identities, or assets.

### 5.1 `POST /assets/transfer`
```json
// Request
{
  "asset_id": 4021,
  "from_employee_id": 88,
  "to_employee_id": 152,
  "performed_by": 3,
  "reason": "Team reassignment"
}
```
```json
// 200 OK
{
  "asset_id": 4021,
  "closed_episode":  { "assignment_id": 90711, "employee_id": 88,  "assigned_at": "2026-02-01T09:12:00Z", "returned_at": "2026-08-03T10:04:11Z" },
  "opened_episode":  { "assignment_id": 90842, "employee_id": 152, "assigned_at": "2026-08-03T10:04:11Z", "returned_at": null }
}
```
```json
// 409 Conflict (concurrent transfer won the race)
{ "error": "ASSET_ALREADY_ASSIGNED", "message": "Asset 4021 is already held by another employee." }
```

### 5.2 `GET /employees/152/assets?view=history`
Shows sequential device usage — note the two laptops held back-to-back and the still-open mobile:
```json
{
  "employee_id": 152,
  "view": "history",
  "assignments": [
    { "assignment_id": 90842, "asset": { "id": 4021, "tag": "LT-0421", "kind": "LAPTOP",  "serial": "SN-DELL-77A" },
      "assigned_at": "2026-08-03T10:04:11Z", "returned_at": null,                    "reason": "TRANSFER" },
    { "assignment_id": 88190, "asset": { "id": 5510, "tag": "MB-0110", "kind": "MOBILE",  "serial": "IMEI-3391" },
      "assigned_at": "2026-06-15T08:00:00Z", "returned_at": null,                    "reason": "NEW_ASSIGNMENT" },
    { "assignment_id": 71002, "asset": { "id": 3300, "tag": "LT-0330", "kind": "LAPTOP",  "serial": "SN-HP-1120" },
      "assigned_at": "2025-01-10T09:00:00Z", "returned_at": "2026-08-03T10:03:59Z",  "reason": "TRANSFER",
      "return_condition": "GOOD" },
    { "assignment_id": 60411, "asset": { "id": 9001, "tag": null,      "kind": "ACCESSORY", "serial": null },
      "quantity": 2, "assigned_at": "2024-11-02T14:20:00Z", "returned_at": "2025-03-01T11:00:00Z", "reason": "RETURN" }
  ]
}
```

---

## Appendix — relationship to the current ITMS implementation

ITMS today does **not** use this junction model. It stores the *current* holder directly on each
asset table (`systems`/`mobiles`/`sims`/`network_devices`.`assigned_user_id` + `assigned_type`) and
records history as event rows in an append-only `asset_history` table (assigned/unassigned/
transferred/…), with employees soft-deleted via `is_active`/`leaving_date`. That approach already
satisfies the Current/History/immutability requirements (see `asset-lifecycle-design.md`).

Adopting this reference model would be a **significant migration**: introduce `assets` +
`asset_assignments`, backfill open episodes from current `assigned_user_id` values and closed
episodes from `asset_history`, then rewrite every asset route and UI to read/write the junction.
That migration is deliberately **out of scope** for this document — this is a target blueprint, not a
change request.
