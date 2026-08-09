/**
 * Support tickets + the employee role (support-module-architecture.md Phase 1).
 * The invariants: employees reach ONLY the support module (plus their own
 * inventory requests), ticket reads are owner-or-IT, internal notes never
 * leak to requesters, and every state transition is guarded.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const setup = require("./helpers/setup");

let db, makeUser, grant, loginAs, makeEmployeeWithLogin, PASSWORD, app;
let request;

test.before(async () => {
  await setup.createTestDatabase();
  ({
    db,
    makeUser,
    grant,
    loginAs,
    makeEmployeeWithLogin,
    PASSWORD,
    app,
  } = require("./helpers/factories"));
  request = require("supertest");
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

/** An IT support agent: role 'user' with support update perms. */
async function itAgent() {
  const it = await makeUser({ email: "it@bykea.com", name: "IT Agent" });
  await grant(it.id, "support", { create: true, update: true });
  return { it, agent: await loginAs(it) };
}

const TICKET = {
  category: "hardware_fault",
  priority: "high",
  subject: "Laptop won't boot",
  description: "Black screen since this morning",
};

test("an employee files a ticket with number and department snapshot", async () => {
  const { user } = await makeEmployeeWithLogin({
    fullName: "Sana Khalid",
    department: "Growth",
  });
  const agent = await loginAs(user);

  const res = await agent.post("/api/tickets").send(TICKET);
  assert.equal(res.status, 201, res.text);
  assert.match(res.body.ticket_number, /^BYK-TICK-\d{4}-\d{4}$/);
  assert.equal(res.body.requester_department, "Growth");
  assert.equal(res.body.status, "open");

  const logged = await db.query(
    "SELECT record_label FROM activity_log WHERE action='created' AND table_name='support_tickets'",
  );
  assert.equal(logged.rows[0].record_label, res.body.ticket_number);
});

test("ticket reads are owner-or-IT: foreign tickets answer 404", async () => {
  const a = await makeEmployeeWithLogin({ fullName: "Owner A" });
  const b = await makeEmployeeWithLogin({ fullName: "Peeker B" });
  const agentA = await loginAs(a.user);
  const agentB = await loginAs(b.user);

  const created = await agentA.post("/api/tickets").send(TICKET);

  assert.equal(
    (await agentB.get(`/api/tickets/${created.body.id}`)).status,
    404,
  );
  assert.equal((await agentB.get("/api/tickets")).body.length, 0);
  assert.equal((await agentB.get("/api/tickets/queue")).status, 403);

  // IT sees it everywhere.
  const { agent: it } = await itAgent();
  assert.equal((await it.get(`/api/tickets/${created.body.id}`)).status, 200);
  assert.equal((await it.get("/api/tickets/queue")).body.length, 1);
});

test("the employee role is whitelisted to support only", async () => {
  const { user } = await makeEmployeeWithLogin();
  const agent = await loginAs(user);

  // Every other module 403s — including reads.
  for (const path of [
    "/api/systems",
    "/api/employees",
    "/api/inventory/stats",
    "/api/vendors",
    "/api/alerts/count",
    "/api/search?q=laptop",
  ]) {
    const res = await agent.get(path);
    assert.equal(res.status, 403, `${path} answered ${res.status}`);
  }
  // The one carve-out: the read-only item catalog, which the new-request
  // cart needs. GET only.
  assert.equal((await agent.get("/api/inventory/items")).status, 200);
  assert.equal(
    (await agent.post("/api/inventory/items").send({ name: "X" })).status,
    403,
  );

  // But their own inventory requests still work (requireAuth routes)...
  const item = await db.query(
    `INSERT INTO inv_items (name) VALUES ('Mouse') RETURNING id`,
  );
  await db.query(
    `INSERT INTO inv_stock (item_id, qty_available) VALUES ($1, 5)`,
    [item.rows[0].id],
  );
  const reqRes = await agent
    .post("/api/requests")
    .send({ items: [{ item_id: item.rows[0].id, qty: 1 }] });
  assert.equal(reqRes.status, 200, reqRes.text);
  assert.equal((await agent.get("/api/requests")).body.length, 1);

  // ...while the request queue and other people's requests stay closed.
  assert.equal((await agent.get("/api/requests/queue")).status, 403);
  const { agent: admin } = await adminAgent();
  const adminReq = await admin
    .post("/api/requests")
    .send({ items: [{ item_id: item.rows[0].id, qty: 1 }] });
  assert.equal(
    (await agent.get(`/api/requests/${adminReq.body.id}`)).status,
    404,
  );
});

