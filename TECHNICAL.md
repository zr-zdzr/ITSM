# ITMS — IT Management System

### Technical Documentation

**Organization:** Bykea  
**Maintained by:** IT Department

---

## 1. Purpose

ITMS is an internal web portal for Bykea's IT department to manage and track all IT assets, employees, Google Workspace accounts, consumable inventory, requests, and assignments from a single interface. It replaces manual spreadsheets with a structured, role-controlled, auditable system.

---

## 2. Tech Stack

### Database

| Technology        | Version     | Purpose                                                  |
| ----------------- | ----------- | -------------------------------------------------------- |
| PostgreSQL        | 16 (Alpine) | Primary relational database — all data                   |
| connect-pg-simple | 9.x         | Stores user sessions inside PostgreSQL (`session` table) |

### Backend

| Technology      | Purpose                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| Node.js         | JavaScript runtime                                                          |
| Express.js      | HTTP server and REST API framework                                          |
| Passport.js     | Session plumbing for local email + password auth (no strategies registered) |
| bcryptjs        | Password hashing                                                            |
| pg              | PostgreSQL client with connection pooling                                   |
| express-session | Session management (cookie-based)                                           |
| multer          | File upload handling (CSV imports)                                          |
| csv-parse       | Parsing uploaded CSV files                                                  |
| csv-stringify   | Generating CSV export files                                                 |
| dotenv          | Loading environment variables from `.env`                                   |

### Frontend

| Technology      | Purpose                                         |
| --------------- | ----------------------------------------------- |
| React 18        | UI component framework                          |
| React Router v6 | Client-side page routing (no full-page reloads) |
| Bootstrap 5     | CSS framework — layout, tables, forms, modals   |
| Lucide React    | Icon library                                    |
| Framer Motion   | Page and component animations                   |
| Vite            | Frontend build tool and development server      |

### Infrastructure

| Technology               | Purpose                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| Docker                   | Container runtime                                                         |
| Docker Compose           | Orchestrates 3 containers (db, backend, frontend)                         |
| Nginx                    | Serves the React build; reverse-proxies `/api` and `/auth` to the backend |
| Groq API (llama-3.3-70b) | Powers the built-in ChatBot assistant                                     |

### Languages

| Layer          | Language                                         |
| -------------- | ------------------------------------------------ |
| Backend        | JavaScript (Node.js)                             |
| Frontend       | JavaScript (React / JSX)                         |
| Styling        | CSS (Bootstrap utilities + custom CSS variables) |
| Database       | SQL (PostgreSQL)                                 |
| Infrastructure | YAML (Docker Compose), Dockerfile                |

---

## 3. Architecture Overview

```
Browser
  │
  ▼
Nginx (port 80)
  ├── /           → serves React build (static files)
  ├── /api/*      → proxied to Express backend (port 3000)
  └── /auth/*     → proxied to Express backend (port 3000)
                         │
                         ▼
                   Express (Node.js)
                   ├── Passport.js (auth)
                   ├── REST API routes
                   └── pg Pool
                         │
                         ▼
                   PostgreSQL 16
```

All three services run as Docker containers and communicate over an internal Docker network. Only Nginx (port 80) and PostgreSQL (port 5432) are exposed to the host.

---

## 4. Roles & Permissions

| Role          | Access                                                                        |
| ------------- | ----------------------------------------------------------------------------- |
| `super_admin` | Full access to everything — bypasses all permission checks                    |
| `user`        | Module-level CRUD permissions configured per-user in `user_permissions` table |
| `viewer`      | Read-only access to all modules                                               |

Permissions are enforced on both the backend (`perm()` middleware) and the frontend (`canPerm()` hook in `AuthContext`).

---

## 5. Pages — What Each Page Does

### Login (`/login`)

Entry point for the portal. There is one login method: **local email + password**.

The user is looked up by email (only accounts that have a `password_hash`), the password is
checked with `bcrypt.compare()`, and the login is rejected if `is_active` is false. Every
attempt — success or failure — is written to the activity log as `login`, `login_failed` or
`login_blocked`.

