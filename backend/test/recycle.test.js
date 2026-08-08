const test = require("node:test");
const assert = require("node:assert/strict");
const setup = require("./helpers/setup");

let db, makeUser, grant, loginAs;

test.before(async () => {
  await setup.createTestDatabase();
  ({ db, makeUser, grant, loginAs } = require("./helpers/factories"));
});
test.after(async () => setup.dropTestDatabase());
test.beforeEach(async () => setup.truncateAll());

async function adminAgent() {
  const admin = await makeUser({
    email: "admin@bykea.com",
    name: "Admin",
    role: "super_admin",
  });
  return { admin, agent: await loginAs(admin) };
}

test("deleting a vendor moves it to the bin with a 90-day window", async () => {
  const { agent } = await adminAgent();
  const created = await agent.post("/api/vendors").send({ name: "Acme Ltd" });
  assert.equal(created.status, 201);

  const del = await agent.delete(`/api/vendors/${created.body.id}`);
  assert.equal(del.status, 200);

  // Gone from the live table...
  const live = await db.query("SELECT * FROM vendors WHERE id = $1", [
    created.body.id,
  ]);
  assert.equal(live.rowCount, 0);

  // ...but recoverable, with the retention the UI promises.
  const { rows } = await db.query(
    `SELECT record_name, (expires_at::date - deleted_at::date) AS days
       FROM recycle_bin WHERE table_name = 'vendors'`,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].record_name, "Acme Ltd");
  assert.equal(Number(rows[0].days), 90);
});

test("restore puts the row back and logs it", async () => {
  const { agent } = await adminAgent();
  const created = await agent.post("/api/vendors").send({ name: "Restore Me" });
  await agent.delete(`/api/vendors/${created.body.id}`);

  const bin = await db.query("SELECT id FROM recycle_bin LIMIT 1");
  const res = await agent.post(`/api/recycle-bin/${bin.rows[0].id}/restore`);
  assert.equal(res.status, 200);

  const back = await db.query("SELECT name FROM vendors WHERE name = $1", [
    "Restore Me",
  ]);
  assert.equal(back.rowCount, 1);

  // The bin entry is consumed by a successful restore.
  const left = await db.query("SELECT count(*)::int n FROM recycle_bin");
  assert.equal(left.rows[0].n, 0);

  const logged = await db.query(
    "SELECT action FROM activity_log WHERE action = 'restored'",
  );
  assert.equal(logged.rowCount, 1);
});

test("a permanent purge still leaves the full record in the audit trail", async () => {
  const { agent } = await adminAgent();
  const created = await agent
    .post("/api/vendors")
    .send({ name: "Doomed Vendor", email: "doomed@x.com" });
  await agent.delete(`/api/vendors/${created.body.id}`);

  const bin = await db.query("SELECT id FROM recycle_bin LIMIT 1");
  const res = await agent.delete(`/api/recycle-bin/${bin.rows[0].id}`);
  assert.equal(res.status, 200);

  assert.equal(
    (await db.query("SELECT count(*)::int n FROM recycle_bin")).rows[0].n,
    0,
  );

  // This is the whole point of the purge snapshot: the row is gone from every
  // live table, and still fully reconstructable from the log.
  const { rows } = await db.query(
    "SELECT changes FROM activity_log WHERE action = 'purged'",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].changes.snapshot.name, "Doomed Vendor");
  assert.equal(rows[0].changes.snapshot.email, "doomed@x.com");
});

test("a viewer cannot purge or restore", async () => {
  const { agent: admin } = await adminAgent();
  const created = await admin.post("/api/vendors").send({ name: "Protected" });
  await admin.delete(`/api/vendors/${created.body.id}`);
  const bin = await db.query("SELECT id FROM recycle_bin LIMIT 1");

  const viewer = await makeUser({ email: "peek@bykea.com", role: "viewer" });
  const agent = await loginAs(viewer);

  assert.equal((await agent.delete(`/api/recycle-bin/${bin.rows[0].id}`)).status, 403);
  assert.equal(
    (await agent.post(`/api/recycle-bin/${bin.rows[0].id}/restore`)).status,
    403,
  );

  // Nothing was destroyed by the attempts.
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM recycle_bin")).rows[0].n,
    1,
  );
});

test("a user with delete on the owning module may purge", async () => {
  const { agent: admin } = await adminAgent();
  const created = await admin.post("/api/vendors").send({ name: "Purgeable" });
  await admin.delete(`/api/vendors/${created.body.id}`);
  const bin = await db.query("SELECT id FROM recycle_bin LIMIT 1");

  const user = await makeUser({ email: "purger@bykea.com", role: "user" });
  await grant(user.id, "vendors", { delete: true });
  const agent = await loginAs(user);

  assert.equal((await agent.delete(`/api/recycle-bin/${bin.rows[0].id}`)).status, 200);
});

test("restore refuses a table that is not on the allow-list", async () => {
  const { admin, agent } = await adminAgent();
  // Forge an entry naming a table the restore route must never write to.
  const forged = await db.query(
    `INSERT INTO recycle_bin (module, table_name, record_id, record_name, data, deleted_by)
     VALUES ('vendors','pg_shadow',1,'evil','{"x":1}'::jsonb,$1) RETURNING id`,
    [admin.id],
  );

  const res = await agent.post(`/api/recycle-bin/${forged.rows[0].id}/restore`);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /invalid table/i);
});