test("internal comments exist for IT and do not exist for the requester", async () => {
  const { user } = await makeEmployeeWithLogin();
  const empAgent = await loginAs(user);
  const { agent: it } = await itAgent();

  const created = await empAgent.post("/api/tickets").send(TICKET);
  const id = created.body.id;

  await it
    .post(`/api/tickets/${id}/comments`)
    .send({ body: "User broke it again", is_internal: true });
  await it
    .post(`/api/tickets/${id}/comments`)
    .send({ body: "We are on it", is_internal: false });
  // Employee attempting an internal note gets silently coerced public.
  await empAgent
    .post(`/api/tickets/${id}/comments`)
    .send({ body: "Any update?", is_internal: true });

  const forRequester = await empAgent.get(`/api/tickets/${id}`);
  assert.deepEqual(
    forRequester.body.comments.map((c) => c.body),
    ["We are on it", "Any update?"],
  );
  const forIT = await it.get(`/api/tickets/${id}`);
  assert.equal(forIT.body.comments.length, 3);
  assert.equal(
    forIT.body.comments.find((c) => c.is_internal).body,
    "User broke it again",
  );
});

test("the lifecycle enforces its guards end to end", async () => {
  const { user } = await makeEmployeeWithLogin();
  const empAgent = await loginAs(user);
  const { it, agent: itA } = await itAgent();

  const id = (await empAgent.post("/api/tickets").send(TICKET)).body.id;

  // Requester cannot assign or resolve — owner passes the visibility gate
  // (so not 404) but fails the role gate.
  assert.equal(
    (
      await empAgent
        .post(`/api/tickets/${id}/assign`)
        .send({ assigned_to: it.id })
    ).status,
    403,
  );

  // Assign must target an IT user.
  const civilian = await makeEmployeeWithLogin({ fullName: "Not IT" });
  assert.equal(
    (
      await itA
        .post(`/api/tickets/${id}/assign`)
        .send({ assigned_to: civilian.user.id })
    ).status,
    400,
  );
  assert.equal(
    (await itA.post(`/api/tickets/${id}/assign`).send({ assigned_to: it.id }))
      .status,
    200,
  );

  // Close from in_progress is refused; resolve requires notes.
  await itA.post(`/api/tickets/${id}/start`);
  assert.equal((await itA.post(`/api/tickets/${id}/close`)).status, 400);
  assert.equal(
    (await itA.post(`/api/tickets/${id}/resolve`).send({})).status,
    400,
  );
  const resolved = await itA
    .post(`/api/tickets/${id}/resolve`)
    .send({ resolution_notes: "Replaced the charger" });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.status, "resolved");

  // Requester closes, reopens with a reason (which lands as a comment), IT re-resolves.
  assert.equal((await empAgent.post(`/api/tickets/${id}/close`)).status, 200);
  assert.equal(
    (await empAgent.post(`/api/tickets/${id}/reopen`).send({})).status,
    400,
  );
  const reopened = await empAgent
    .post(`/api/tickets/${id}/reopen`)
    .send({ reason: "Still dead after an hour" });
  assert.equal(reopened.body.status, "reopened");
  const detail = await empAgent.get(`/api/tickets/${id}`);
  assert.match(detail.body.comments.at(-1).body, /Still dead/);
  assert.equal(
    (
      await itA
        .post(`/api/tickets/${id}/resolve`)
        .send({ resolution_notes: "Board swapped" })
    ).status,
    200,
  );
});

test("a requester can cancel only before work starts", async () => {
  const { user } = await makeEmployeeWithLogin();
  const empAgent = await loginAs(user);
  const { it, agent: itA } = await itAgent();

  const t1 = (await empAgent.post("/api/tickets").send(TICKET)).body;
  assert.equal(
    (await empAgent.post(`/api/tickets/${t1.id}/cancel`)).status,
    200,
  );

  const t2 = (await empAgent.post("/api/tickets").send(TICKET)).body;
  await itA.post(`/api/tickets/${t2.id}/assign`).send({ assigned_to: it.id });
  await itA.post(`/api/tickets/${t2.id}/start`);
  assert.equal(
    (await empAgent.post(`/api/tickets/${t2.id}/cancel`)).status,
    400,
  );
  assert.equal((await itA.post(`/api/tickets/${t2.id}/cancel`)).status, 200);
});