A `super_admin` account is seeded on start-up from `ADMIN_USERNAME` / `ADMIN_PASSWORD` in
`.env`. All other users are created from the User Management page.

---

### Dashboard (`/`)

The home page. Gives a real-time overview of the entire IT inventory at a glance.

- **Summary cards** — total count of Systems, Network Devices, Mobiles, SIM Cards, Cloud IDs, and Employees
- **Clickable stat panels** — clicking any card expands a detail panel with charts: assignment breakdown, status distribution, department/vendor distribution, top models
- **Recent activity feed** — last 20 actions taken across the portal (who did what, when)
- **Warranty alerts** — devices with warranty expiring within 90 days
- **Pending requests counter** — inventory requests waiting for approval

---

### System Devices (`/systems`)

Manages all laptops, desktops, servers, and workstations.

- Add, edit, delete systems with full hardware specs: CPU (up to 2), RAM (up to 4 slots with serial/bus), storage (up to 3 disks), manufacturer, model, serial number, asset tag
- Assign a system to an employee or mark it as inventory/WFH/damaged
- Track status: `in_use`, `available`, `repair`, `retired`, `lost`
- Warranty expiry date with alert integration
- CSV bulk import and export
- QR code generation per device (asset tag + specs, printable as sticker)
- Maintenance log per device (repairs, notes, cost)
- Recycle bin — deleted records recoverable within 30 days

---

### Network Devices (`/network`)

Manages network infrastructure: switches, routers, firewalls, WiFi controllers, access points, UPS units, NAS devices.

- Track device type, brand, model, serial number, IP address, MAC address, VLAN, firmware version, rack location
- Status tracking: `in_use`, `available`, `repair`, `retired`
- Warranty expiry and vendor details
- Asset tag auto-generated from purchase date
- CSV bulk import and export
- QR code generation

---

### Mobile Devices (`/mobiles`)

Manages smartphones and tablets issued by the company.

- Track manufacturer, model, serial number, IMEI (primary and secondary), color, storage, OS and OS version
- Assign to an employee or mark as inventory/WFH/damaged
- Purpose classification: `official`, `service`, `personal`, `qa_testing`
- Maintenance log per device
- Status: `in_use`, `available`, `repair`, `retired`
- CSV import/export, QR codes

---

### SIM Cards (`/sims`)

Manages all company SIM cards across all operators.

- Track phone number, ICCID, vendor (Jazz / Telenor / Ufone / Zong / Other)
- Package details: package name, data limit, monthly rate, activation and expiry dates
- Assign to an employee or service
- Status: `active`, `suspended`
- Monthly cost reporting feeds into the Reports page (SIM billing tab)
- CSV import/export

---

### Cloud IDs (`/gws`)

Manages all Google Workspace accounts linked to the organization.

- Track first name, last name, email, org unit, phone number
- License tier: `Starter`, `Standard`, `Vault`, `Not Assigned`
- Account type: `user` or `service_account`
- Status: `active`, `suspended`, `deleted`
- CSV import/export

---

### Employees (`/employees`)

The company staff directory — source of truth for assignment targets.

- Full employee profile: name, email, designation, department, business unit, mobile number, location, employment type, joining date
- Link an employee to a portal login account (`portal_user_id`)
- View all assets currently assigned to an employee from the employee record
- Status: `active` / `inactive`
- CSV import/export

---

### Inventory Stock (`/inventory`)

Tracks consumable and returnable stock items (cables, peripherals, stationery, etc.).

- **Categories** — organise items into a hierarchy (e.g. Cables > Networking)
- **Items** — each item has a name, SKU, unit, reorder level, and stock quantities: available, assigned, reserved, damaged
- **Stock adjustment** — manually add stock (purchase/receive), mark damaged, mark lost, retire
- **Stock history** — full adjustment log per item
- **Alerts** — automatic low-stock and out-of-stock alerts visible in the header notification bell
- Item types: `Consumable` (single-use) or `Returnable` (must be returned)

