/**
 * Test harness.
 *
 * Every run builds a throwaway database (`itms_test` by default) from
 * migrations/schema.sql plus runMigrations(), so tests never touch the real
 * `itms` data and never depend on rows a developer happens to have locally.
 *
 * DATABASE_URL must be pointed at the test database BEFORE anything requires
 * config/db.js, because that module reads the variable once at import time and
 * caches a Pool. That is why this file does the rewrite at the very top and
 * why every test requires it before requiring the app.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const TEST_DB = process.env.TEST_DB_NAME || "itms_test";

function adminUrl() {
  // Prefer an explicit override; otherwise derive from the app's own
  // DATABASE_URL so a developer with different credentials needs no extra
  // configuration. Falls back to the docker-compose defaults.
  const base =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    `postgres://${process.env.POSTGRES_USER || "itms_user"}:${
      process.env.POSTGRES_PASSWORD || "itms_secret"
    }@localhost:5432/itms`;
  const u = new URL(base);
  // Connect to the maintenance DB; you cannot drop a database you are in.
  u.pathname = "/postgres";
  return { admin: u.toString(), parsed: u };
}

const { admin, parsed } = adminUrl();
const testUrl = (() => {
  const u = new URL(parsed.toString());
  u.pathname = `/${TEST_DB}`;
  return u.toString();
})();

// Must happen before config/db.js is ever required.
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = "test";
// Keep seedAdmin() a no-op unless a test asks for it.
delete process.env.ADMIN_PASSWORD;
// A developer's .env may carry Google SSO credentials; with them present the
// whole app switches to Google-only login and every password-based test
// fails. Tests always start dormant — google-auth.test.js opts in per test.
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;

/** Drop and recreate the test database, then apply the full schema. */
async function createTestDatabase() {
  const client = new Client({ connectionString: admin });
  await client.connect();
  try {
    // Terminate stragglers from a previous crashed run, or DROP will block.
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB],
    );
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
    await client.query(`CREATE DATABASE "${TEST_DB}"`);
  } finally {
    await client.end();
  }

  const schema = fs.readFileSync(
    path.join(__dirname, "..", "..", "migrations", "schema.sql"),
    "utf8",
  );
  const seeded = new Client({ connectionString: testUrl });
  await seeded.connect();
  try {
    await seeded.query(schema);
  } finally {
    await seeded.end();
  }

  // runMigrations() carries every change made since schema.sql was frozen, so
  // the test database matches production rather than the initial snapshot.
  const { runMigrations } = require("../../src/server");
  await runMigrations();
}

async function dropTestDatabase() {
  const db = require("../../src/config/db");
  await db.end();
  const client = new Client({ connectionString: admin });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB],
    );
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
  } finally {
    await client.end();
  }
}

/** Remove all rows between tests without rebuilding the schema. */
async function truncateAll() {
  const db = require("../../src/config/db");
  const { rows } = await db.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await db.query(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

module.exports = { createTestDatabase, dropTestDatabase, truncateAll, testUrl };
