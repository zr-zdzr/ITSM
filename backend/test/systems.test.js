/**
 * Asset-module CRUD, using systems as the representative module (all asset
 * modules share the same shape: perm() guards, activity log on every
 * mutation, recycle bin on delete, asset_history on assignment changes).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const setup = require("./helpers/setup");

let db, makeUser, grant, loginAs, makeEmployee;

test.before(async () => {
  await setup.createTestDatabase();
  ({ db, makeUser, grant, loginAs, makeEmployee } = require("./helpers/factories"));
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

const LAPTOP = {
  asset_tag: "IT-SYS-9001",
  type: "Laptop",
  manufacturer: "Dell",
  model: "Latitude 5540",
  serial_number: "sn-test-001",
};

test("create validates required fields one by one", async () => {
  const { agent } = await adminAgent();
  for (const missing of [
    "asset_tag",
    "type",
    "manufacturer",
    "model",
    "serial_number",
  ]) {
    const body = { ...LAPTOP };
    delete body[missing];
    const res = await agent.post("/api/systems").send(body);
    assert.equal(res.status, 400, `expected 400 when ${missing} is missing`);
    assert.match(res.body.error, new RegExp(missing));
  }
});

test("create returns the row, uppercases the serial, and logs it", async () => {
  const { agent } = await adminAgent();
  const res = await agent.post("/api/systems").send(LAPTOP);
  assert.equal(res.status, 201);
  assert.equal(res.body.serial_number, "SN-TEST-001");
  assert.equal(res.body.status, "available");

  const logged = await db.query(
    `SELECT record_label, user_label FROM activity_log
      WHERE action='created' AND table_name='systems'`,
  );
  assert.equal(logged.rowCount, 1);
  assert.equal(logged.rows[0].record_label, "IT-SYS-9001");
  assert.equal(logged.rows[0].user_label, "Admin");
});

test("a duplicate asset tag or serial is rejected with 409", async () => {
  const { agent } = await adminAgent();
  assert.equal((await agent.post("/api/systems").send(LAPTOP)).status, 201);
  const dup = await agent
    .post("/api/systems")
    .send({ ...LAPTOP, asset_tag: "IT-SYS-9002" }); // same serial
  assert.equal(dup.status, 409);
});

test("list filters by q and by status", async () => {
  const { agent } = await adminAgent();
  await agent.post("/api/systems").send(LAPTOP);
  await agent.post("/api/systems").send({
    ...LAPTOP,
    asset_tag: "IT-SYS-9002",
    serial_number: "SN-TEST-002",
    manufacturer: "Lenovo",
    status: "repair",
  });

  const byQ = await agent.get("/api/systems").query({ q: "lenovo" });
  assert.equal(byQ.body.length, 1);
  assert.equal(byQ.body[0].manufacturer, "Lenovo");

  const byStatus = await agent.get("/api/systems").query({ status: "repair" });
  assert.equal(byStatus.body.length, 1);
  assert.equal(byStatus.body[0].asset_tag, "IT-SYS-9002");
});

test("get one returns 404 for a missing id", async () => {
  const { agent } = await adminAgent();
  assert.equal((await agent.get("/api/systems/999999")).status, 404);
});

test("a no-op update records no false field changes", async () => {
  const { agent } = await adminAgent();
  const created = await agent.post("/api/systems").send(LAPTOP);

  // Re-submit the exact same data, as the edit form does when nothing changed.
  const res = await agent
    .put(`/api/systems/${created.body.id}`)
    .send({ ...LAPTOP, serial_number: "SN-TEST-001" });
  assert.equal(res.status, 200);

  const { rows } = await db.query(
    `SELECT changes, details FROM activity_log
      WHERE action='updated' AND table_name='systems'`,
  );
  assert.equal(rows.length, 1);
  // Regression: the route used to fetch only 6 columns for the "before" row,
  // so every other populated column showed up as [null, value].
  assert.equal(rows[0].changes, null);
  assert.match(rows[0].details, /no field changes/);
});

test("an update records exactly the fields that changed", async () => {
  const { agent } = await adminAgent();
  const created = await agent.post("/api/systems").send(LAPTOP);

  const res = await agent
    .put(`/api/systems/${created.body.id}`)
    .send({ ...LAPTOP, serial_number: "SN-TEST-001", model: "Latitude 5550" });
  assert.equal(res.status, 200);

  const { rows } = await db.query(
    `SELECT changes FROM activity_log WHERE action='updated'`,
  );
  assert.deepEqual(Object.keys(rows[0].changes), ["model"]);
  assert.deepEqual(rows[0].changes.model, ["Latitude 5540", "Latitude 5550"]);
});

test("assigning, transferring and unassigning write asset_history with labels", async () => {
  const { agent } = await adminAgent();
  const emp1 = await makeEmployee({ fullName: "First Holder" });
  const emp2 = await makeEmployee({ fullName: "Second Holder" });
  const created = await agent.post("/api/systems").send(LAPTOP);
  const id = created.body.id;
  const base = { ...LAPTOP, serial_number: "SN-TEST-001" };

  await agent.put(`/api/systems/${id}`).send({
    ...base,
    assigned_type: "employee",
    assigned_user_id: emp1.id,
    status: "assigned",
  });
  await agent.put(`/api/systems/${id}`).send({
    ...base,
    assigned_type: "employee",
    assigned_user_id: emp2.id,
    status: "assigned",
  });
  await agent.put(`/api/systems/${id}`).send({ ...base, status: "available" });

  const { rows } = await db.query(
    `SELECT event_type, from_employee_label, to_employee_label, performed_by_label
       FROM asset_history WHERE asset_id=$1 ORDER BY id`,
    [id],
  );
  assert.deepEqual(
    rows.map((r) => r.event_type),
    ["assigned", "transferred", "unassigned"],
  );
  assert.equal(rows[0].to_employee_label, "First Holder");
  assert.equal(rows[1].from_employee_label, "First Holder");
  assert.equal(rows[1].to_employee_label, "Second Holder");
  assert.equal(rows[2].from_employee_label, "Second Holder");
  assert.equal(rows[0].performed_by_label, "Admin");
});

test("delete moves the system to the recycle bin and logs it", async () => {
  const { agent } = await adminAgent();
  const created = await agent.post("/api/systems").send(LAPTOP);

  const del = await agent.delete(`/api/systems/${created.body.id}`);
  assert.equal(del.status, 200);

  assert.equal(
    (await db.query("SELECT count(*)::int n FROM systems")).rows[0].n,
    0,
  );
  const bin = await db.query(
    "SELECT record_name, data FROM recycle_bin WHERE table_name='systems'",
  );
  assert.equal(bin.rowCount, 1);
  assert.equal(bin.rows[0].record_name, "IT-SYS-9001");
  assert.equal(bin.rows[0].data.serial_number, "SN-TEST-001");

  const logged = await db.query(
    "SELECT record_label FROM activity_log WHERE action='deleted'",
  );
  assert.equal(logged.rows[0].record_label, "IT-SYS-9001");
});

test("delete all bins every row, not just the count", async () => {
  const { agent } = await adminAgent();
  await agent.post("/api/systems").send(LAPTOP);
  await agent.post("/api/systems").send({
    ...LAPTOP,
    asset_tag: "IT-SYS-9002",
    serial_number: "SN-TEST-002",
  });

  const res = await agent.delete("/api/systems/all");
  assert.equal(res.status, 200);
  assert.equal(res.body.deleted, 2);
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM recycle_bin")).rows[0].n,
    2,
  );
});

test("module permissions gate each verb", async () => {
  const { agent: admin } = await adminAgent();
  const created = await admin.post("/api/systems").send(LAPTOP);

  const user = await makeUser({ email: "worker@bykea.com", role: "user" });
  await grant(user.id, "systems", { create: true }); // no update, no delete
  const agent = await loginAs(user);

  // Reads are open to any authenticated user.
  assert.equal((await agent.get("/api/systems")).status, 200);
  // Granted verb works…
  const ok = await agent.post("/api/systems").send({
    ...LAPTOP,
    asset_tag: "IT-SYS-9002",
    serial_number: "SN-TEST-002",
  });
  assert.equal(ok.status, 201);
  // …ungranted verbs do not.
  assert.equal(
    (
      await agent
        .put(`/api/systems/${created.body.id}`)
        .send({ ...LAPTOP, serial_number: "SN-TEST-001" })
    ).status,
    403,
  );
  assert.equal(
    (await agent.delete(`/api/systems/${created.body.id}`)).status,
    403,
  );

  const viewer = await makeUser({ email: "viewer@bykea.com", role: "viewer" });
  const viewerAgent = await loginAs(viewer);
  assert.equal(
    (await viewerAgent.post("/api/systems").send(LAPTOP)).status,
    403,
  );
});