---

### Requests (`/requests`)

Handles employee requests for inventory items.

- Any logged-in user can raise a request for one or more inventory items
- Each request gets a unique number (e.g. `REQ-2026-0001`)
- IT staff review requests and approve or reject individual line items with a quantity
- Approved requests move to `approved` status with stock reserved
- Supports priority levels: `normal`, `high`, `urgent`
- Status flow: `submitted` → `in_review` → `approved` / `partially_approved` / `rejected` → `fulfilled` / `cancelled`

---

### Assignments (`/assignments`)

Tracks inventory assignments created when requests are fulfilled.

- Each fulfilled request creates an assignment record (e.g. `ASN-2026-0001`)
- Shows which items were assigned to which employee, when, and by whom
- Expected return date for returnable items
- Overdue returns surface as alerts in the header notification bell
- Return flow: mark items returned to add stock back to available quantity

---

### Reports (`/reports`)

Generates cross-module reports for management and audits.

| Tab                   | What it shows                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Warranty**          | All assets (systems, mobiles, network devices) with warranty expiry dates; highlights expired and expiring within 90 days |
| **Unassigned Assets** | All systems, mobiles, and SIMs currently sitting in inventory (not assigned to anyone)                                    |
| **Damaged Assets**    | All assets currently in `repair` or `retired` / `damaged` status                                                          |
| **By Department**     | Asset count broken down by department                                                                                     |
| **SIM Costs**         | Monthly SIM card billing — total spend per vendor and per employee                                                        |
| **Inventory Stock**   | Current stock levels for all inventory items                                                                              |
| **Cost Analytics**    | Purchase cost analysis across asset types                                                                                 |

All reports can be exported as CSV or PDF.

---

### User Management (`/users`)

Manages portal login accounts and their permissions.

- View all portal users (admin, regular users, viewers)
- Change a user's role: `super_admin`, `user`, `viewer`
- For `user` role: configure per-module permissions — which modules they can read, create, update, or delete
- Activate or deactivate accounts
- Only accessible by `super_admin`

---

### Activity Log (`/logs`)

Full audit trail of every action taken in the portal.

- Records who did what, on which record, at what time, from which IP address
- Actions include: created, updated, deleted, imported, exported, login, logout
- Filterable by user, action type, module, and date range
- Cannot be modified or deleted — read-only audit record

---

### Vendors (`/vendors`)

Manages the list of IT vendors and suppliers.

- Track vendor name, contact person, email, phone, website, category, address, notes
- Used as a reference when logging purchases or maintenance

---

## 6. Shared UI Components

| Component         | Purpose                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `DataTable`       | Reusable table with client-side search, sort, and pagination (25 rows/page)                                      |
| `ModulePage`      | Generic CRUD page — most hardware modules use this for list + add/edit/delete                                    |
| `DynamicForm`     | Renders a form from a field config array (type: text, select, date, textarea, number)                            |
| `Modal`           | Standard modal wrapper used across all pages                                                                     |
| `GlobalSearch`    | Full-portal search (Ctrl+K) — searches systems, network, mobiles, SIMs, GWS, employees, inventory simultaneously |
| `ChatBot`         | Floating AI assistant (bottom-right) — powered by Groq, answers questions about how to use the portal            |
| `MaintenanceLog`  | Maintenance history log panel, used by Systems and Mobile Devices                                                |
| `RecycleBinModal` | Browse and restore soft-deleted records (30-day retention)                                                       |
| `QRModal`         | Generates and downloads a QR code for any asset                                                                  |
| `Badge`           | Coloured status/type badges used in all tables                                                                   |

---

## 7. Key Conventions

- **Soft delete** — records are moved to `recycle_bin` table (not hard-deleted) and expire after 30 days
- **Activity logging** — every create, update, delete, import writes a row to `activity_log`
- **Schema migrations** — new DDL goes into `runMigrations()` in `server.js` using `IF NOT EXISTS` guards; never edit `schema.sql` for incremental changes
- **Asset tags** — auto-generated client-side from purchase date (format: e.g. `L10247` for laptops, `1M22ID` for network devices)
- **Weekly VACUUM** — backend runs `VACUUM ANALYZE` on all tables weekly to prevent PostgreSQL bloat