test("ticket counts are scoped per audience", async () => {
  const a = await makeEmployeeWithLogin({ fullName: "Filer A" });
  const b = await makeEmployeeWithLogin({ fullName: "Filer B" });
  const agentA = await loginAs(a.user);
  const agentB = await loginAs(b.user);
  await agentA.post("/api/tickets").send(TICKET);
  await agentA.post("/api/tickets").send({ ...TICKET, subject: "Second" });
  await agentB.post("/api/tickets").send({ ...TICKET, subject: "Third" });

  assert.equal((await agentA.get("/api/tickets/count")).body.count, 2);
  assert.equal((await agentB.get("/api/tickets/count")).body.count, 1);
  const { agent: it } = await itAgent();
  assert.equal((await it.get("/api/tickets/count")).body.count, 3);
});

test("bulk provisioning creates employee logins exactly once", async () => {
  const { agent: admin } = await adminAgent();
  // Three employees: eligible, no email, already linked.
  await db.query(
    `INSERT INTO employees (full_name, email, designation, department, is_active)
     VALUES ('Eligible One', 'one@bykea.com', 'Rider Ops', 'Operations', true),
            ('No Email', NULL, 'Rider Ops', 'Operations', true)`,
  );
  await makeEmployeeWithLogin({ fullName: "Already Linked" });

  const res = await admin.post("/api/users/bulk-provision");
  assert.equal(res.status, 200);
  assert.equal(res.body.created.length, 1);
  const acct = res.body.created[0];
  assert.equal(acct.email, "one@bykea.com");
  assert.ok(acct.temp_password.length >= 10);

  // Stored as a hash, flagged for forced change, linked back to the employee.
  const row = await db.query(
    "SELECT password_hash, must_change_password, role FROM users WHERE email='one@bykea.com'",
  );
  assert.notEqual(row.rows[0].password_hash, acct.temp_password);
  assert.equal(row.rows[0].must_change_password, true);
  assert.equal(row.rows[0].role, "employee");

  // The temp password logs in, /me carries the flag, change-password clears it.
  const agent = request.agent(app);
  const login = await agent
    .post("/auth/login")
    .send({ username: acct.email, password: acct.temp_password });
  assert.equal(login.status, 200);
  assert.equal(login.body.must_change_password, true);
  assert.equal((await agent.get("/auth/me")).body.must_change_password, true);
  await agent
    .post("/auth/change-password")
    .send({ current_password: acct.temp_password, new_password: PASSWORD });
  assert.equal((await agent.get("/auth/me")).body.must_change_password, false);

  // Idempotent: nothing left to provision.
  const second = await admin.post("/api/users/bulk-provision");
  assert.equal(second.body.created.length, 0);

  // No plaintext password anywhere in the audit trail.
  const audit = await db.query(
    "SELECT details, changes FROM activity_log WHERE action='bulk_provisioned'",
  );
  assert.equal(audit.rowCount, 2);
  for (const r of audit.rows)
    assert.ok(!JSON.stringify(r).includes(acct.temp_password));
});

test("admins can create single employee accounts and viewers stay blocked from filing", async () => {
  const { agent: admin } = await adminAgent();
  const emp = await db.query(
    `INSERT INTO employees (full_name, email, designation, department, is_active)
     VALUES ('Single Create', 'single@bykea.com', 'Analyst', 'Finance', true) RETURNING id`,
  );
  const res = await admin.post("/api/users").send({
    employee_id: emp.rows[0].id,
    password: PASSWORD,
    role: "employee",
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.role, "employee");
  // No permission rows for employees — access is the hasPerm whitelist.
  const perms = await db.query(
    "SELECT count(*)::int n FROM user_permissions WHERE user_id=$1",
    [res.body.id],
  );
  assert.equal(perms.rows[0].n, 0);

  const viewer = await makeUser({ email: "viewer@bykea.com", role: "viewer" });
  const viewerAgent = await loginAs(viewer);
  assert.equal(
    (await viewerAgent.post("/api/tickets").send(TICKET)).status,
    403,
  );
});
