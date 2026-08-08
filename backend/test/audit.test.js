const test = require("node:test");
const assert = require("node:assert/strict");
const setup = require("./helpers/setup");

let db, makeUser, loginAs, diffRows;

test.before(async () => {
  await setup.createTestDatabase();
  ({ db, makeUser, loginAs } = require("./helpers/factories"));
  ({ diffRows } = require("../src/utils/activity"));
});
test.after(async () => setup.dropTestDatabase());
test.beforeEach(async () => setup.truncateAll());

// ── diffRows: pure, no database ──────────────────────────────

test("diffRows reports only fields that actually moved", () => {
  const before = { id: 1, name: "A", status: "available", notes: null };
  const after = { id: 1, name: "A", status: "in_use", notes: "assigned" };
  assert.deepEqual(diffRows(before, after), {
    status: ["available", "in_use"],
    notes: [null, "assigned"],
  });
});

test("diffRows returns null when nothing changed", () => {
  const row = { id: 1, name: "A", status: "available" };
  assert.equal(diffRows(row, { ...row }), null);
});

test("diffRows ignores id and the timestamp columns", () => {
  const before = { id: 1, created_at: "x", updated_at: "y", name: "A" };
  const after = { id: 2, created_at: "p", updated_at: "q", name: "A" };
  assert.equal(diffRows(before, after), null);
});

test("diffRows does not report a phantom change when pg round-trips a type", () => {
  // The classic false positive: the same value arrives back as a different
  // JS type (number vs numeric-string, Date vs ISO string).
  const d = new Date("2026-01-01T00:00:00.000Z");
  const before = { cost: 100, when: d };
  const after = { cost: "100", when: d.toISOString() };
  assert.equal(diffRows(before, after), null);
});

test("diffRows only considers keys present in the updated row", () => {
  // A partial update must not report every untouched column as cleared.
  const before = { a: 1, b: 2, c: 3 };
  const after = { a: 9 };
  assert.deepEqual(diffRows(before, after), { a: ["1", "9"] });
});

test("diffRows is null-safe on a missing side", () => {
  assert.equal(diffRows(null, { a: 1 }), null);
  assert.equal(diffRows({ a: 1 }, null), null);
});

// ── the trail itself ─────────────────────────────────────────

test("an update records which fields changed, with before and after", async () => {
  const admin = await makeUser({ email: "a@bykea.com", role: "super_admin" });
  const agent = await loginAs(admin);

  const created = await agent
    .post("/api/vendors")
    .send({ name: "Diff Co", category: "hardware", email: "one@x.com" });
  await agent
    .put(`/api/vendors/${created.body.id}`)
    .send({ name: "Diff Co", category: "software", email: "two@x.com" });

  const { rows } = await db.query(
    "SELECT changes, details FROM activity_log WHERE action = 'updated'",
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].changes, {
    category: ["hardware", "software"],
    email: ["one@x.com", "two@x.com"],
  });
  assert.match(rows[0].details, /category/);
});

test("attribution survives deletion of the user who made the change", async () => {
  const admin = await makeUser({
    email: "boss@bykea.com",
    name: "The Boss",
    role: "super_admin",
  });
  const victim = await makeUser({
    email: "leaver@bykea.com",
    name: "Departing Person",
    role: "user",
  });

  // Something the departing person did.
  await db.query(
    `INSERT INTO activity_log (user_id, user_label, action, table_name, record_label)
     VALUES ($1, (SELECT name FROM users WHERE id = $1), 'updated', 'systems', 'L12345')`,
    [victim.id],
  );

  const agent = await loginAs(admin);
  assert.equal((await agent.delete(`/api/users/${victim.id}`)).status, 200);

  const { rows } = await db.query(
    "SELECT user_id, user_label FROM activity_log WHERE record_label = 'L12345'",
  );
  // The FK nulls out, but the history still names who did it.
  assert.equal(rows[0].user_id, null);
  assert.equal(rows[0].user_label, "Departing Person");
});

test("deleting a user snapshots the permissions the cascade destroys", async () => {
  const admin = await makeUser({ email: "boss2@bykea.com", role: "super_admin" });
  const victim = await makeUser({ email: "perms@bykea.com", role: "user" });
  await require("./helpers/factories").grant(victim.id, "systems", {
    create: true,
    update: true,
  });

  const agent = await loginAs(admin);
  await agent.delete(`/api/users/${victim.id}`);

  // user_permissions is ON DELETE CASCADE, so without the snapshot the grants
  // would be unrecoverable.
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM user_permissions")).rows[0].n,
    0,
  );

  const { rows } = await db.query(
    "SELECT changes FROM activity_log WHERE action = 'deleted' AND table_name = 'users'",
  );
  const saved = rows[0].changes.permissions;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].module, "systems");
  assert.equal(saved[0].can_create, true);
  assert.equal(saved[0].can_delete, false);

  // And the account itself is recoverable.
  const bin = await db.query(
    "SELECT record_name FROM recycle_bin WHERE table_name = 'users'",
  );
  assert.equal(bin.rowCount, 1);
});

test("every mutation writes an actor label, not just a foreign key", async () => {
  const admin = await makeUser({
    email: "labeled@bykea.com",
    name: "Labelled Admin",
    role: "super_admin",
  });
  const agent = await loginAs(admin);
  await agent.post("/api/vendors").send({ name: "Labelled Co" });

  const { rows } = await db.query(
    "SELECT user_label FROM activity_log WHERE action = 'created'",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_label, "Labelled Admin");
});

test("the admin activity log pages and reports a true total", async () => {
  const admin = await makeUser({ email: "pager@bykea.com", role: "super_admin" });
  const agent = await loginAs(admin);
  for (let i = 0; i < 5; i++) {
    await agent.post("/api/vendors").send({ name: `Vendor ${i}` });
  }

  const first = await agent.get("/api/users/activity/log?limit=2&offset=0");
  assert.equal(first.status, 200);
  assert.equal(first.body.rows.length, 2);
  // 5 creates + the login.
  assert.equal(first.body.total, 6);

  const second = await agent.get("/api/users/activity/log?limit=2&offset=2");
  assert.equal(second.body.rows.length, 2);
  // Paging must not repeat rows.
  assert.notEqual(first.body.rows[0].id, second.body.rows[0].id);

  const filtered = await agent.get("/api/users/activity/log?action=created");
  assert.equal(filtered.body.total, 5);
});

test("a non-admin cannot read the activity log", async () => {
  const user = await makeUser({ email: "nosy@bykea.com", role: "user" });
  const agent = await loginAs(user);
  assert.equal((await agent.get("/api/users/activity/log")).status, 403);
});