---

## 8. Environment Variables (`.env`)

| Variable            | Purpose                                                           |
| ------------------- | ----------------------------------------------------------------- |
| `ADMIN_USERNAME`    | Local admin login username                                        |
| `ADMIN_PASSWORD`    | Local admin login password                                        |
| `POSTGRES_DB`       | PostgreSQL database name                                          |
| `POSTGRES_USER`     | PostgreSQL username                                               |
| `POSTGRES_PASSWORD` | PostgreSQL password                                               |
| `SESSION_SECRET`    | Secret key for signing session cookies (use a long random string) |
| `GROQ_API_KEY`      | API key for the ChatBot assistant (get from console.groq.com)     |

There is no Google OAuth in this system — authentication is local email + password (see
§5 → Login). The `super_admin` account is seeded on start-up from `ADMIN_USERNAME` /
`ADMIN_PASSWORD`, not from a Google login.

---

## 9. Changelog

All changes are tracked in Git. Versions are grouped by release date.

---

### v1.4.2 — 2026-05-29

#### Fixed

- **SIM Cards — Inventory type missing everywhere** — All 110 SIM cards in the database have `assigned_type = 'inventory'` but the form dropdown, view panel, and table badge all had no mapping for it. Form dropdown now includes Inventory as the first option with default. Badge and view panel now display "Inventory" correctly. Default `assigned_type` on new SIMs changed from `service` to `inventory`.

---

### v1.4.1 — 2026-05-29

#### Fixed

- **Stale validation errors on reopen** — `openAdd()` and `openEdit()` now clear `formErrors` on every open, so a previous failed-save's inline errors no longer bleed into the next form.
- **Redundant eye button removed** — The eye icon in the Actions column was removed since clicking the row already opens the detail view. Actions column now shows only QR Code, Edit, and Delete.

---

### v1.4 — 2026-05-29

#### Added

- **Clickable table rows** — Click anywhere on a row to open its detail view. Previously required finding and clicking the eye icon in the Actions column. Actions column buttons still work independently.
- **Numbered pagination** — Page numbers with ellipsis replace the plain "3 / 12" display: `‹ 1 2 3 … 12 ›`. Rows-per-page selector (25 / 50 / 100) added to every table.
- **Skeleton loading** — Shimmer placeholder rows display while data loads, replacing the basic spinner.
- **Empty states** — Tables now show an inbox icon with a contextual message ("Get started by adding your first System Device.") instead of plain "No records found" text.
- **Search Clear button** — A Clear button appears in the search bar when a query is active.

#### Improved

- **Inline field validation** — Required fields now highlight red with an error message directly under the field instead of firing a toast. Error clears as you type.
- **Error toasts stay until dismissed** — Error toasts no longer auto-dismiss after 3.8s. Success toasts dismiss in 3s, info/warning in 4.5s.
- **Delete confirmation shows record name** — The confirmation modal now displays the asset tag, name, or email of the record being deleted.
- **Clickable row hover tint** — Rows with click behaviour show a subtle green (brand colour) hover highlight.

---

### v1.3.7 — 2026-05-29

#### Fixed

- **Employee fields now always override on form open** — Previously auto-fill used `existing || employee` so a saved department/location would block the sync. Reversed to `employee || existing` so the employee's current department and location always win when the form loads.
- **SIM Cards view panel missing Department and Location** — Fields were hidden when empty. All fields now always display with `—` fallback. Employee, Department, and Location moved up to appear directly after Named On.
- **SIM Cards table missing Department column** — Department column added between SIM Holder and Location.

---

### v1.3.6 — 2026-05-29

#### Added

- **Auto-fill Location and SIM Holder from employee** — Expanded employee auto-fill to cover all relevant fields. System Devices and Mobile Devices now auto-fill both Department and Location. SIM Cards additionally auto-fills SIM Holder with the employee's full name. All fields remain editable and only fill if currently empty.

