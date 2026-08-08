const test = require("node:test");
const assert = require("node:assert/strict");
const setup = require("./helpers/setup");

let makeUser, grant, loginAs, hasPerm;

test.before(async () => {
  await setup.createTestDatabase();
  ({ makeUser, grant, loginAs } = require("./helpers/factories"));
  ({ hasPerm } = require("../src/middleware/auth"));
});
test.after(async () => setup.dropTestDatabase());
test.beforeEach(async () => setup.truncateAll());

test("super_admin passes every check without any grants", async () => {
  const admin = await makeUser({ email: "sa@bykea.com", role: "super_admin" });
  for (const action of ["create", "read", "update", "delete"]) {
    assert.equal(
      await hasPerm(admin, "systems", action),
      true,
      `super_admin should pass ${action}`,
    );
  }
});

test("viewer may read but never write, even with grants in the table", async () => {
  const viewer = await makeUser({ email: "v@bykea.com", role: "viewer" });
  // Deliberately grant everything: role must still win over the row.
  await grant(viewer.id, "systems", {
    create: true,
    update: true,
    delete: true,
  });

  assert.equal(await hasPerm(viewer, "systems", "read"), true);
  for (const action of ["create", "update", "delete"]) {
    assert.equal(
      await hasPerm(viewer, "systems", action),
      false,
      `viewer must not ${action} regardless of user_permissions`,
    );
  }
});

test("a user gets exactly the actions granted, per module", async () => {
  const user = await makeUser({ email: "u@bykea.com", role: "user" });
  await grant(user.id, "systems", { create: true, update: true });

  assert.equal(await hasPerm(user, "systems", "create"), true);
  assert.equal(await hasPerm(user, "systems", "update"), true);
  assert.equal(await hasPerm(user, "systems", "delete"), false);
  // A grant on one module must not leak to another.
  assert.equal(await hasPerm(user, "mobiles", "create"), false);
});

test("a user with no row at all is denied writes but allowed reads", async () => {
  const user = await makeUser({ email: "bare@bykea.com", role: "user" });
  assert.equal(await hasPerm(user, "systems", "read"), true);
  assert.equal(await hasPerm(user, "systems", "delete"), false);
});

test("hasPerm is false for an absent user rather than throwing", async () => {
  assert.equal(await hasPerm(null, "systems", "read"), false);
  assert.equal(await hasPerm(undefined, "systems", "delete"), false);
});

test("perm() middleware blocks a viewer's write at the HTTP layer", async () => {
  const viewer = await makeUser({ email: "vhttp@bykea.com", role: "viewer" });
  const agent = await loginAs(viewer);

  const res = await agent.post("/api/vendors").send({ name: "Nope" });
  assert.equal(res.status, 403);
  assert.match(res.body.error, /permission denied/i);
});

test("perm() middleware lets a granted user through", async () => {
  const user = await makeUser({ email: "ok2@bykea.com", role: "user" });
  await grant(user.id, "vendors", { create: true });
  const agent = await loginAs(user);

  const res = await agent.post("/api/vendors").send({ name: "Allowed Vendor" });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, "Allowed Vendor");
});
