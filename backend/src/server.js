require("dotenv").config();
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const PgStore = require("connect-pg-simple")(session);
const passport = require("passport");
const bcrypt = require("bcryptjs");
const db = require("./config/db");
require("./config/passport");

// A missing SESSION_SECRET used to fall back to a hard-coded string, which
// silently made every session forgeable by anyone who has read this file.
// In production that is a deploy error, not something to paper over.
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "FATAL: SESSION_SECRET is not set. Refusing to start in production — " +
        "sessions signed with a public default can be forged.",
    );
    process.exit(1);
  }
  console.warn(
    "WARNING: SESSION_SECRET is not set. Using an insecure development default.",
  );
}

const app = express();
app.set("trust proxy", 1);

// The backend answers with JSON only — nginx serves the HTML and static assets —
// so the headers that matter here are the transport/framing ones. CSP is left off
// deliberately: it governs how a *document* may load resources, so it belongs on
// the nginx side, and setting it on JSON responses would only be decorative.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new PgStore({ pool: db, tableName: "session" }),
    secret: SESSION_SECRET || "itms-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      // "auto" marks the cookie Secure only on HTTPS requests. With
      // `trust proxy` set above, that is decided from the X-Forwarded-Proto
      // nginx sends, so the cookie hardens itself the moment the app is put
      // behind TLS without breaking today's plain-HTTP LAN access.
      secure: "auto",
      sameSite: "lax",
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