---

### v1.3.5 — 2026-05-29

#### Fixed

- **Department auto-fill incomplete** — Auto-fill only triggered on `onChange` (new selections). Editing an existing record where an employee was already assigned did not fill the department field. Now also fills when the employee list loads, covering existing records without requiring the user to re-select the employee. Only fills if department is currently empty — manual overrides are preserved.

---

### v1.3.4 — 2026-05-29

#### Added

- **Auto-fill department on employee assignment** — Selecting an employee in the System Devices, Mobile Devices, or SIM Cards form now automatically populates the Department field from that employee's record. Field remains editable if an override is needed.

#### Fixed

- **Recycle bin never purged expired records** — The UI stated "automatically purged after 30 days" but no code ever deleted expired rows. Weekly maintenance job now runs `DELETE FROM recycle_bin WHERE expires_at < NOW()` before VACUUM ANALYZE.

---

### v1.3.3 — 2026-05-29

#### Fixed

- **`schema.sql` fresh install crash** — Index `idx_gws_assigned_user` referenced `gws_accounts(assigned_user_id)` which does not exist in the table; corrected to `idx_gws_linked_user` on `linked_user_id`. Any new Docker deployment was failing at DB initialisation.
- **Bulk edit silently failing for Vendors** — `vendors` was in the frontend table map but missing from the backend ALLOWED whitelist in `bulk.js`; selecting vendor records and clicking bulk edit returned `Invalid table`. Added `vendors` with editable fields `category` and `notes`.
- **Reports › Inventory Stock tab wrong icon** — Tab was displaying a network topology icon; corrected to the Package icon.

---

### v1.3.2 — 2026-05-29

#### Fixed

- **`schema.sql` fresh install crash** — Index `idx_gws_assigned_user` referenced `gws_accounts(assigned_user_id)` which does not exist in the table; corrected to `idx_gws_linked_user` on `linked_user_id`. Any new Docker deployment was failing at DB initialisation.
- **Bulk edit silently failing for Vendors** — `vendors` was in the frontend table map but missing from the backend ALLOWED whitelist in `bulk.js`; selecting vendor records and clicking bulk edit returned `Invalid table`. Added `vendors` with editable fields `category` and `notes`.
- **Reports › Inventory Stock tab wrong icon** — Tab was displaying a network topology icon; corrected to the Package icon.

---

### v1.3.1 — 2026-05-29

#### Fixed

- **Global search broken** — `imei1` column reference in search query did not exist; corrected to `imei`. Every search was returning a 500 error silently.
- **Actions column alignment** — Actions header and buttons are now left-aligned consistent with all other table columns.

---

### v1.3 — 2026-05-29

#### Added

- **Network Devices populated** — 7 devices imported from sample CSV; form fields corrected (device type and status options now match DB constraints; added vlan, firmware version, rack location, vendor, warranty expiry fields; removed phantom `assigned_to` field).
- **Light mode support** — Added `--surface-overlay`, `--surface-subtle`, `--surface-input`, `--surface-hover` CSS variables. Replaced 20+ hardcoded `rgba(255,255,255,x)` dark-mode-only backgrounds across ChatBot, Dashboard, ModulePage, SystemDevices, GlobalSearch, Header, Sidebar, Employees, and the loading spinner.
- **Weekly VACUUM** — Backend runs `VACUUM ANALYZE` on all tables 60 seconds after startup, then every 7 days. Prevents PostgreSQL dead-tuple bloat under active write load. No new dependency required.
- **Technical documentation** — `TECHNICAL.md` created covering tech stack, architecture, all pages, components, conventions, and environment variables.

#### Fixed

- **ChatBot GROQ key** — Duplicate `GROQ_API_KEY` entries in `.env` caused the placeholder value to override the real key. Deduplicated.
- **Warranty report** — Confirmed query is correct; was showing 0 records only because no warranty dates existed in data. Now shows results from imported network devices.

---

