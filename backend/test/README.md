# Backend tests

```bash
cd backend
npm test
```

Runs `node --test` (Node's built-in runner) with `supertest` for HTTP. No test framework is
installed and none is needed.

## What it needs

A reachable PostgreSQL. `docker compose up db` from the repo root is enough — the full stack does
not have to be running.

Connection details are taken from `DATABASE_URL`, or failing that from `POSTGRES_USER` /
`POSTGRES_PASSWORD` (the docker-compose defaults). If your shell does not already have them:

```bash
set -a; . ../.env; set +a && npm test
```

## How isolation works

Each run **drops and recreates a separate `itms_test` database**, applies `migrations/schema.sql`
and then `runMigrations()`, and drops it again at the end. Your real `itms` data is never read or
written. Every test starts from `TRUNCATE ... RESTART IDENTITY CASCADE`, so tests do not inherit
each other's rows.

Two consequences worth knowing:

- `test/helpers/setup.js` must be required **before** anything that requires `src/config/db.js`,
  because that module reads `DATABASE_URL` once at import time and caches a Pool. Every test file
  requires the helper first for this reason.
- Tests run with `--test-concurrency=1`. They share one database, so running files in parallel
  would let one file's `TRUNCATE` delete another's fixtures.

## What is covered

| File                  | Area                                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.test.js`        | login success/failure, deactivated accounts, session cookie flags, logout                                                                                                                             |
| `permissions.test.js` | `hasPerm()` matrix for all three roles, and `perm()` over HTTP                                                                                                                                        |
| `recycle.test.js`     | delete → bin → restore, permanent purge, viewer denial, restore allow-list                                                                                                                            |
| `audit.test.js`       | `diffRows()` unit tests, field-level change capture, attribution surviving user deletion, activity-log paging                                                                                         |
| `systems.test.js`     | asset-module CRUD (systems as the representative module): validation, filters, audit diffs, asset_history events, recycle bin, per-verb permissions                                                   |
| `csv.test.js`         | CSV import upsert semantics (match by tag, then by make+model+serial), bad-row skipping, export round-trip, permission gates                                                                          |
| `assignments.test.js` | inventory assign/return flows: stock ledger consistency, transactional rollback, partial and damaged returns                                                                                          |
| `maintenance.test.js` | repair ↔ parts consumption: atomic stock decrement through the ledger, restock-on-delete flag, low-stock alert firing, per-asset-module permissions                                                   |
| `units.test.js`       | serialized units + bins: stock counters synced to unit statuses, per-unit ledger rows, repairs installing units by serial, serialized items locked out of raw adjusts/assignments, QR lookup endpoint |

The first four files are the **risky** surface — auth, authorisation, and anything that destroys
data. The last three cover the main business flows; systems stands in for the other asset modules,
which share the same route shape.

## Adding a test

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const setup = require("./helpers/setup"); // must come first

let db, makeUser, loginAs;

test.before(async () => {
  await setup.createTestDatabase();
  ({ db, makeUser, loginAs } = require("./helpers/factories"));
});
test.after(async () => setup.dropTestDatabase());
test.beforeEach(async () => setup.truncateAll());
```

`factories.js` provides `makeUser`, `grant`, `loginAs` (returns a supertest agent holding the
session cookie), `makeEmployee`, `makeItem` (consumable item plus its stock row) and `stockOf`.

Helpers live in `test/helpers/` and are excluded from the run by the `test/*.test.js` glob — Node's
runner would otherwise execute every `.js` file under `test/` as a test file.
