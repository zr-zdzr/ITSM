/**
 * Row builders and a login helper.
 *
 * Requires setup.js to have run first so DATABASE_URL already points at the
 * test database.
 */
const bcrypt = require("bcryptjs");
const request = require("supertest");
const db = require("../../src/config/db");
const { app } = require("../../src/server");

const PASSWORD = "test-password-123";

/** Insert a user. Cost 4 keeps bcrypt from dominating the test runtime. */
async function makeUser({
  email,
  name = "Test User",
  role = "user",
  isActive = true,
  password = PASSWORD,
} = {}) {
  const hash = await bcrypt.hash(password, 4);
  const { rows } = await db.query(
    `INSERT INTO users (email, name, password_hash, role, is_active)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [email, name, hash, role, isActive],
  );
  return rows[0];
}

async function grant(userId, module, actions = {}) {
  await db.query(
    `INSERT INTO user_permissions (user_id, module, can_create, can_read, can_update, can_delete)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, module) DO UPDATE SET
       can_create = EXCLUDED.can_create, can_read = EXCLUDED.can_read,
       can_update = EXCLUDED.can_update, can_delete = EXCLUDED.can_delete`,
    [
      userId,
      module,
      actions.create ?? false,
      actions.read ?? true,
      actions.update ?? false,
      actions.delete ?? false,
    ],
  );
}

/**
 * Log in and return an agent that carries the session cookie, so callers can
 * make authenticated requests without handling cookies themselves.
 */
async function loginAs(user, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent
    .post("/auth/login")
    .send({ username: user.email, password });
  if (res.status !== 200) {
    throw new Error(
      `loginAs(${user.email}) expected 200, got ${res.status}: ${res.text}`,
    );
  }
  return agent;
}

async function makeEmployee({ fullName = "Chain Holder", ...rest } = {}) {
  const { rows } = await db.query(
    `INSERT INTO employees (full_name, designation, department, location, is_active)
     VALUES ($1,$2,$3,$4,true) RETURNING *`,
    [
      fullName,
      rest.designation || "Engineer",
      rest.department || "Engineering",
      rest.location || "Karachi",
    ],
  );
  return rows[0];
}

/**
 * An employee with a linked portal login of role 'employee' — the shape
 * bulk provisioning produces. Returns { employee, user }.
 */
async function makeEmployeeWithLogin({
  fullName = "Staff Member",
  email = `${Math.random().toString(36).slice(2, 10)}@bykea.com`,
  department = "Operations",
} = {}) {
  const employee = await makeEmployee({ fullName, department });
  await db.query("UPDATE employees SET email=$1 WHERE id=$2", [
    email,
    employee.id,
  ]);
  const user = await makeUser({ email, name: fullName, role: "employee" });
  await db.query("UPDATE employees SET portal_user_id=$1 WHERE id=$2", [
    user.id,
    employee.id,
  ]);
  return { employee, user };
}

/** Insert a consumable item together with its stock row. */
async function makeItem({ name = "USB-C Cable", qty = 10, ...rest } = {}) {
  const { rows } = await db.query(
    `INSERT INTO inv_items (name, unit, tracking_type)
     VALUES ($1,$2,$3) RETURNING *`,
    [name, rest.unit || "pcs", rest.trackingType || "quantity_returnable"],
  );
  const item = rows[0];
  await db.query(
    `INSERT INTO inv_stock (item_id, qty_available) VALUES ($1,$2)`,
    [item.id, qty],
  );
  return item;
}

async function stockOf(itemId) {
  const { rows } = await db.query(
    `SELECT qty_available, qty_assigned, qty_damaged FROM inv_stock WHERE item_id=$1`,
    [itemId],
  );
  return rows[0];
}

module.exports = {
  makeUser,
  grant,
  loginAs,
  makeEmployee,
  makeEmployeeWithLogin,
  makeItem,
  stockOf,
  db,
  app,
  PASSWORD,
};
