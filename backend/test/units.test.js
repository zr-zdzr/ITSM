/**
 * Serialized units + bins (Phase 2 of docs/spare-parts-architecture.md).
 * Invariant under test: for a serialized item, qty_available === count of
 * 'in_stock' units and qty_damaged === count of 'faulty' units, with every
 * movement recorded in inv_adjustments.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const setup = require("./helpers/setup");

let db, makeUser, grant, loginAs, makeItem, makeEmployee, stockOf;

test.before(async () => {
  await setup.createTestDatabase();
  ({
    db,
    makeUser,
    grant,
    loginAs,
    makeItem,
    makeEmployee,
    stockOf,
  } = require("./helpers/factories"));
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

async function makeSerializedItem(agent, name = "LCD Panel") {
  const res = await agent.post("/api/inventory/items").send({
    name,
    tracking_type: "serialized",
    reorder_level: 2,
  });
  assert.equal(res.status, 200, res.text);
  return res.body;
}

test("bins: create, duplicate code rejected, list shows unit counts", async () => {
  const { agent } = await adminAgent();
  const bin = await agent
    .post("/api/inventory/bins")
    .send({ code: "R2-S4", location: "Store Room" });
  assert.equal(bin.status, 201);

  assert.equal(
    (await agent.post("/api/inventory/bins").send({ code: "R2-S4" })).status,
    409,
  );

  const item = await makeSerializedItem(agent);
  await agent
    .post(`/api/inventory/items/${item.id}/units`)
    .send({ serials: ["SN-1", "SN-2"], bin_id: bin.body.id });

  const list = await agent.get("/api/inventory/bins");
  assert.equal(list.body.length, 1);
  assert.equal(Number(list.body[0].units_in_stock), 2);
});

test("adding units raises stock through per-unit ledger rows", async () => {
  const { agent } = await adminAgent();
  const item = await makeSerializedItem(agent);

  const res = await agent
    .post(`/api/inventory/items/${item.id}/units`)
    .send({ serials: ["A-001", "A-002", "A-003"], cost_pkr: 8500 });
  assert.equal(res.status, 201);
  assert.equal(res.body.length, 3);

  assert.equal((await stockOf(item.id)).qty_available, 3);

  const ledger = await db.query(
    `SELECT type, qty_change, reference_type FROM inv_adjustments
      WHERE item_id=$1 AND reference_type='inv_units'`,
    [item.id],
  );
  assert.equal(ledger.rowCount, 3);
  assert.ok(
    ledger.rows.every((r) => r.type === "purchase" && r.qty_change === 1),
  );

  // Same serial again on the same item is refused, batch untouched.
  const dup = await agent
    .post(`/api/inventory/items/${item.id}/units`)
    .send({ serials: ["A-003", "A-004"] });
  assert.equal(dup.status, 409);
  assert.equal((await stockOf(item.id)).qty_available, 3);
});

test("units can only be added to serialized items", async () => {
  const { agent } = await adminAgent();
  const bulk = await makeItem({ name: "Cable", qty: 5 }); // quantity_returnable
  const res = await agent
    .post(`/api/inventory/items/${bulk.id}/units`)
    .send({ serials: ["X-1"] });
  assert.equal(res.status, 400);
});

test("status transitions keep the stock counters in sync", async () => {
  const { agent } = await adminAgent();
  const item = await makeSerializedItem(agent);
  const units = (
    await agent
      .post(`/api/inventory/items/${item.id}/units`)
      .send({ serials: ["B-1", "B-2", "B-3"] })
  ).body;

  // in_stock → faulty: available down, damaged up, 'damaged' ledger row.
  const toFaulty = await agent
    .put(`/api/inventory/units/${units[0].id}`)
    .send({ status: "faulty" });
  assert.equal(toFaulty.status, 200);
  assert.deepEqual(await stockOf(item.id), {
    qty_available: 2,
    qty_assigned: 0,
    qty_damaged: 1,
  });

  // faulty → in_stock: both counters reverse.
  await agent
    .put(`/api/inventory/units/${units[0].id}`)
    .send({ status: "in_stock" });
  assert.deepEqual(await stockOf(item.id), {
    qty_available: 3,
    qty_assigned: 0,
    qty_damaged: 0,
  });

  const ledger = await db.query(
    `SELECT type, qty_change FROM inv_adjustments
      WHERE item_id=$1 AND reference_type='inv_units' AND type != 'purchase'
      ORDER BY id`,
    [item.id],
  );
  assert.deepEqual(
    ledger.rows.map((r) => [r.type, r.qty_change]),
    [
      ["damaged", -1],
      ["return_to_stock", 1],
    ],
  );

  // 'installed' cannot be set by hand.
  assert.equal(
    (
      await agent
        .put(`/api/inventory/units/${units[1].id}`)
        .send({ status: "installed" })
    ).status,
    400,
  );
});

test("draining units below the reorder level opens a low-stock alert", async () => {
  const { agent } = await adminAgent();
  const item = await makeSerializedItem(agent); // reorder_level 2
  const units = (
    await agent
      .post(`/api/inventory/items/${item.id}/units`)
      .send({ serials: ["C-1", "C-2", "C-3"] })
  ).body;

  await agent
    .put(`/api/inventory/units/${units[0].id}`)
    .send({ status: "scrapped" });

  const alerts = await db.query(
    "SELECT alert_type FROM inv_alerts WHERE item_id=$1 AND is_resolved=false",
    [item.id],
  );
  assert.equal(alerts.rowCount, 1);
  assert.equal(alerts.rows[0].alert_type, "low_stock");
});

test("moving between alert bands retires the other band's alert", async () => {
  const { agent } = await adminAgent();
  // A serialized item starts at qty 0 → out_of_stock alert opens.
  const item = await makeSerializedItem(agent);
  let open = await db.query(
    "SELECT alert_type FROM inv_alerts WHERE item_id=$1 AND is_resolved=false",
    [item.id],
  );
  assert.deepEqual(
    open.rows.map((r) => r.alert_type),
    ["out_of_stock"],
  );

  // Adding units (2 <= reorder_level 2) moves it to low_stock — exactly one
  // open alert must remain, not both.
  await agent
    .post(`/api/inventory/items/${item.id}/units`)
    .send({ serials: ["F-1", "F-2"] });
  open = await db.query(
    "SELECT alert_type FROM inv_alerts WHERE item_id=$1 AND is_resolved=false",
    [item.id],
  );
  assert.deepEqual(
    open.rows.map((r) => r.alert_type),
    ["low_stock"],
  );

  // Fully restocked → nothing open.
  await agent
    .post(`/api/inventory/items/${item.id}/units`)
    .send({ serials: ["F-3", "F-4", "F-5"] });
  open = await db.query(
    "SELECT count(*)::int n FROM inv_alerts WHERE item_id=$1 AND is_resolved=false",
    [item.id],
  );
  assert.equal(open.rows[0].n, 0);
});

test("serialized items are locked out of raw adjustments, assignments and requests", async () => {
  const { agent } = await adminAgent();
  const item = await makeSerializedItem(agent);
  await agent
    .post(`/api/inventory/items/${item.id}/units`)
    .send({ serials: ["D-1", "D-2"] });

  const adjust = await agent
    .post(`/api/inventory/items/${item.id}/adjust`)
    .send({ type: "correction", qty_change: 5 });
  assert.equal(adjust.status, 400);
  assert.match(adjust.body.error, /serialized/);

  const emp = await makeEmployee({ fullName: "Unit Holder" });
  const assign = await agent.post("/api/assignments/direct").send({
    assignee_id: emp.id,
    items: [{ item_id: item.id, qty: 1 }],
  });
  assert.equal(assign.status, 500);
  assert.match(assign.body.error, /serialized/);
  assert.equal((await stockOf(item.id)).qty_available, 2);
});

test("a repair consumes a serialized unit by serial and installs it", async () => {
  const { agent } = await adminAgent();
  const item = await makeSerializedItem(agent);
  await agent
    .post(`/api/inventory/items/${item.id}/units`)
    .send({ serials: ["E-1", "E-2"], cost_pkr: 9000 });

  // Serial is mandatory for serialized parts.
  const noSerial = await agent.post("/api/maintenance/system/1").send({
    event_type: "replaced_part",
    parts: [{ item_id: item.id, qty: 1 }],
  });
  assert.equal(noSerial.status, 400);
  assert.match(noSerial.body.error, /serial/i);

  const res = await agent.post("/api/maintenance/system/1").send({
    event_type: "replaced_part",
    parts: [{ item_id: item.id, qty: 1, serial_no: "E-1" }],
  });
  assert.equal(res.status, 200, res.text);
  // Unit cost snapshot falls back to the unit's own cost.
  assert.equal(Number(res.body.parts_cost_pkr), 9000);

  const unit = await db.query(
    `SELECT status, installed_asset_type, installed_asset_id, maintenance_part_id
       FROM inv_units WHERE serial_no='E-1'`,
  );
  assert.equal(unit.rows[0].status, "installed");
  assert.equal(unit.rows[0].installed_asset_type, "system");
  assert.equal(unit.rows[0].installed_asset_id, 1);
  assert.ok(unit.rows[0].maintenance_part_id);
  assert.equal((await stockOf(item.id)).qty_available, 1);

  // A consumed unit cannot be consumed again.
  const again = await agent.post("/api/maintenance/system/1").send({
    event_type: "replaced_part",
    parts: [{ item_id: item.id, qty: 1, serial_no: "E-1" }],
  });
  assert.equal(again.status, 400);
  assert.match(again.body.error, /No in-stock unit/);

  // Deleting the repair with restock puts the unit back on the shelf.
  const del = await agent.delete(
    `/api/maintenance/${res.body.id}?restock=true`,
  );
  assert.equal(del.status, 200);
  const back = await db.query(
    "SELECT status, installed_asset_id, maintenance_part_id FROM inv_units WHERE serial_no='E-1'",
  );
  assert.equal(back.rows[0].status, "in_stock");
  assert.equal(back.rows[0].installed_asset_id, null);
  assert.equal(back.rows[0].maintenance_part_id, null);
  assert.equal((await stockOf(item.id)).qty_available, 2);
});

test("unit detail resolves item and bin for QR lookups", async () => {
  const { agent } = await adminAgent();
  const bin = (
    await agent
      .post("/api/inventory/bins")
      .send({ code: "A1-B2", location: "HQ Store" })
  ).body;
  const item = await makeSerializedItem(agent, "SSD 1TB");
  const [unit] = (
    await agent
      .post(`/api/inventory/items/${item.id}/units`)
      .send({ serials: ["QR-1"], bin_id: bin.id })
  ).body;

  const res = await agent.get(`/api/inventory/units/${unit.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.item_name, "SSD 1TB");
  assert.equal(res.body.bin_code, "A1-B2");
  assert.equal(res.body.serial_no, "QR-1");

  assert.equal((await agent.get("/api/inventory/units/99999")).status, 404);
});

test("bins and units respect inventory permissions", async () => {
  const { agent: admin } = await adminAgent();
  const item = await makeSerializedItem(admin);

  const viewer = await makeUser({ email: "viewer@bykea.com", role: "viewer" });
  const viewerAgent = await loginAs(viewer);
  assert.equal(
    (await viewerAgent.post("/api/inventory/bins").send({ code: "V-1" }))
      .status,
    403,
  );
  assert.equal(
    (
      await viewerAgent
        .post(`/api/inventory/items/${item.id}/units`)
        .send({ serials: ["V-1"] })
    ).status,
    403,
  );
  // Reads are open to authenticated users.
  assert.equal((await viewerAgent.get("/api/inventory/bins")).status, 200);

  const user = await makeUser({ email: "store@bykea.com", role: "user" });
  await grant(user.id, "inventory", { create: true, update: true });
  const userAgent = await loginAs(user);
  assert.equal(
    (await userAgent.post("/api/inventory/bins").send({ code: "U-1" })).status,
    201,
  );
});