### v1.2 — 2026-05-28

#### Added

- **Code quality audit** — All route catch blocks converted from silent `res.status(500)` to `next(err)`. Global Express error handler added to `server.js`.
- **Shared utilities extracted** — `logActivity()` and `getIP()` deduplicated into `backend/src/utils/activity.js`. `fmtDate()` deduplicated into `frontend/src/lib/utils.js`.
- **Frontend async safety** — Cancelled-flag pattern applied to all async `useEffect` hooks across Reports, Assignments, CloudIDs, MobileDevices, SIMCards, SystemDevices, UserManagement, GlobalSearch, MaintenanceLog.
- **React hooks fixes** — Rules of Hooks violations fixed in ActivityLog and UserManagement (hooks were called after early return).
- **GitHub repository** — Project pushed to `github.com/zr-zdzr/ITSM`.

#### Database

- **Legacy columns dropped** — `first_name` and `last_name` removed from `employees` table (superseded by `full_name` in v1.1).
- **27 FK indexes added** — All unindexed foreign key columns indexed; total indexes raised from 55 to 82.
- **VACUUM ANALYZE run** — Dead tuples cleared (49 in mobiles, 14 in users).
- **10 performance indexes added** to `schema.sql` for fresh installs.

#### Fixed

- `vendors.js` — wrong column reference `u.display_name` corrected to `u.name`.
- `seed.js` — wrong column `quantity` corrected to `qty_available`.

---

### v1.1 — 2026-05-16 to 2026-05-19

#### Added

- **Inventory, Requests & Assignments modules** — full stock management workflow: categories, items, stock adjustments, employee requests, IT approval/rejection, fulfillment, assignment tracking, returns.
- **QR code generation** — every asset can generate a scannable QR code with tag + specs, downloadable as PNG or printable as a 1 cm sticker.
- **Global search** (`Ctrl+K`) — searches across systems, network, mobiles, SIMs, GWS accounts, employees, and inventory simultaneously.
- **Alert center** — header notification bell showing low/out-of-stock inventory alerts, overdue returns, and expiring warranties.
- **Maintenance log** — per-device repair and maintenance history for Systems and Mobile Devices.
- **Vendor module** — manage IT suppliers and service providers.
- **Bulk edit/delete** — select multiple rows and apply actions in one step.
- **Cost analytics report tab** — purchase cost breakdown by asset type.
- **Bykea B logo** — brand logo integrated into sidebar and login page.
- **Dashboard accordion panels** — clicking any stat card expands a live data panel with charts and breakdowns.
- **Warranty alerts** extended to Mobile Devices and Network Devices (previously Systems only).
- **SIM billing report** — monthly cost per vendor and per employee.
- **Employee assignments panel** — view all assets assigned to an employee from their record.
- **Per-module menu visibility** — users only see sidebar items for modules they have permission to access.

#### Changed

- **Employees** — `first_name` + `last_name` merged into single `full_name` field.
- **Mobile Devices** — renamed from "Mobiles", columns reshuffled, IMEI 1 and IMEI 2 merged display, assignment popup added.
- **Cloud IDs** — Display Name moved to first column, clickable to open full detail popup.
- **SIM Cards** — column reorder, phone number and username clickable.
- **Dashboard** — inventory widget added, pagination on all data panels.

---

### v1.0 — 2026-05-11

Initial release.

#### Modules

- System Devices, Mobile Devices, SIM Cards, Cloud IDs (Google Workspace), Employees
- Reports (warranty, unassigned, damaged, department breakdown)
- User Management with role-based access (`super_admin`, `user`, `viewer`)
- Activity Log — full audit trail
- Dashboard with live stats

#### Infrastructure

- Docker Compose stack: PostgreSQL 16, Express backend, Nginx + React frontend
- Google OAuth restricted to `@bykea.com` domain
- Local admin fallback login
- Session persistence via PostgreSQL (`connect-pg-simple`)
- Soft delete via recycle bin (30-day retention)
- CSV import/export on all asset modules
- Dark/light theme toggle
