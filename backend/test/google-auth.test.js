/**
 * Google Workspace SSO (support-module-architecture.md §6).
 *
 * Two things under test: the profile handler that turns a verified Google
 * identity into a user row (domain gate, linking, auto-provisioning), and
 * the mode switch — with GOOGLE_CLIENT_ID/SECRET set, local passwords stop
 * working for everyone except the break-glass admin.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const setup = require("./helpers/setup");

let db, makeUser, loginAs, makeEmployee, PASSWORD;
let handleGoogleProfile;

test.before(async () => {
  await setup.createTestDatabase();
  ({
    db,
    makeUser,
    loginAs,
    makeEmployee,
    PASSWORD,
  } = require("./helpers/factories"));
  ({ handleGoogleProfile } = require("../src/utils/googleAuth"));
});
test.after(async () => setup.dropTestDatabase());
test.beforeEach(async () => {
  await setup.truncateAll();
});
// Files share one process under --test-concurrency=1, so a leaked
// GOOGLE_CLIENT_ID would flip every later test file into SSO mode.
test.afterEach(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

function profile({ id = "g-123", email, verified = true, name = "G User" }) {
  return {
    id,
    displayName: name,
    emails: [{ value: email, verified }],
    photos: [{ value: "https://lh3.example/photo.jpg" }],
  };
}

function enableSSO() {
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
}

// ── Profile handling ──────────────────────────────────────

test("only the allowed domain may sign in — the server-side gate", async () => {
  await assert.rejects(
    handleGoogleProfile(profile({ email: "attacker@gmail.com" })),
    /Only @bykea\.com/,
  );
  await assert.rejects(
    handleGoogleProfile(profile({ email: "spoof@bykea.com.evil.co" })),
    /Only @bykea\.com/,
  );
  await assert.rejects(
    handleGoogleProfile(
      profile({ email: "unverified@bykea.com", verified: false }),
    ),
    /verified email/,
  );
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM users")).rows[0].n,
    0,
  );
});

test("an existing account links its Google identity by email", async () => {
  const user = await makeUser({
    email: "linked@bykea.com",
    name: "Linked Staff",
    role: "user",
  });
  await db.query("UPDATE users SET must_change_password=true WHERE id=$1", [
    user.id,
  ]);

  const result = await handleGoogleProfile(
    profile({ id: "g-link-1", email: "Linked@Bykea.com" }),
  );
  assert.equal(result.id, user.id);
  assert.equal(result.role, "user"); // role untouched by linking

  const row = await db.query(
    "SELECT google_id, must_change_password FROM users WHERE id=$1",
    [user.id],
  );
  assert.equal(row.rows[0].google_id, "g-link-1");
  // The temp-password flag is meaningless under SSO and must not trap them.
  assert.equal(row.rows[0].must_change_password, false);

  // Second sign-in matches by google_id directly.
  const again = await handleGoogleProfile(
    profile({ id: "g-link-1", email: "linked@bykea.com" }),
  );
  assert.equal(again.id, user.id);
});

test("first sign-in auto-provisions an employee-role account linked to the employee row", async () => {
  const emp = await makeEmployee({
    fullName: "Fresh Face",
    department: "Growth",
  });
  await db.query("UPDATE employees SET email=$1 WHERE id=$2", [
    "fresh.face@bykea.com",
    emp.id,
  ]);

  const user = await handleGoogleProfile(
    profile({ id: "g-new-1", email: "fresh.face@bykea.com" }),
  );
  assert.equal(user.role, "employee");
  assert.equal(user.name, "Fresh Face"); // employee record wins over Google display name
  assert.equal(user.department, "Growth");
  assert.equal(user.password_hash, null); // passwordless by construction

  const linked = await db.query(
    "SELECT portal_user_id FROM employees WHERE id=$1",
    [emp.id],
  );
  assert.equal(linked.rows[0].portal_user_id, user.id);

  const logged = await db.query(
    "SELECT details FROM activity_log WHERE action='created' AND table_name='users'",
  );
  assert.match(logged.rows[0].details, /Auto-provisioned via Google SSO/);
});

test("a deactivated account cannot sign in with Google", async () => {
  const user = await makeUser({
    email: "gone@bykea.com",
    isActive: false,
  });
  await db.query("UPDATE users SET google_id='g-gone' WHERE id=$1", [user.id]);
  await assert.rejects(
    handleGoogleProfile(profile({ id: "g-gone", email: "gone@bykea.com" })),
    /deactivated/,
  );
});

// ── Mode switch ───────────────────────────────────────────

test("with SSO enabled, local passwords work only for the break-glass admin", async () => {
  const request = require("supertest");
  const { app } = require("./helpers/factories");

  const staff = await makeUser({ email: "staff@bykea.com", role: "user" });
  // ADMIN_USERNAME defaults to 'admin'; make the break-glass account.
  const admin = await makeUser({
    email: "admin",
    name: "Break Glass",
    role: "super_admin",
  });

  // Dormant: both log in fine.
  await loginAs(staff);
  await loginAs(admin);

  enableSSO();
  // Staff password login refused with a pointer to Google…
  const refused = await request(app)
    .post("/auth/login")
    .send({ username: "staff@bykea.com", password: PASSWORD });
  assert.equal(refused.status, 403);
  assert.match(refused.body.error, /Google/);
  // …while the break-glass admin still gets in.
  const ok = await request(app)
    .post("/auth/login")
    .send({ username: "admin", password: PASSWORD });
  assert.equal(ok.status, 200);
});

test("with SSO enabled, password management endpoints shut down", async () => {
  const staff = await makeUser({ email: "worker@bykea.com", role: "user" });
  const staffAgent = await loginAs(staff);
  const admin = await makeUser({
    email: "root@bykea.com",
    role: "super_admin",
  });
  const adminAgent = await loginAs(admin);

  enableSSO();
  assert.equal(
    (
      await staffAgent
        .post("/auth/change-password")
        .send({ current_password: PASSWORD, new_password: "newpass123" })
    ).status,
    400,
  );
  assert.equal(
    (
      await adminAgent
        .patch(`/api/users/${staff.id}/password`)
        .send({ new_password: "newpass123" })
    ).status,
    400,
  );
});

test("with SSO enabled, provisioning creates passwordless accounts", async () => {
  const admin = await makeUser({
    email: "boss@bykea.com",
    role: "super_admin",
  });
  const agent = await loginAs(admin);
  await db.query(
    `INSERT INTO employees (full_name, email, designation, department, is_active)
     VALUES ('SSO Hire', 'sso.hire@bykea.com', 'Analyst', 'Finance', true)`,
  );

  enableSSO();
  const res = await agent.post("/api/users/bulk-provision");
  assert.equal(res.status, 200);
  assert.equal(res.body.created.length, 1);
  assert.equal(res.body.created[0].temp_password, undefined);

  const row = await db.query(
    "SELECT password_hash, must_change_password, role FROM users WHERE email='sso.hire@bykea.com'",
  );
  assert.equal(row.rows[0].password_hash, null);
  assert.equal(row.rows[0].must_change_password, false);
  assert.equal(row.rows[0].role, "employee");

  // Single-create also goes passwordless.
  const emp2 = await db.query(
    `INSERT INTO employees (full_name, email, designation, department, is_active)
     VALUES ('Solo Hire', 'solo.hire@bykea.com', 'Analyst', 'Finance', true) RETURNING id`,
  );
  const single = await agent
    .post("/api/users")
    .send({ employee_id: emp2.rows[0].id, role: "employee" });
  assert.equal(single.status, 201, single.text);
});

test("/auth/config reports the active mode", async () => {
  const request = require("supertest");
  const { app } = require("./helpers/factories");
  let res = await request(app).get("/auth/config");
  assert.deepEqual(res.body, { google: false, domain: "bykea.com" });
  enableSSO();
  res = await request(app).get("/auth/config");
  assert.equal(res.body.google, true);
});
