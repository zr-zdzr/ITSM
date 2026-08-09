/**
 * Inventory assignment and return flows — the stock ledger must stay
 * consistent through assign → return, including the failure paths.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const setup = require("./helpers/setup");

let db, makeUser, grant, loginAs, makeEmployee, makeItem, stockOf;

test.before(async () => {
  await setup.createTestDatabase();
  ({ db, makeUser, grant, loginAs, makeEmployee, makeItem, stockOf } =
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

async function directAssign(agent, employee, item, qty) {
  return agent.post("/api/assignments/direct").send({
    assignee_id: employee.id,
    items: [{ item_id: item.id, qty }],
  });
}

test("a direct assignment moves stock from available to assigned", async () => {
  const { agent } = await adminAgent();
  const emp = await makeEmployee();
  const item = await makeItem({ qty: 10 });

  const res = await directAssign(agent, emp, item, 3);
  assert.equal(res.status, 200);
  assert.match(res.body.asn_number, /^ASN-\d{4}-\d{4}$/);
  assert.equal(res.body.status, "active");

  assert.deepEqual(await stockOf(item.id), {
    qty_available: 7,
    qty_assigned: 3,
    qty_damaged: 0,
  });

  // The movement is double-booked into the adjustment ledger…
  const adj = await db.query(
    "SELECT type, qty_change FROM inv_adjustments WHERE item_id=$1",
    [item.id],
  );
  assert.equal(adj.rows[0].type, "assignment");
  assert.equal(adj.rows[0].qty_change, -3);

  // …and into the activity log under the ASN number.
  const logged = await db.query(
    "SELECT record_label FROM activity_log WHERE action='ASSIGN'",
  );
  assert.equal(logged.rows[0].record_label, res.body.asn_number);
});

test("insufficient stock rejects the whole assignment atomically", async () => {
  const { agent } = await adminAgent();
  const emp = await makeEmployee();
  const scarce = await makeItem({ name: "Dock", qty: 1 });
  const plenty = await makeItem({ name: "Mouse", qty: 10 });

  const res = await agent.post("/api/assignments/direct").send({
    assignee_id: emp.id,
    items: [
      { item_id: plenty.id, qty: 5 },
      { item_id: scarce.id, qty: 2 },
    ],
  });
  assert.equal(res.status, 500);
  assert.match(res.body.error, /Insufficient stock.*Dock/);

  // The first item's decrement must have been rolled back with the rest.
  assert.equal((await stockOf(plenty.id)).qty_available, 10);
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM inv_assignments")).rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM inv_adjustments")).rows[0].n,
    0,
  );
});

test("assigning needs the inventory update permission", async () => {
  const emp = await makeEmployee();
  const item = await makeItem();

  const viewer = await makeUser({ email: "viewer@bykea.com", role: "viewer" });
  assert.equal(
    (await directAssign(await loginAs(viewer), emp, item, 1)).status,
    403,
  );

  const user = await makeUser({ email: "storekeeper@bykea.com", role: "user" });
  await grant(user.id, "inventory", { update: true });
  assert.equal(
    (await directAssign(await loginAs(user), emp, item, 1)).status,
    200,
  );
});

test("a full return in good condition restores stock and closes the assignment", async () => {
  const { agent } = await adminAgent();
  const emp = await makeEmployee();
  const item = await makeItem({ qty: 10 });
  const asn = (await directAssign(agent, emp, item, 3)).body;

  const ai = await db.query(
    "SELECT id FROM inv_assignment_items WHERE assignment_id=$1",
    [asn.id],
  );
  const res = await agent.post(`/api/assignments/${asn.id}/return`).send({
    returned_by: emp.id,
    items: [{ assignment_item_id: ai.rows[0].id, qty: 3, condition: "good" }],
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.assignment_status, "fully_returned");
  assert.match(res.body.return.ret_number, /^RET-\d{4}-\d{4}$/);

  assert.deepEqual(await stockOf(item.id), {
    qty_available: 10,
    qty_assigned: 0,
    qty_damaged: 0,
  });

  const logged = await db.query(
    "SELECT details FROM activity_log WHERE action='RETURN'",
  );
  assert.match(logged.rows[0].details, /fully_returned/);
});

test("returning one of two items leaves the assignment partially returned", async () => {
  const { agent } = await adminAgent();
  const emp = await makeEmployee();
  const cable = await makeItem({ name: "Cable", qty: 10 });
  const headset = await makeItem({ name: "Headset", qty: 10 });

  const asn = (
    await agent.post("/api/assignments/direct").send({
      assignee_id: emp.id,
      items: [
        { item_id: cable.id, qty: 2 },
        { item_id: headset.id, qty: 1 },
      ],
    })
  ).body;

  const ai = await db.query(
    "SELECT id, item_id FROM inv_assignment_items WHERE assignment_id=$1 ORDER BY id",
    [asn.id],
  );
  const cableItem = ai.rows.find((r) => r.item_id === cable.id);

  const res = await agent.post(`/api/assignments/${asn.id}/return`).send({
    returned_by: emp.id,
    items: [{ assignment_item_id: cableItem.id, qty: 2, condition: "good" }],
  });
  assert.equal(res.body.assignment_status, "partially_returned");
  assert.equal((await stockOf(cable.id)).qty_available, 10);
  assert.equal((await stockOf(headset.id)).qty_assigned, 1);
});

test("a damaged return books to damaged stock, not back to available", async () => {
  const { agent } = await adminAgent();
  const emp = await makeEmployee();
  const item = await makeItem({ qty: 10 });
  const asn = (await directAssign(agent, emp, item, 2)).body;

  const ai = await db.query(
    "SELECT id FROM inv_assignment_items WHERE assignment_id=$1",
    [asn.id],
  );
  const res = await agent.post(`/api/assignments/${asn.id}/return`).send({
    returned_by: emp.id,
    items: [{ assignment_item_id: ai.rows[0].id, qty: 2, condition: "damaged" }],
  });
  assert.equal(res.status, 200);

  assert.deepEqual(await stockOf(item.id), {
    qty_available: 8,
    qty_assigned: 0,
    qty_damaged: 2,
  });

  const ret = await db.query("SELECT back_to_stock FROM inv_return_items");
  assert.equal(ret.rows[0].back_to_stock, false);
});

test("fully returned assignments drop out of the default list but stats keep them", async () => {
  const { agent } = await adminAgent();
  const emp = await makeEmployee();
  const item = await makeItem({ qty: 10 });
  const asn = (await directAssign(agent, emp, item, 1)).body;

  const ai = await db.query(
    "SELECT id FROM inv_assignment_items WHERE assignment_id=$1",
    [asn.id],
  );
  await agent.post(`/api/assignments/${asn.id}/return`).send({
    returned_by: emp.id,
    items: [{ assignment_item_id: ai.rows[0].id, qty: 1, condition: "good" }],
  });

  assert.equal((await agent.get("/api/assignments")).body.length, 0);
  const stats = (await agent.get("/api/assignments/stats")).body;
  assert.equal(Number(stats.fully_returned), 1);
  assert.equal(Number(stats.total), 1);

  // The single-assignment view still shows the item trail.
  const detail = await agent.get(`/api/assignments/${asn.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.items.length, 1);
  assert.equal(detail.body.items[0].status, "returned");
});
