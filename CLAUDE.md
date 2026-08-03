# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ITMS — IT Management System for Bykea. Full-stack inventory tracker for hardware (systems, network devices, mobiles, SIM cards), Google Workspace accounts, employees, consumable inventory, requests, and assignments.

## Running the app

**Production (Docker):**

```bash
cp .env.example .env   # fill in secrets
docker compose up -d
```

The frontend is served by nginx on port 80, which reverse-proxies `/api` and `/auth` to the backend container on port 3000.

**Development (local):**

```bash
# Terminal 1 — database only
docker compose up db

# Terminal 2 — backend
cd backend && npm install && npm run dev

# Terminal 3 — frontend (proxies /api and /auth to localhost:3000)
cd frontend && npm install && npm run dev
```

Frontend dev server: `http://localhost:5173`  
Backend health: `http://localhost:3000/api/health`

## Architecture

### Backend (`backend/src/`)

- **`server.js`** — Express entry point. Mounts all routes, runs `runMigrations()` and `seedAdmin()` on startup. Schema migrations are written inline in `runMigrations()` using `IF NOT EXISTS` / `IF NOT EXISTS` guards — new DDL goes there, not in `schema.sql`.
- **`migrations/schema.sql`** — Initial schema loaded by Docker Postgres on first container creation only. Subsequent changes must be in `runMigrations()`.
- **`config/db.js`** — pg Pool singleton; import this everywhere for DB access.
- **`config/passport.js`** — Google OAuth2 + local strategy. Google login restricted to `ALLOWED_DOMAIN` (bykea.com); `SUPER_ADMIN_EMAIL` gets super_admin on first login.
- **`middleware/auth.js`** — `requireAuth`, `requireRole`, `perm(module, action)`. Use `perm('module','create'|'update'|'delete'|'read')` on routes. `super_admin` bypasses all checks; `viewer` is read-only.
- **`routes/`** — One file per resource. Routes log to `activity_log` table. Soft-deletes go through `utils/recycle.js` into the `recycle_bin` table (30-day TTL).

### Frontend (`frontend/src/`)

- React 18 + React Router v6 + Bootstrap 5 (dark/light theme via `data-bs-theme`). No Tailwind — styling is Bootstrap utility classes + CSS variables in `index.css`.
- Brand color: `--brand: #00aa2f` (Bykea green). Dark background: `#09090b`.
- **`lib/api.js`** — Thin `fetch` wrapper (`api.get/post/put/patch/del/download`). Always `credentials: 'include'`.
- **`contexts/AuthContext.jsx`** — `useAuth()` hook. Exposes `user`, `loading`, `canPerm(module, action)`, `logout()`. `canPerm` mirrors backend `perm()` logic on the frontend.
- **`pages/ModulePage.jsx`** — Generic CRUD page used by most hardware modules. Accepts a `config` object with `apiPath`, `module`, `columns`, `fields`, `title`, etc. Asset-specific pages (SystemDevices, NetworkDevices, etc.) build their own `config` and may render a custom form while still using `ModulePage` for list/table logic.
- **`components/ui/DataTable.jsx`** — Client-side sort/filter/pagination (25 rows/page). All data is fetched once; filtering is in-memory.
- **`components/ui/DynamicForm.jsx`** — Renders form fields from a `fields` array (type: `text|select|textarea|date|number`).
- **`components/ui/Modal.jsx`** — Standard modal wrapper used across all pages.

### Roles & permissions

Three roles: `super_admin` (all access), `user` (module-level CRUD permissions in `user_permissions` table), `viewer` (read-only everywhere).

## Key conventions

- **Activity logging**: Every mutation route inserts a row into `activity_log`. Pattern: `INSERT INTO activity_log (user_id, action, table_name, record_id, record_label, details)`.
- **Soft delete**: Use `utils/recycle.js` helper to move records to `recycle_bin` before hard-deleting. Recycle bin has a 30-day expiry.
- **Schema changes**: Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements to `runMigrations()` in `server.js`. Never edit `schema.sql` for incremental changes — it only runs on fresh DB init.
- **CSV import/export**: Routes use `csv-parse` (import) and `csv-stringify` (export). Sample CSV files live in `frontend/downloads/`.
- **Asset tags**: Generated client-side in `frontend/src/lib/utils.js` `genAssetTag()`.
- **No test suite** exists. Manual verification via the running app is the current approach.