app.use("/auth", require("./routes/auth"));
app.use("/api/systems", require("./routes/systems"));
app.use("/api/network", require("./routes/network"));
app.use("/api/mobiles", require("./routes/mobiles"));
app.use("/api/sims", require("./routes/sims"));
app.use("/api/gws", require("./routes/gws"));
app.use("/api/users", require("./routes/users"));
app.use("/api/employees", require("./routes/employees"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/recycle-bin", require("./routes/recycle-bin"));
app.use("/api/inventory", require("./routes/inventory").router);
app.use("/api/requests", require("./routes/requests"));
app.use("/api/assignments", require("./routes/assignments"));
app.use("/api/asset-history", require("./routes/asset-history"));
app.use("/api/purchases", require("./routes/purchases"));
app.use("/api/maintenance", require("./routes/maintenance"));
app.use("/api/search", require("./routes/search"));
app.use("/api/alerts", require("./routes/alerts"));
app.use("/api/bulk", require("./routes/bulk"));
app.use("/api/vendors", require("./routes/vendors"));
app.use("/api/chat", require("./routes/chat"));
app.use("/api/seed", require("./routes/seed"));
app.use("/api/masterdata", require("./routes/masterdata"));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return;
  const hash = await bcrypt.hash(password, 10);
  await db.query(
    `INSERT INTO users (email, name, password_hash, role, is_active)
     VALUES ($1, 'Admin', $2, 'super_admin', true)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [username, hash],
  );
  console.log("Admin account ready");
}

async function runMigrations() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      module     VARCHAR(30) NOT NULL,
      can_create BOOLEAN NOT NULL DEFAULT false,
      can_read   BOOLEAN NOT NULL DEFAULT true,
      can_update BOOLEAN NOT NULL DEFAULT false,
      can_delete BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (user_id, module)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS recycle_bin (
      id          SERIAL PRIMARY KEY,
      module      VARCHAR(50) NOT NULL,
      table_name  VARCHAR(100) NOT NULL,
      record_id   INTEGER NOT NULL,
      record_name VARCHAR(255),
      data        JSONB NOT NULL,
      deleted_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      deleted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '90 days'
    )
  `);
  // Moved here from schema.sql, which runs first and does not create this
  // table — indexing it there aborted a fresh database init.
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_recycle_bin_expires ON recycle_bin(expires_at)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_recycle_bin_deleted_by ON recycle_bin(deleted_by)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_recycle_bin_module ON recycle_bin(module)`,
  );

  // ── INVENTORY / REQUESTS / ASSIGNMENTS ──────────────────
  await db.query(`
    CREATE TABLE IF NOT EXISTS inv_categories (
      id          SERIAL PRIMARY KEY,
      parent_id   INTEGER REFERENCES inv_categories(id) ON DELETE SET NULL,
      name        VARCHAR(100) NOT NULL,
      description TEXT,
      icon        VARCHAR(50) DEFAULT 'package',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      is_active   BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS inv_items (
      id            SERIAL PRIMARY KEY,
      category_id   INTEGER REFERENCES inv_categories(id) ON DELETE SET NULL,
      name          VARCHAR(200) NOT NULL,
      description   TEXT,
      model         VARCHAR(200),
      manufacturer  VARCHAR(200),
      sku           VARCHAR(100),
      tracking_type VARCHAR(30) NOT NULL DEFAULT 'quantity'
                    CHECK (tracking_type IN ('quantity','quantity_returnable')),
      unit          VARCHAR(20) NOT NULL DEFAULT 'pcs',
      is_active     BOOLEAN NOT NULL DEFAULT true,
      created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS inv_stock (
      id             SERIAL PRIMARY KEY,
      item_id        INTEGER NOT NULL REFERENCES inv_items(id) ON DELETE CASCADE,
      qty_available  INTEGER NOT NULL DEFAULT 0 CHECK (qty_available >= 0),
      qty_assigned   INTEGER NOT NULL DEFAULT 0,
      qty_reserved   INTEGER NOT NULL DEFAULT 0,
      qty_damaged    INTEGER NOT NULL DEFAULT 0,
      reorder_level  INTEGER NOT NULL DEFAULT 5,
      reorder_qty    INTEGER NOT NULL DEFAULT 10,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(item_id)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS inv_adjustments (
      id             SERIAL PRIMARY KEY,
      item_id        INTEGER NOT NULL REFERENCES inv_items(id),
      type           VARCHAR(30) NOT NULL,
      qty_change     INTEGER NOT NULL,
      reference_type VARCHAR(50),
      reference_id   INTEGER,
      notes          TEXT,
      performed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE SEQUENCE IF NOT EXISTS inv_req_seq START 1;
    CREATE TABLE IF NOT EXISTS inv_requests (
      id           SERIAL PRIMARY KEY,
      req_number   VARCHAR(30) UNIQUE NOT NULL,
      requester_id INTEGER NOT NULL REFERENCES users(id),
      priority     VARCHAR(20) NOT NULL DEFAULT 'normal'
                   CHECK (priority IN ('low','normal','high','urgent')),
      status       VARCHAR(30) NOT NULL DEFAULT 'submitted'
                   CHECK (status IN ('submitted','in_review','approved','partially_approved','rejected','fulfilled','cancelled')),
      reason       TEXT,
      required_by  DATE,
      reviewed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at  TIMESTAMPTZ,
      review_notes TEXT,
      fulfilled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      fulfilled_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS inv_request_items (
      id               SERIAL PRIMARY KEY,
      request_id       INTEGER NOT NULL REFERENCES inv_requests(id) ON DELETE CASCADE,
      item_id          INTEGER NOT NULL REFERENCES inv_items(id),
      qty_requested    INTEGER NOT NULL DEFAULT 1,
      qty_approved     INTEGER NOT NULL DEFAULT 0,
      item_status      VARCHAR(30) NOT NULL DEFAULT 'pending'
                       CHECK (item_status IN ('pending','approved','rejected')),
      rejection_reason TEXT,
      notes            TEXT
    )
  `);
  await db.query(`
    CREATE SEQUENCE IF NOT EXISTS inv_asn_seq START 1;
    CREATE TABLE IF NOT EXISTS inv_assignments (
      id                   SERIAL PRIMARY KEY,
      asn_number           VARCHAR(30) UNIQUE NOT NULL,
      request_id           INTEGER REFERENCES inv_requests(id) ON DELETE SET NULL,
      assignee_id          INTEGER NOT NULL REFERENCES employees(id),
      assigned_by          INTEGER NOT NULL REFERENCES users(id),
      status               VARCHAR(30) NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','partially_returned','fully_returned')),
      assigned_date        DATE NOT NULL DEFAULT CURRENT_DATE,
      expected_return_date DATE,
      notes                TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS inv_assignment_items (
      id               SERIAL PRIMARY KEY,
      assignment_id    INTEGER NOT NULL REFERENCES inv_assignments(id) ON DELETE CASCADE,
      item_id          INTEGER NOT NULL REFERENCES inv_items(id),
      qty              INTEGER NOT NULL DEFAULT 1,
      status           VARCHAR(30) NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','returned','damaged','lost')),
      returned_at      TIMESTAMPTZ,
      return_condition VARCHAR(20),
      notes            TEXT
    )
  `);
  await db.query(`
    CREATE SEQUENCE IF NOT EXISTS inv_ret_seq START 1;
    CREATE TABLE IF NOT EXISTS inv_returns (
      id            SERIAL PRIMARY KEY,
      ret_number    VARCHAR(30) UNIQUE NOT NULL,
      assignment_id INTEGER NOT NULL REFERENCES inv_assignments(id),
      returned_by   INTEGER NOT NULL REFERENCES employees(id),
      received_by   INTEGER NOT NULL REFERENCES users(id),
      return_date   DATE NOT NULL DEFAULT CURRENT_DATE,
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS inv_return_items (
      id                 SERIAL PRIMARY KEY,
      return_id          INTEGER NOT NULL REFERENCES inv_returns(id) ON DELETE CASCADE,
      assignment_item_id INTEGER NOT NULL REFERENCES inv_assignment_items(id),
      qty                INTEGER NOT NULL DEFAULT 1,
      condition          VARCHAR(20) NOT NULL DEFAULT 'good'
                         CHECK (condition IN ('good','damaged','lost')),
      back_to_stock      BOOLEAN NOT NULL DEFAULT true,
      notes              TEXT
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS inv_alerts (
      id              SERIAL PRIMARY KEY,
      item_id         INTEGER NOT NULL REFERENCES inv_items(id) ON DELETE CASCADE,
      alert_type      VARCHAR(30) NOT NULL,
      threshold_value INTEGER,
      current_value   INTEGER,
      is_resolved     BOOLEAN NOT NULL DEFAULT false,
      resolved_at     TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_inv_stock_item   ON inv_stock(item_id)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_inv_req_status   ON inv_requests(status)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_inv_req_user     ON inv_requests(requester_id)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_inv_asn_status   ON inv_assignments(status)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_inv_asn_employee ON inv_assignments(assignee_id)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_inv_alerts_res   ON inv_alerts(is_resolved)`,
  );
  await db.query(`
    CREATE TABLE IF NOT EXISTS maintenance_log (
      id           SERIAL PRIMARY KEY,
      asset_type   VARCHAR(20) NOT NULL,
      asset_id     INTEGER NOT NULL,
      event_type   VARCHAR(50) NOT NULL,
      event_date   DATE NOT NULL DEFAULT CURRENT_DATE,
      performed_by VARCHAR(100),
      cost_pkr     NUMERIC(10,2),
      notes        TEXT,
      logged_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Also moved out of schema.sql for the same reason as the recycle_bin ones.
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_maint_logged_by ON maintenance_log(logged_by)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_maint_asset ON maintenance_log(asset_type, asset_id)`,
  );
  // ── Employees: drop legacy first_name/last_name columns ────
  await db.query(`ALTER TABLE employees DROP COLUMN IF EXISTS first_name`);
  await db.query(`ALTER TABLE employees DROP COLUMN IF EXISTS last_name`);
  await db.query(`CREATE SEQUENCE IF NOT EXISTS network_asset_seq START 1`);
  await db.query(
    `ALTER TABLE network_devices ADD COLUMN IF NOT EXISTS asset_tag VARCHAR(50)`,
  );
  await db.query(`
    CREATE TABLE IF NOT EXISTS vendors (
      id           SERIAL PRIMARY KEY,
      name         VARCHAR(200) NOT NULL,
      contact      VARCHAR(100),
      email        VARCHAR(150),
      phone        VARCHAR(50),
      website      VARCHAR(255),
      category     VARCHAR(100),
      address      TEXT,
      notes        TEXT,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // ── Systems table enhancements ───────────────────────────
  await db.query(
    `ALTER TABLE systems DROP CONSTRAINT IF EXISTS systems_assigned_type_check`,
  );
  await db.query(
    `ALTER TABLE systems ADD CONSTRAINT systems_assigned_type_check CHECK (assigned_type IN ('user','employee','wfh','inventory','damaged'))`,
  );
  await db.query(
    `ALTER TABLE systems DROP CONSTRAINT IF EXISTS systems_type_check`,
  );
  await db.query(
    `ALTER TABLE systems ADD CONSTRAINT systems_type_check CHECK (type IN ('Laptop','System','Server','PC','Workstation','Other Device'))`,
  );
  await db.query(
    `ALTER TABLE systems DROP CONSTRAINT IF EXISTS systems_status_check`,
  );
  await db.query(
    `ALTER TABLE systems ADD CONSTRAINT systems_status_check CHECK (status IN ('in_use','available','assigned','repair','retired','lost'))`,
  );
  await db.query(
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS brand_type VARCHAR(20)`,
  );
  await db.query(
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS cpu_cores VARCHAR(50)`,
  );
  await db.query(
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS cpu2 VARCHAR(200)`,
  );
  await db.query(
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS cpu2_cores VARCHAR(50)`,
  );
  await db.query(
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram1_slot VARCHAR(20)`,
  );
  await db.query(
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram1_serial VARCHAR(100)`,
  );
  await db.query(
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram2_slot VARCHAR(20)`,
  );
  await db.query(
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram2_serial VARCHAR(100)`,
  );
  await db.query(
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram3_slot VARCHAR(20)`,
  );
  await db.query(
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram3_serial VARCHAR(100)`,
  );
  await db.query(
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram4_slot VARCHAR(20)`,
  );
  await db.query(
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram4_serial VARCHAR(100)`,
  );
  // ── SIMs table enhancements ─────────────────────────────
  await db.query(
    `ALTER TABLE sims ADD COLUMN IF NOT EXISTS sim_type   VARCHAR(20)`,
  );
  await db.query(
    `ALTER TABLE sims ADD COLUMN IF NOT EXISTS location   VARCHAR(100)`,
  );
  await db.query(
    `ALTER TABLE sims ADD COLUMN IF NOT EXISTS department VARCHAR(100)`,
  );
  await db.query(
    `ALTER TABLE sims ADD COLUMN IF NOT EXISTS purpose    VARCHAR(20)`,
  );
  await db.query(
    `ALTER TABLE sims DROP CONSTRAINT IF EXISTS sims_assigned_type_check`,
  );
  await db.query(
    `ALTER TABLE sims ADD CONSTRAINT sims_assigned_type_check CHECK (assigned_type IN ('user','employee','wfh','service','inventory'))`,
  );
  await db.query(
    `ALTER TABLE sims DROP CONSTRAINT IF EXISTS sims_status_check`,
  );
  await db.query(
    `ALTER TABLE sims ADD CONSTRAINT sims_status_check CHECK (status IN ('active','suspended'))`,
  );
  // ── Mobiles table enhancements ───────────────────────────
  await db.query(
    `ALTER TABLE mobiles ADD COLUMN IF NOT EXISTS type VARCHAR(20)`,
  );
  await db.query(
    `ALTER TABLE mobiles ADD COLUMN IF NOT EXISTS location VARCHAR(100)`,
  );
  await db.query(
    `ALTER TABLE mobiles DROP CONSTRAINT IF EXISTS mobiles_assigned_type_check`,
  );
  await db.query(
    `ALTER TABLE mobiles ADD CONSTRAINT mobiles_assigned_type_check CHECK (assigned_type IN ('user','employee','wfh','inventory','damaged'))`,
  );
  await db.query(
    `ALTER TABLE mobiles DROP CONSTRAINT IF EXISTS mobiles_purpose_check`,
  );
  await db.query(
    `ALTER TABLE mobiles ADD CONSTRAINT mobiles_purpose_check CHECK (purpose IS NULL OR purpose IN ('official','service','personal','qa_testing'))`,
  );
  // ── GWS: add first_name, last_name, phone_number ─────────
  await db.query(
    `ALTER TABLE gws_accounts ADD COLUMN IF NOT EXISTS first_name   VARCHAR(100)`,
  );
  await db.query(
    `ALTER TABLE gws_accounts ADD COLUMN IF NOT EXISTS last_name    VARCHAR(100)`,
  );
  await db.query(
    `ALTER TABLE gws_accounts ADD COLUMN IF NOT EXISTS phone_number VARCHAR(30)`,
  );
  await db.query(`
    UPDATE gws_accounts
    SET first_name = CASE
          WHEN POSITION(' ' IN display_name) > 0 THEN SUBSTRING(display_name, 1, POSITION(' ' IN display_name) - 1)
          ELSE display_name
        END,
        last_name = CASE
          WHEN POSITION(' ' IN display_name) > 0 THEN SUBSTRING(display_name, POSITION(' ' IN display_name) + 1)
          ELSE display_name
        END
    WHERE (first_name IS NULL OR first_name = '') AND display_name IS NOT NULL AND display_name <> ''
  `);
  await db.query(
    `UPDATE gws_accounts SET first_name = SPLIT_PART(email,'@',1) WHERE first_name IS NULL OR TRIM(first_name)=''`,
  );
  await db.query(
    `UPDATE gws_accounts SET last_name  = first_name              WHERE last_name  IS NULL OR TRIM(last_name) =''`,
  );
  await db.query(
    `ALTER TABLE gws_accounts ALTER COLUMN first_name SET NOT NULL`,
  );
  await db.query(
    `ALTER TABLE gws_accounts ALTER COLUMN last_name  SET NOT NULL`,
  );
  await db.query(
    `ALTER TABLE gws_accounts DROP CONSTRAINT IF EXISTS gws_accounts_license_check`,
  );
  await db.query(
    `ALTER TABLE gws_accounts ADD CONSTRAINT gws_accounts_license_check CHECK (license IS NULL OR license IN ('Starter','Standard','Vault','Not Assigned'))`,
  );

  // ── Phase 3: purchase price + useful life on hardware assets ─
  await db.query(
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS purchase_price_pkr NUMERIC(12,2)`,
  );
  await db.query(
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS useful_life_years INTEGER DEFAULT 5`,
  );
  await db.query(
    `ALTER TABLE mobiles ADD COLUMN IF NOT EXISTS purchase_price_pkr NUMERIC(12,2)`,
  );
  await db.query(
    `ALTER TABLE mobiles ADD COLUMN IF NOT EXISTS useful_life_years INTEGER DEFAULT 3`,
  );
  await db.query(
    `ALTER TABLE network_devices ADD COLUMN IF NOT EXISTS purchase_price_pkr NUMERIC(12,2)`,
  );
  await db.query(
    `ALTER TABLE network_devices ADD COLUMN IF NOT EXISTS useful_life_years INTEGER DEFAULT 7`,
  );

  // ── Ex-Employee tracking ──────────────────────────────────
  await db.query(
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS leaving_date DATE`,
  );
  await db.query(
    `ALTER TABLE employees ALTER COLUMN employment_type TYPE VARCHAR(50)`,
  );

  // ── Asset History ─────────────────────────────────────────
  await db.query(`
    CREATE TABLE IF NOT EXISTS asset_history (
      id               SERIAL PRIMARY KEY,
      asset_type       VARCHAR NOT NULL,
      asset_id         INTEGER NOT NULL,
      asset_label      VARCHAR,
      event_type       VARCHAR NOT NULL,
      from_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      to_employee_id   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      from_status      VARCHAR,
      to_status        VARCHAR,
      reason           VARCHAR,
      notes            TEXT,
      performed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_asset_history_asset    ON asset_history(asset_type, asset_id)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_asset_history_employee ON asset_history(to_employee_id)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_asset_history_created  ON asset_history(created_at DESC)`,
  );

  // ── Master Data: Categories / Heads / Sub-Heads ───────
  await db.query(`
    CREATE TABLE IF NOT EXISTS item_categories (
      id            SERIAL PRIMARY KEY,
      category_name VARCHAR(100) NOT NULL,
      description   TEXT,
      status        VARCHAR(10)  NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive')),
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT item_categories_name_unique UNIQUE (category_name)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS heads (
      id          SERIAL PRIMARY KEY,
      category_id INTEGER      NOT NULL REFERENCES item_categories(id) ON DELETE CASCADE,
      head_name   VARCHAR(100) NOT NULL,
      description TEXT,
      status      VARCHAR(10)  NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive')),
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT heads_category_name_unique UNIQUE (category_id, head_name)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS sub_heads (
      id            SERIAL PRIMARY KEY,
      head_id       INTEGER      NOT NULL REFERENCES heads(id) ON DELETE CASCADE,
      sub_head_name VARCHAR(100) NOT NULL,
      description   TEXT,
      status        VARCHAR(10)  NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive')),
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT sub_heads_head_name_unique UNIQUE (head_id, sub_head_name)
    )
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_heads_category ON heads(category_id)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_sub_heads_head ON sub_heads(head_id)`,
  );

  // ── Asset Buyouts (asset_purchases ledger) ────────────────
  // Append-only, immutable, one-sale-per-asset. Mirrors asset_history:
  // soft asset_id FK, employee FK ON DELETE SET NULL, plus a buyer name
  // snapshot so the record stays intact even if the employee row changes.
  await db.query(`
    CREATE TABLE IF NOT EXISTS asset_purchases (
      id                  SERIAL PRIMARY KEY,
      asset_type          VARCHAR(20)   NOT NULL,
      asset_id            INTEGER       NOT NULL,
      asset_label         VARCHAR(150),
      buyer_employee_id   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      buyer_name_snapshot VARCHAR(100)  NOT NULL,
      sale_price_pkr      NUMERIC(12,2)  NOT NULL CHECK (sale_price_pkr >= 0),
      book_value_pkr      NUMERIC(12,2),
      sale_date           DATE           NOT NULL DEFAULT CURRENT_DATE,
      invoice_number      VARCHAR(100),
      payment_reference   VARCHAR(100),
      notes               TEXT,
      performed_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_asset_purchases_asset ON asset_purchases(asset_type, asset_id)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_asset_purchases_buyer ON asset_purchases(buyer_employee_id)`,
  );
  // An asset can only be sold once.
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_purchase_once ON asset_purchases(asset_type, asset_id)`,
  );
  // Allow 'sold' as a terminal status on buyable hardware.
  await db.query(
    `ALTER TABLE systems DROP CONSTRAINT IF EXISTS systems_status_check`,
  );
  await db.query(
    `ALTER TABLE systems ADD CONSTRAINT systems_status_check CHECK (status IN ('in_use','available','assigned','repair','retired','lost','sold'))`,
  );
  await db.query(
    `ALTER TABLE mobiles DROP CONSTRAINT IF EXISTS mobiles_status_check`,
  );
  await db.query(
    `ALTER TABLE mobiles ADD CONSTRAINT mobiles_status_check CHECK (status IN ('in_use','available','repair','retired','sold'))`,
  );
  await db.query(
    `ALTER TABLE network_devices DROP CONSTRAINT IF EXISTS network_devices_status_check`,
  );
  await db.query(
    `ALTER TABLE network_devices ADD CONSTRAINT network_devices_status_check CHECK (status IN ('in_use','available','repair','retired','sold'))`,
  );

  // ── AUDIT TRAIL DURABILITY & 90-DAY RETENTION ───────────────
  // Retention moves 30d → 90d. The column default only affects new rows, so
  // existing bin entries are re-based off their own deleted_at — an item
  // deleted yesterday gets 89 days left, not 90 from today.
  await db.query(
    `ALTER TABLE recycle_bin ALTER COLUMN expires_at SET DEFAULT NOW() + INTERVAL '90 days'`,
  );
  await db.query(
    `UPDATE recycle_bin SET expires_at = deleted_at + INTERVAL '90 days'
      WHERE expires_at < deleted_at + INTERVAL '90 days'`,
  );

  // activity_log.user_id and asset_history.*_employee_id are ON DELETE SET NULL,
  // so deleting a person used to anonymise every record they touched. Storing
  // the label at write time means the trail still reads "Ali Raza deleted
  // L10247" after Ali's account is gone. Denormalised on purpose: an audit row
  // records what was true when it happened, and must not shift underneath us.
  await db.query(
    `ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS user_label VARCHAR(150)`,
  );
  // Field-level diff for updates: {"status":["available","in_use"], ...}.
  // Without it an update only ever said "Updated system", never what changed.
  await db.query(
    `ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS changes JSONB`,
  );
  await db.query(
    `ALTER TABLE asset_history ADD COLUMN IF NOT EXISTS from_employee_label VARCHAR(150)`,
  );
  await db.query(
    `ALTER TABLE asset_history ADD COLUMN IF NOT EXISTS to_employee_label VARCHAR(150)`,
  );
  await db.query(
    `ALTER TABLE asset_history ADD COLUMN IF NOT EXISTS performed_by_label VARCHAR(150)`,
  );

  // Backfill labels for rows written before the columns existed. Only touches
  // rows whose FK still resolves — anything already orphaned is unrecoverable,
  // which is precisely the hole these columns close going forward.
  await db.query(
    `UPDATE activity_log a SET user_label = COALESCE(u.name, u.email)
       FROM users u WHERE u.id = a.user_id AND a.user_label IS NULL`,
  );
  await db.query(
    `UPDATE asset_history h SET from_employee_label = e.full_name
       FROM employees e WHERE e.id = h.from_employee_id AND h.from_employee_label IS NULL`,
  );
  await db.query(
    `UPDATE asset_history h SET to_employee_label = e.full_name
       FROM employees e WHERE e.id = h.to_employee_id AND h.to_employee_label IS NULL`,
  );
  await db.query(
    `UPDATE asset_history h SET performed_by_label = COALESCE(u.name, u.email)
       FROM users u WHERE u.id = h.performed_by AND h.performed_by_label IS NULL`,
  );

  // The admin Activity Log filters by action and by actor; without these it
  // falls back to a sequential scan once the table outgrows memory.
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log (action)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_activity_table_record ON activity_log (table_name, record_id)`,
  );

  // ── SCHEMA DRIFT REPAIR ─────────────────────────────────────
  // These 34 columns and one sequence existed only on the long-lived
  // production database, added by hand and never captured in a migration.
  // Every one of them is read or written by the routes, so a fresh install
  // 500'd across systems/mobiles/sims/gws until they were recreated here.
  // Types mirror the live database exactly (information_schema, 2026-08-09).
  await db.query(`CREATE SEQUENCE IF NOT EXISTS system_asset_seq START 1`);
  const driftRepair = [
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS asset_tag VARCHAR(30)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS condition VARCHAR(20)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS department VARCHAR(100)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS generation VARCHAR(50)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS purpose TEXT`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS disk1_size VARCHAR(50)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS disk1_type VARCHAR(20)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS disk2_size VARCHAR(50)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS disk2_type VARCHAR(20)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS disk3_size VARCHAR(50)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS disk3_type VARCHAR(20)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS disk4_size VARCHAR(50)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS disk4_type VARCHAR(20)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram1_size VARCHAR(50)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram1_bus VARCHAR(50)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram2_size VARCHAR(50)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram2_bus VARCHAR(50)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram3_size VARCHAR(50)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram3_bus VARCHAR(50)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram4_size VARCHAR(50)`,
    `ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram4_bus VARCHAR(50)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS systems_asset_tag_key ON systems(asset_tag)`,
    `ALTER TABLE mobiles ADD COLUMN IF NOT EXISTS condition VARCHAR(20)`,
    `ALTER TABLE mobiles ADD COLUMN IF NOT EXISTS department VARCHAR(100)`,
    `ALTER TABLE mobiles ADD COLUMN IF NOT EXISTS warranty_start DATE`,
    `ALTER TABLE sims ADD COLUMN IF NOT EXISTS user_name VARCHAR(100)`,
    `ALTER TABLE gws_accounts ADD COLUMN IF NOT EXISTS creation_date DATE`,
    `ALTER TABLE gws_accounts ADD COLUMN IF NOT EXISTS department VARCHAR(100)`,
    `ALTER TABLE gws_accounts ADD COLUMN IF NOT EXISTS designation VARCHAR(100)`,
    `ALTER TABLE gws_accounts ADD COLUMN IF NOT EXISTS gws_role VARCHAR(30)`,
    `ALTER TABLE gws_accounts ADD COLUMN IF NOT EXISTS last_login DATE`,
    `ALTER TABLE gws_accounts ADD COLUMN IF NOT EXISTS linked_user_id INTEGER`,
    `ALTER TABLE gws_accounts ADD COLUMN IF NOT EXISTS storage_limit NUMERIC DEFAULT 30`,
    `ALTER TABLE gws_accounts ADD COLUMN IF NOT EXISTS storage_used NUMERIC DEFAULT 0`,
    `ALTER TABLE gws_accounts ADD COLUMN IF NOT EXISTS two_fa BOOLEAN DEFAULT false`,
  ];
  for (const sql of driftRepair) await db.query(sql);
}

// ── Global error handler ──────────────────────────────────────
// Must be registered after all routes. Handles any error passed via next(err).
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});

function scheduleWeeklyMaintenance() {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  async function run() {
    try {
      // Archive each expiring row into the activity log before it goes, so a
      // record that ages out of the bin is still recoverable from the trail.
      // Done as one statement so a crash between the two cannot lose data:
      // if the INSERT fails the DELETE never runs and the rows survive to the
      // next weekly pass.
      const { rowCount } = await db.query(`
        WITH expired AS (
          DELETE FROM recycle_bin WHERE expires_at < NOW() RETURNING *
        )
        INSERT INTO activity_log
          (user_id, user_label, action, table_name, record_id, record_label, details, changes)
        SELECT NULL, 'system', 'expired', e.table_name, e.record_id, e.record_name,
               'Retention window elapsed; purged from Recycle Bin automatically. '
                 || 'Full record snapshot retained with this entry.',
               jsonb_build_object('snapshot', e.data)
        FROM expired e
      `);
      if (rowCount > 0)
        console.log(
          `Recycle bin: purged ${rowCount} expired records (snapshots archived to activity_log)`,
        );
      await db.query("VACUUM ANALYZE");
      console.log("Weekly VACUUM ANALYZE completed");
    } catch (e) {
      console.error("Weekly maintenance failed:", e.message);
    }
    setTimeout(run, WEEK_MS);
  }
  setTimeout(run, 60_000);
}

// Only bind a port when started directly (`node src/server.js`). Requiring this
// file — which the tests do — must give back a configured app without opening a
// socket or arming the weekly maintenance timer, or the test process would
// never exit.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, async () => {
    console.log(`ITMS backend running on :${PORT}`);
    await runMigrations().catch((err) =>
      console.error("Migration error:", err.message),
    );
    await seedAdmin().catch((err) => console.error("Seed error:", err.message));
    scheduleWeeklyMaintenance();
  });
}

module.exports = { app, runMigrations, seedAdmin };
