/**
 * Repair ↔ parts consumption (Phase 1 of docs/spare-parts-architecture.md).
 * The invariant under test: stock only ever moves through the inv_adjustments
 * ledger, atomically with the maintenance entry that caused the movement.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const setup = require("./helpers/setup");

let db, makeUser, grant, loginAs, makeItem, stockOf;

test.before(async () => {
  await setup.createTestDatabase();
  ({ db, makeUser, grant, loginAs, makeItem, stockOf } =
    require("./helpers/factories"));
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

// maintenance_log.asset_id is a soft FK, so a bare id is enough for the API;
// tests that only exercise parts logic don't need a real system row.
const ASSET = "/api/maintenance/system/1";

test("logging a repair with parts decrements stock through the ledger", async () => {
  const { agent } = await adminAgent();
  const screen = await makeItem({ name: 'LCD Panel 14"', qty: 5 });

  const res = await agent.post(ASSET).send({
    event_type: "replaced_part",
    cost_pkr: 1000,
    parts: [{ item_id: screen.id, qty: 2, unit_cost_pkr: 8500 }],
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.parts.length, 1);
  assert.equal(res.body.parts[0].item_name, 'LCD Panel 14"');
  assert.equal(Number(res.body.parts_cost_pkr), 17000);

  assert.equal((await stockOf(screen.id)).qty_available, 3);

  const ledger = await db.query(
    `SELECT type, qty_change, reference_type, reference_id
       FROM inv_adjustments WHERE item_id = $1`,
    [screen.id],
  );
  assert.equal(ledger.rowCount, 1);
  assert.equal(ledger.rows[0].type, "repair_consumption");
  assert.equal(ledger.rows[0].qty_change, -2);
  assert.equal(ledger.rows[0].reference_type, "maintenance_log");
  assert.equal(ledger.rows[0].reference_id, res.body.id);

  const parts = await db.query(
    "SELECT qty, unit_cost_pkr FROM maintenance_parts WHERE maintenance_log_id = $1",
    [res.body.id],
  );
  assert.equal(parts.rowCount, 1);
  assert.equal(Number(parts.rows[0].unit_cost_pkr), 8500);

  const logged = await db.query(
    "SELECT details FROM activity_log WHERE action='created' AND table_name='maintenance_log'",
  );
  assert.match(logged.rows[0].details, /1 part\(s\) consumed/);
});

test("insufficient stock rolls back the entry and every stock change", async () => {
  const { agent } = await adminAgent();
  const battery = await makeItem({ name: "Battery", qty: 10 });
  const board = await makeItem({ name: "Mainboard", qty: 1 });

  const res = await agent.post(ASSET).send({
    event_type: "repaired",
    parts: [
      { item_id: battery.id, qty: 3 }, // would succeed alone
      { item_id: board.id, qty: 2 }, // exceeds stock
    ],
  });
  assert.equal(res.status, 500);
  assert.match(res.body.error, /Insufficient stock.*Mainboard/);

  // The battery decrement must have rolled back with everything else.
  assert.equal((await stockOf(battery.id)).qty_available, 10);
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM maintenance_log")).rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM inv_adjustments")).rows[0].n,
    0,
  );
});

test("a parts-free entry still works exactly as before", async () => {
  const { agent } = await adminAgent();
  const res = await agent
    .post(ASSET)
    .send({ event_type: "inspected", notes: "annual check" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.parts, []);
  assert.equal(Number(res.body.parts_cost_pkr), 0);
});

test("GET returns the parts array and per-entry parts bill", async () => {
  const { agent } = await adminAgent();
  const cable = await makeItem({ name: "Display Cable", qty: 8 });
  await agent.post(ASSET).send({
    event_type: "replaced_part",
    parts: [{ item_id: cable.id, qty: 3, unit_cost_pkr: 400 }],
  });

  const res = await agent.get(ASSET);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].parts[0].qty, 3);
  assert.equal(Number(res.body[0].parts_cost_pkr), 1200);
});

test("delete keeps parts consumed by default", async () => {
  const { agent } = await adminAgent();
  const ram = await makeItem({ name: "RAM 16GB", qty: 6 });
  const created = await agent.post(ASSET).send({
    event_type: "upgraded",
    parts: [{ item_id: ram.id, qty: 2 }],
  });

  const del = await agent.delete(`/api/maintenance/${created.body.id}`);
  assert.equal(del.status, 200);

  // Stock stays down: the RAM is inside the asset, not back on the shelf.
  assert.equal((await stockOf(ram.id)).qty_available, 4);
  // Entry is recoverable; its parts rows are gone with it (CASCADE)...
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM recycle_bin")).rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM maintenance_parts")).rows[0]
      .n,
    0,
  );
  // ...but their snapshot survives in the audit trail.
  const logged = await db.query(
    "SELECT changes FROM activity_log WHERE action='deleted' AND table_name='maintenance_log'",
  );
  assert.equal(logged.rows[0].changes.restocked, false);
  assert.equal(logged.rows[0].changes.parts[0].item_name, "RAM 16GB");
});

test("delete with ?restock=true returns parts via a compensating ledger row", async () => {
  const { agent } = await adminAgent();
  const ssd = await makeItem({ name: "SSD 512GB", qty: 5 });
  const created = await agent.post(ASSET).send({
    event_type: "replaced_part",
    parts: [{ item_id: ssd.id, qty: 2 }],
  });
  assert.equal((await stockOf(ssd.id)).qty_available, 3);

  const del = await agent.delete(
    `/api/maintenance/${created.body.id}?restock=true`,
  );
  assert.equal(del.status, 200);
  assert.equal((await stockOf(ssd.id)).qty_available, 5);

  // Both movements stay on the ledger — consumption is never erased.
  const ledger = await db.query(
    `SELECT type, qty_change FROM inv_adjustments WHERE item_id=$1 ORDER BY id`,
    [ssd.id],
  );
  assert.deepEqual(
    ledger.rows.map((r) => [r.type, r.qty_change]),
    [
      ["repair_consumption", -2],
      ["repair_restock", 2],
    ],
  );
});

test("consuming through the reorder level opens a low-stock alert", async () => {
  const { agent } = await adminAgent();
  // makeItem leaves the default reorder_level of 5.
  const charger = await makeItem({ name: "USB-C Charger", qty: 6 });

  await agent.post(ASSET).send({
    event_type: "replaced_part",
    parts: [{ item_id: charger.id, qty: 2 }],
  });

  const alerts = await db.query(
    "SELECT alert_type, is_resolved FROM inv_alerts WHERE item_id=$1",
    [charger.id],
  );
  assert.equal(alerts.rowCount, 1);
  assert.equal(alerts.rows[0].alert_type, "low_stock");
  assert.equal(alerts.rows[0].is_resolved, false);
});

test("permissions gate maintenance by the owning asset module", async () => {
  const item = await makeItem({ qty: 5 });

  const viewer = await makeUser({ email: "viewer@bykea.com", role: "viewer" });
  const viewerAgent = await loginAs(viewer);
  assert.equal(
    (await viewerAgent.post(ASSET).send({ event_type: "repaired" })).status,
    403,
  );

  const user = await makeUser({ email: "tech@bykea.com", role: "user" });
  const userAgent = await loginAs(user);
  // No systems grant yet → refused.
  assert.equal(
    (await userAgent.post(ASSET).send({ event_type: "repaired" })).status,
    403,
  );
  await grant(user.id, "systems", { create: true });
  const ok = await userAgent.post(ASSET).send({
    event_type: "repaired",
    parts: [{ item_id: item.id, qty: 1 }],
  });
  assert.equal(ok.status, 200);

  // Network devices are now a valid maintenance target...
  const admin = await adminAgent();
  assert.equal(
    (
      await admin.agent
        .post("/api/maintenance/network/1")
        .send({ event_type: "serviced" })
    ).status,
    200,
  );
  // ...while junk types are still refused.
  assert.equal(
    (
      await admin.agent
        .post("/api/maintenance/toaster/1")
        .send({ event_type: "repaired" })
    ).status,
    400,
  );
});

test("bad parts payloads are rejected before anything is written", async () => {
  const { agent } = await adminAgent();
  const item = await makeItem({ qty: 5 });

  for (const parts of [
    [{ qty: 1 }], // missing item_id
    [{ item_id: item.id, qty: 0 }],
    [{ item_id: item.id, qty: -2 }],
    [{ item_id: item.id, qty: 1.5 }],
  ]) {
    const res = await agent
      .post(ASSET)
      .send({ event_type: "repaired", parts });
    assert.equal(res.status, 400, JSON.stringify(parts));
  }
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM maintenance_log")).rows[0].n,
    0,
  );
});
