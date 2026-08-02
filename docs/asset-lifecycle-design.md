# ITMS Asset Lifecycle, Offboarding & Audit — Design Reference

## Context

This document specifies the data model, offboarding workflows, and audit logic for strict
historical tracking of asset lifecycles in ITMS.

A review of the live codebase shows ITMS **already satisfies** the requirements for permanent
history of departed employees (#1), intact history on reassignment (#2), an append-only per-asset
timeline (#4), and consumable/accessory tracking (#5) — via the existing `asset_history` ledger,
the `inv_*` consumables subsystem, `employees.is_active`/`leaving_date` offboarding, `activity_log`,
and the `recycle_bin` soft-delete. **The only genuine gap is asset buyouts (#3).**

This is therefore a reference design, not a rewrite. It (a) maps each requirement onto the tables
that already implement it, (b) specifies the one net-new artifact — an `asset_purchases` ledger —
and (c) documents the offboarding workflows and audit queries against the **real** schema, with
integrity guardrails. The `asset_purchases` table and its small companion changes are specified as
a **future implementation** and are clearly labeled as such; nothing here changes existing behavior.

---

## 1. Requirement → Existing Implementation Map

| Req | Requirement | Already satisfied by | Files |
|-----|-------------|----------------------|-------|
| #1 | Permanent history for departed employees | Soft-delete offboarding (`is_active=false`, `leaving_date`), read-only clearance view | `employees.js:519-545` (deactivate), `:492-516` (reactivate), `:605-668` (`/clearance`) |
| #2 | Reassignment keeps ex-employee history intact | `asset_history` is **append-only** — reassignment INSERTs a new row, never mutates prior ones | `utils/assetHistory.js:3-22`, `asset-history.js:51-70` |
| #4 | Append-only timeline per asset/employee | `asset_history` ledger (from/to employee, from/to status, event_type, reason, performed_by) | `server.js:484-508` (DDL), `AssetHistoryTimeline.jsx` |
| #5 | Consumable/accessory tracking + anti-abuse | `inv_items`/`inv_stock`/`inv_assignments`/`inv_assignment_items`/`inv_returns`/`inv_adjustments` | `assignments.js:90-239`, `inventory.js:326-410` |
| #3 | **Asset buyouts** | **NOT IMPLEMENTED** — see §3 | — |

**Conclusion:** do not introduce greenfield `Employees`/`Assets`/`Asset_Assignments` tables — they
would duplicate/conflict with the live schema. Hardware assignment is field-based
(`assigned_user_id` + `assigned_type` on each asset table) with `asset_history` as the ledger;
consumables use the `inv_*` junction tables. Build only what's missing (#3) and harden the rest.

---

## 2. Relevant Existing DDL (reference — do not recreate)

**`asset_history`** — the immutable hardware ledger (`server.js:484-508`). Soft FK on `asset_id`
(plain INTEGER, no constraint) so assets can be recycled without breaking history; `employees` FKs
are `ON DELETE SET NULL`. Indexes: `(asset_type, asset_id)`, `(employee)`, `(created_at)`.

**`employees`** (`schema.sql:33-48` + `server.js:476,479`) — `is_active BOOLEAN DEFAULT true`,
`leaving_date DATE`. Departure = soft-delete; never hard-deleted in the single-record path.

**Consumables junction** — `inv_assignments(asn_number, assignee_id→employees, status)` →
`inv_assignment_items(item_id→inv_items, qty, status, return_condition)`; returns via
`inv_returns`/`inv_return_items`; stock ledger `inv_adjustments` (append-only).

**Asset cost fields** already present: `purchase_price_pkr`, `useful_life_years`, `purchase_date`,
`invoice_number` on `systems`/`mobiles`/`network_devices` — reused for book-value at buyout.

---

## 3. Net-New: `asset_purchases` (buyout ledger) — the only real gap

Append-only, immutable, one-sale-per-asset. Mirrors `asset_history` conventions (soft `asset_id`
FK, employee `ON DELETE SET NULL`) and adds a **name snapshot** so the record stays 100% intact
even if the buyer's employee row is later edited or removed (directly serves req #2).

```sql
-- ANSI-SQL / PostgreSQL. To be added to runMigrations() in server.js (IF NOT EXISTS), NOT schema.sql.
CREATE TABLE IF NOT EXISTS asset_purchases (
  id                  SERIAL PRIMARY KEY,
  asset_type          VARCHAR(20)  NOT NULL,      -- 'systems' | 'mobiles' | 'sims' | 'network_devices'
  asset_id            INTEGER      NOT NULL,       -- soft FK (assets may be recycled; matches asset_history)
  asset_label         VARCHAR(150),                -- serial/tag snapshot at sale time (immutable)
  buyer_employee_id   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  buyer_name_snapshot VARCHAR(100) NOT NULL,       -- immutable buyer name captured at sale
  sale_price_pkr      NUMERIC(12,2) NOT NULL CHECK (sale_price_pkr >= 0),
  book_value_pkr      NUMERIC(12,2),               -- optional net book value at sale (from purchase_price/useful_life)
  sale_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_number      VARCHAR(100),                -- buyout receipt / GL reference
  payment_reference   VARCHAR(100),
  notes               TEXT,
  performed_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- deliberately NO updated_at: append-only, never mutated
);
CREATE INDEX IF NOT EXISTS idx_asset_purchases_asset ON asset_purchases (asset_type, asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_purchases_buyer ON asset_purchases (buyer_employee_id);
-- an asset can only be sold once:
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_purchase_once ON asset_purchases (asset_type, asset_id);
```

**Companion changes (small, optional-but-recommended, flagged for the future implementation):**
- Add terminal status `'sold'` to the `systems`/`mobiles`/`network_devices` status CHECK (extend
  the constraint in `runMigrations()`, same pattern as `server.js:319/331/405`) so sold assets are
  filterable and excluded from "available stock". Fallback if you'd rather not touch the CHECK:
  reuse existing `'retired'`.
- Add a `'purchased'` (or `'sold'`) entry to the event-meta map in `AssetHistoryTimeline.jsx:9-17`
  (green `$` icon). Unknown types already fall back to the `status_change` catchall, so this is
  cosmetic.

---

## 4. Offboarding Workflows (manual clearance retained)

Departure itself is unchanged: `DELETE /api/employees/:id` sets `is_active=false` +
`leaving_date` and logs to `activity_log`. Assets are **not** auto-unassigned; IT works the
read-only `/clearance` checklist (`employees.js:605-668`) and resolves each asset one of three ways.

**Scenario A — leaves & returns the asset.** IT `PUT`s the asset with `assigned_type='inventory'`,
`assigned_user_id=NULL`. Existing code appends an `asset_history` `unassigned` event
(`from_employee_id` = departing employee, `to_status='available'`). No new work; history preserved.

**Scenario B — leaves & buys the asset (buyout).** New flow, all steps in **one transaction**
(follow the `client` transaction pattern in `assignments.js:90-143`):
1. `INSERT INTO asset_purchases (...)` — buyer, price, sale_date, invoice, `buyer_name_snapshot`,
   `asset_label` snapshot, `performed_by`.
2. Append `asset_history` via `logAssetEvent({ eventType:'purchased', fromEmployeeId: buyer,
   toStatus:'sold', reason:'buyout', ... })`.
3. Update the asset row: `status='sold'` (or `'retired'`), `assigned_user_id=NULL`.
4. `INSERT INTO activity_log (action='BUYOUT', ...)`.
Ownership record is permanent and independent of the employee row.

**Scenario C — reassign to a new joiner.** After the asset is back in inventory (via A), IT `PUT`s
it with the new `assigned_user_id`. Existing code appends a **new** `asset_history` `assigned`
(or `transferred`) row (`to_employee_id` = new joiner). The ex-employee's earlier `assigned` and
`unassigned` rows are untouched — **integrity is structural**, because the ledger is append-only and
never updated in place. This is the mechanism that guarantees req #2.

---

## 5. Audit Query Examples (against the real schema)

**(a) Complete lifetime hardware history of an (offboarded) employee** — everything they ever
received or relinquished:
```sql
SELECT ah.created_at, ah.asset_type, ah.asset_label, ah.event_type,
       fe.full_name AS from_employee, te.full_name AS to_employee,
       ah.from_status, ah.to_status, ah.reason, u.name AS performed_by
FROM asset_history ah
LEFT JOIN employees fe ON fe.id = ah.from_employee_id
LEFT JOIN employees te ON te.id = ah.to_employee_id
LEFT JOIN users     u  ON u.id  = ah.performed_by
WHERE ah.from_employee_id = $1 OR ah.to_employee_id = $1
ORDER BY ah.created_at ASC;
```
(Pair with an `inv_assignment_items` query for consumables and an `asset_purchases` query for any
buyout to get the full 360° picture.)

**(b) Headsets/mice issued to an employee in the past 12 months (abuse check, req #5):**
```sql
SELECT i.name, COUNT(*) AS times_issued, SUM(iai.qty) AS total_qty
FROM inv_assignment_items iai
JOIN inv_assignments ia ON ia.id = iai.assignment_id
JOIN inv_items       i  ON i.id  = iai.item_id
LEFT JOIN inv_categories c ON c.id = i.category_id
WHERE ia.assignee_id = $1
  AND ia.assigned_date >= (CURRENT_DATE - INTERVAL '12 months')
  AND (i.name ILIKE '%headset%' OR i.name ILIKE '%mouse%' OR c.name ILIKE '%accessor%')
GROUP BY i.name
ORDER BY total_qty DESC;
```

**(c) Buyout audit trail for a departed employee (uses the new table):**
```sql
SELECT ap.sale_date, ap.asset_type, ap.asset_label, ap.buyer_name_snapshot,
       ap.sale_price_pkr, ap.book_value_pkr, ap.invoice_number, u.name AS sold_by
FROM asset_purchases ap
LEFT JOIN users u ON u.id = ap.performed_by
WHERE ap.buyer_employee_id = $1
ORDER BY ap.sale_date ASC;
```

---

## 6. Best-Practice Guardrails (against accidental data loss)

- **Immutable ledgers.** `asset_history`, `asset_purchases`, `inv_adjustments`, `activity_log` are
  append-only *by convention today* (app-layer only). Harden with a DB `BEFORE UPDATE OR DELETE`
  trigger that `RAISE EXCEPTION`, or `REVOKE UPDATE, DELETE` from the app role — true immutability
  regardless of app bugs.
- **Never hard-delete employees with history.** Single-record delete already soft-deletes, but the
  bulk `DELETE /all` path (`employees.js:468-475`) hard-deletes; because `asset_history`/
  `asset_purchases` use `ON DELETE SET NULL`, a hard delete silently NULLs the `*_employee_id`
  links. Two-layer mitigation: (1) the `buyer_name_snapshot`/`asset_label` snapshots already keep
  the record human-readable; (2) recommend switching those employee FKs to `ON DELETE RESTRICT`
  (or a pre-delete guard) so an admin "clearing old accounts" is *blocked* when history exists.
- **Transactions for multi-step ops.** The buyout (insert purchase + history + asset update + log)
  must be atomic — reuse the `pool.connect()`/`BEGIN`/`COMMIT` pattern already in `assignments.js`.
- **Trigger vs app-layer split.** Keep `updated_at` on triggers (existing `trg_*_updated`); keep
  history/audit writes in the app layer (`logAssetEvent`) for richer context; add the immutability
  trigger purely as a guardrail. Don't move audit logic into triggers — it needs `performed_by`.
- **Recycle bin ≠ ledger.** `recycle_bin` (30-day TTL) is for restorable *asset* rows; the weekly
  purge must never touch `asset_history`/`asset_purchases`/`activity_log`. Confirmed it doesn't
  (`server.js:571-575` only purges `recycle_bin`) — call this out so it stays that way.

---

## 7. Validation

- Run queries §5(a) and §5(b) against the live DB (e.g. `docker compose exec db psql "$DATABASE_URL"`)
  with a known `employee.id` — confirm they return sane rows against the current schema.
- If/when `asset_purchases` is implemented: apply the `runMigrations()` DDL, restart the backend
  container (`docker compose up -d --build backend`), run a test buyout end-to-end, then re-run
  §5(c) and confirm the row is present and the `uq_asset_purchase_once` index blocks a double sale.

## Out of Scope (explicitly deferred)

Auto-return on offboarding; full buyout approval workflow / receipt PDF / depreciation UI; migrating
hardware to a true junction table. These were considered and set aside per confirmed scope.
