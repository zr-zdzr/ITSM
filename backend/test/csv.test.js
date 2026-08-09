/**
 * CSV import/export, using the systems module as the representative — every
 * asset module shares the same csv-parse/upsert/csv-stringify pattern.
 */
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

function importCsv(agent, csv) {
  return agent
    .post("/api/systems/import/csv")
    .attach("file", Buffer.from(csv), "systems.csv");
}

const HEADER = "asset_tag,type,manufacturer,model,serial_number,status";

test("import inserts new rows and reports the split", async () => {
  const { agent } = await adminAgent();
  const res = await importCsv(
    agent,
    `${HEADER}
IT-SYS-9001,Laptop,Dell,Latitude 5540,SN-CSV-001,available
IT-SYS-9002,PC,Lenovo,ThinkCentre,SN-CSV-002,in use`,
  );
  assert.equal(res.status, 200);
  assert.deepEqual(
    { inserted: res.body.inserted, updated: res.body.updated, skipped: res.body.skipped },
    { inserted: 2, updated: 0, skipped: 0 },
  );

  const { rows } = await db.query(
    "SELECT asset_tag, status FROM systems ORDER BY asset_tag",
  );
  assert.equal(rows.length, 2);
  // "in use" is normalised to the canonical enum value.
  assert.equal(rows[1].status, "in_use");

  const logged = await db.query(
    "SELECT details FROM activity_log WHERE action='imported'",
  );
  assert.match(logged.rows[0].details, /2 new, updated 0/);
});

test("re-importing matches by asset tag and updates instead of duplicating", async () => {
  const { agent } = await adminAgent();
  await importCsv(
    agent,
    `${HEADER}
IT-SYS-9001,Laptop,Dell,Latitude 5540,SN-CSV-001,available`,
  );
  const res = await importCsv(
    agent,
    `${HEADER}
IT-SYS-9001,Laptop,Dell,Latitude 5550,SN-CSV-001,repair`,
  );
  assert.deepEqual(
    { inserted: res.body.inserted, updated: res.body.updated },
    { inserted: 0, updated: 1 },
  );

  const { rows } = await db.query("SELECT model, status FROM systems");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].model, "Latitude 5550");
  assert.equal(rows[0].status, "repair");
});

test("a tagless row still matches an existing record by make+model+serial", async () => {
  const { agent } = await adminAgent();
  await importCsv(
    agent,
    `${HEADER}
IT-SYS-9001,Laptop,Dell,Latitude 5540,SN-CSV-001,available`,
  );
  const res = await importCsv(
    agent,
    `${HEADER}
,Laptop,Dell,Latitude 5540,SN-CSV-001,repair`,
  );
  assert.deepEqual(
    { inserted: res.body.inserted, updated: res.body.updated },
    { inserted: 0, updated: 1 },
  );
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM systems")).rows[0].n,
    1,
  );
});

test("a bad row is skipped with an error while good rows still land", async () => {
  const { agent } = await adminAgent();
  await importCsv(
    agent,
    `${HEADER}
IT-SYS-9001,Laptop,Dell,Latitude 5540,SN-CSV-001,available`,
  );
  // Second row reuses SN-CSV-001 under a new tag and different model, so it is
  // an insert that violates the serial's UNIQUE constraint.
  const res = await importCsv(
    agent,
    `${HEADER}
IT-SYS-9002,PC,Lenovo,ThinkCentre,SN-CSV-002,available
IT-SYS-9003,PC,HP,EliteDesk,SN-CSV-001,available`,
  );
  assert.deepEqual(
    { inserted: res.body.inserted, skipped: res.body.skipped },
    { inserted: 1, skipped: 1 },
  );
  assert.equal(res.body.errors.length, 1);
  assert.match(res.body.errors[0], /IT-SYS-9003/);
});

test("import requires the create permission and a file", async () => {
  const { agent } = await adminAgent();
  const noFile = await agent.post("/api/systems/import/csv");
  assert.equal(noFile.status, 400);

  const viewer = await makeUser({ email: "viewer@bykea.com", role: "viewer" });
  const viewerAgent = await loginAs(viewer);
  const res = await importCsv(viewerAgent, `${HEADER}\nX,Laptop,D,M,SN-X,available`);
  assert.equal(res.status, 403);

  const user = await makeUser({ email: "importer@bykea.com", role: "user" });
  await grant(user.id, "systems", { create: true });
  const userAgent = await loginAs(user);
  const ok = await importCsv(
    userAgent,
    `${HEADER}\nIT-SYS-9009,Laptop,Dell,XPS,SN-CSV-009,available`,
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.body.inserted, 1);
});

test("export round-trips what import created", async () => {
  const { agent } = await adminAgent();
  await importCsv(
    agent,
    `${HEADER}
IT-SYS-9001,Laptop,Dell,Latitude 5540,SN-CSV-001,available`,
  );

  const res = await agent.get("/api/systems/export/csv");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/csv/);
  const text = res.text || res.body.toString();
  assert.match(text, /asset_tag/); // header row
  assert.match(text, /IT-SYS-9001/);
  assert.match(text, /SN-CSV-001/);
});

test("the sample CSV downloads for any authenticated user", async () => {
  const viewer = await makeUser({ email: "viewer@bykea.com", role: "viewer" });
  const agent = await loginAs(viewer);
  const res = await agent.get("/api/systems/sample/csv");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/csv/);
});
