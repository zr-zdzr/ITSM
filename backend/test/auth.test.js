const test = require("node:test");
const assert = require("node:assert/strict");
const setup = require("./helpers/setup");
const request = require("supertest");

let app, db, makeUser, loginAs;

test.before(async () => {
  await setup.createTestDatabase();
  ({ app, db, makeUser, loginAs } = require("./helpers/factories"));
});
test.after(async () => setup.dropTestDatabase());
test.beforeEach(async () => setup.truncateAll());

test("rejects a wrong password with 401 and logs login_failed", async () => {
  const user = await makeUser({ email: "wrong@bykea.com" });
  const res = await request(app)
    .post("/auth/login")
    .send({ username: user.email, password: "not-the-password" });

  assert.equal(res.status, 401);
  // The message must not reveal whether the account exists.
  assert.match(res.body.error, /invalid username or password/i);

  const { rows } = await db.query(
    "SELECT action FROM activity_log WHERE record_label = $1",
    [user.email],
  );
  assert.deepEqual(
    rows.map((r) => r.action),
    ["login_failed"],
  );
});

test("gives the same 401 for an account that does not exist", async () => {
  const res = await request(app)
    .post("/auth/login")
    .send({ username: "ghost@bykea.com", password: "anything" });

  assert.equal(res.status, 401);
  assert.match(res.body.error, /invalid username or password/i);
});

test("refuses a deactivated account even with the right password", async () => {
  const user = await makeUser({ email: "gone@bykea.com", isActive: false });
  const res = await request(app)
    .post("/auth/login")
    .send({ username: user.email, password: require("./helpers/factories").PASSWORD });

  assert.equal(res.status, 403);
  const { rows } = await db.query(
    "SELECT action FROM activity_log WHERE record_label = $1",
    [user.email],
  );
  assert.deepEqual(
    rows.map((r) => r.action),
    ["login_blocked"],
  );
});

test("accepts valid credentials, logs the login and stamps last_login", async () => {
  const user = await makeUser({ email: "ok@bykea.com", name: "Valid User" });
  const agent = await loginAs(user);

  const me = await agent.get("/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.email, user.email);

  const { rows } = await db.query(
    "SELECT action, user_label FROM activity_log WHERE record_label = $1",
    [user.email],
  );
  assert.deepEqual(
    rows.map((r) => r.action),
    ["login"],
  );
  // The actor label is captured at write time, not joined at read time.
  assert.equal(rows[0].user_label, "Valid User");

  const stamped = await db.query(
    "SELECT last_login FROM users WHERE id = $1",
    [user.id],
  );
  assert.ok(stamped.rows[0].last_login, "last_login should be set");
});

test("an unauthenticated request to a protected route is 401, not 200", async () => {
  const res = await request(app).get("/api/systems");
  assert.equal(res.status, 401);
});

test("the session cookie is HttpOnly and not Secure over plain HTTP", async () => {
  const user = await makeUser({ email: "cookie@bykea.com" });
  const res = await request(app)
    .post("/auth/login")
    .send({ username: user.email, password: require("./helpers/factories").PASSWORD });

  const cookie = (res.headers["set-cookie"] || []).join(";");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  // `secure: "auto"` must NOT mark it Secure on an http request, or every
  // login over the LAN would silently fail to persist a session.
  assert.doesNotMatch(cookie, /;\s*Secure/i);
});

test("logout clears the session", async () => {
  const user = await makeUser({ email: "bye@bykea.com" });
  const agent = await loginAs(user);
  assert.equal((await agent.get("/auth/me")).status, 200);

  await agent.post("/auth/logout");
  assert.equal((await agent.get("/auth/me")).status, 401);
});
