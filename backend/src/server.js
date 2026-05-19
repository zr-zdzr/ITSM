require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const PgStore  = require('connect-pg-simple')(session);
const passport = require('passport');
const bcrypt   = require('bcryptjs');
const db       = require('./config/db');
require('./config/passport');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store:  new PgStore({ pool: db, tableName: 'session' }),
  secret: process.env.SESSION_SECRET || 'itms-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge:   7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure:   false,
    sameSite: 'lax',
  },
}));

app.use(passport.initialize());
app.use(passport.session());

app.use('/auth',        require('./routes/auth'));
app.use('/api/systems', require('./routes/systems'));
app.use('/api/network', require('./routes/network'));
app.use('/api/mobiles', require('./routes/mobiles'));
app.use('/api/sims',    require('./routes/sims'));
app.use('/api/gws',     require('./routes/gws'));
app.use('/api/users',     require('./routes/users'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/reports',      require('./routes/reports'));
app.use('/api/recycle-bin',  require('./routes/recycle-bin'));
app.use('/api/inventory',    require('./routes/inventory').router);
app.use('/api/requests',     require('./routes/requests'));
app.use('/api/assignments',  require('./routes/assignments'));
app.use('/api/maintenance',  require('./routes/maintenance'));
app.use('/api/search',       require('./routes/search'));
app.use('/api/alerts',       require('./routes/alerts'));
app.use('/api/bulk',         require('./routes/bulk'));
app.use('/api/vendors',      require('./routes/vendors'));
app.use('/api/chat',         require('./routes/chat'));
app.use('/api/seed',         require('./routes/seed'));
app.get('/api/health',  (_req, res) => res.json({ ok: true }));

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return;
  const hash = await bcrypt.hash(password, 10);
  await db.query(
    `INSERT INTO users (email, name, password_hash, role, is_active)
     VALUES ($1, 'Admin', $2, 'super_admin', true)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [username, hash]
  );
  console.log('Admin account ready');
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
      expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
    )
  `);

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
  await db.query(`CREATE INDEX IF NOT EXISTS idx_inv_stock_item   ON inv_stock(item_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_inv_req_status   ON inv_requests(status)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_inv_req_user     ON inv_requests(requester_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_inv_asn_status   ON inv_assignments(status)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_inv_asn_employee ON inv_assignments(assignee_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_inv_alerts_res   ON inv_alerts(is_resolved)`);
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
  await db.query(`CREATE INDEX IF NOT EXISTS idx_maint_asset ON maintenance_log(asset_type, asset_id)`);
  // ── Employees: migrate to single full_name field ─────────
  await db.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS full_name VARCHAR(50)`);
  await db.query(`
    UPDATE employees
    SET full_name = LEFT(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), 50)
    WHERE full_name IS NULL OR full_name = ''
  `);
  await db.query(`UPDATE employees SET full_name = 'Unknown' WHERE full_name IS NULL OR TRIM(full_name) = ''`);
  await db.query(`ALTER TABLE employees ALTER COLUMN full_name SET NOT NULL`);
  await db.query(`ALTER TABLE employees ALTER COLUMN first_name DROP NOT NULL`);
  await db.query(`ALTER TABLE employees ALTER COLUMN last_name  DROP NOT NULL`);
  await db.query(`CREATE SEQUENCE IF NOT EXISTS network_asset_seq START 1`);
  await db.query(`ALTER TABLE network_devices ADD COLUMN IF NOT EXISTS asset_tag VARCHAR(50)`);
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
  await db.query(`ALTER TABLE systems DROP CONSTRAINT IF EXISTS systems_assigned_type_check`);
  await db.query(`ALTER TABLE systems ADD CONSTRAINT systems_assigned_type_check CHECK (assigned_type IN ('user','employee','wfh','inventory','damaged'))`);
  await db.query(`ALTER TABLE systems DROP CONSTRAINT IF EXISTS systems_type_check`);
  await db.query(`ALTER TABLE systems ADD CONSTRAINT systems_type_check CHECK (type IN ('Laptop','System','Server','PC','Workstation','Other Device'))`);
  await db.query(`ALTER TABLE systems DROP CONSTRAINT IF EXISTS systems_status_check`);
  await db.query(`ALTER TABLE systems ADD CONSTRAINT systems_status_check CHECK (status IN ('in_use','available','assigned','repair','retired','lost'))`);
  await db.query(`ALTER TABLE systems ADD COLUMN IF NOT EXISTS brand_type VARCHAR(20)`);
  await db.query(`ALTER TABLE systems ADD COLUMN IF NOT EXISTS cpu_cores VARCHAR(50)`);
  await db.query(`ALTER TABLE systems ADD COLUMN IF NOT EXISTS cpu2 VARCHAR(200)`);
  await db.query(`ALTER TABLE systems ADD COLUMN IF NOT EXISTS cpu2_cores VARCHAR(50)`);
  await db.query(`ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram1_slot VARCHAR(20)`);
  await db.query(`ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram1_serial VARCHAR(100)`);
  await db.query(`ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram2_slot VARCHAR(20)`);
  await db.query(`ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram2_serial VARCHAR(100)`);
  await db.query(`ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram3_slot VARCHAR(20)`);
  await db.query(`ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram3_serial VARCHAR(100)`);
  await db.query(`ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram4_slot VARCHAR(20)`);
  await db.query(`ALTER TABLE systems ADD COLUMN IF NOT EXISTS ram4_serial VARCHAR(100)`);
  // ── SIMs table enhancements ─────────────────────────────
  await db.query(`ALTER TABLE sims ADD COLUMN IF NOT EXISTS sim_type   VARCHAR(20)`);
  await db.query(`ALTER TABLE sims ADD COLUMN IF NOT EXISTS location   VARCHAR(100)`);
  await db.query(`ALTER TABLE sims ADD COLUMN IF NOT EXISTS department VARCHAR(100)`);
  await db.query(`ALTER TABLE sims ADD COLUMN IF NOT EXISTS purpose    VARCHAR(20)`);
  await db.query(`ALTER TABLE sims DROP CONSTRAINT IF EXISTS sims_assigned_type_check`);
  await db.query(`ALTER TABLE sims ADD CONSTRAINT sims_assigned_type_check CHECK (assigned_type IN ('user','employee','wfh','service','inventory'))`);
  await db.query(`ALTER TABLE sims DROP CONSTRAINT IF EXISTS sims_status_check`);
  await db.query(`ALTER TABLE sims ADD CONSTRAINT sims_status_check CHECK (status IN ('active','suspended'))`);
  // ── Mobiles table enhancements ───────────────────────────
  await db.query(`ALTER TABLE mobiles ADD COLUMN IF NOT EXISTS type VARCHAR(20)`);
  await db.query(`ALTER TABLE mobiles ADD COLUMN IF NOT EXISTS location VARCHAR(100)`);
  await db.query(`ALTER TABLE mobiles DROP CONSTRAINT IF EXISTS mobiles_assigned_type_check`);
  await db.query(`ALTER TABLE mobiles ADD CONSTRAINT mobiles_assigned_type_check CHECK (assigned_type IN ('user','employee','wfh','inventory','damaged'))`);
  await db.query(`ALTER TABLE mobiles DROP CONSTRAINT IF EXISTS mobiles_purpose_check`);
  await db.query(`ALTER TABLE mobiles ADD CONSTRAINT mobiles_purpose_check CHECK (purpose IS NULL OR purpose IN ('official','service','personal','qa_testing'))`);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`ITMS backend running on :${PORT}`);
  await runMigrations().catch(err => console.error('Migration error:', err.message));
  await seedAdmin().catch(err => console.error('Seed error:', err.message));
});
