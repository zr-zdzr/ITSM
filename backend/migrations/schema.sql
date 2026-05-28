-- ============================================================
-- ITMS — IT Management System — PostgreSQL Schema
-- ============================================================

-- Session store
CREATE TABLE IF NOT EXISTS session (
    sid     VARCHAR NOT NULL COLLATE "default",
    sess    JSON    NOT NULL,
    expire  TIMESTAMP(6) NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (sid)
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

-- ── PORTAL USERS (login accounts) ──────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    google_id     VARCHAR(100) UNIQUE,
    email         VARCHAR(255) UNIQUE NOT NULL,
    name          VARCHAR(255) NOT NULL,
    password_hash VARCHAR,
    avatar_url    TEXT,
    role          VARCHAR(20)  NOT NULL DEFAULT 'viewer'
                  CHECK (role IN ('super_admin','user','viewer')),
    department    VARCHAR(100),
    designation   VARCHAR(100),
    is_active     BOOLEAN NOT NULL DEFAULT true,
    last_login    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── EMPLOYEES (company staff directory) ────────────────────
CREATE TABLE IF NOT EXISTS employees (
    id               SERIAL PRIMARY KEY,
    full_name        VARCHAR(50)  NOT NULL,
    email            VARCHAR(255),
    designation      VARCHAR(100) NOT NULL,
    department       VARCHAR(100) NOT NULL,
    business_unit    VARCHAR(100),
    mobile_number    VARCHAR(30),
    location         VARCHAR(100),
    employment_type  VARCHAR(30),
    joining_date     DATE,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    portal_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SYSTEMS (PCs / Servers) ────────────────────────────────
CREATE TABLE IF NOT EXISTS systems (
    id                   SERIAL PRIMARY KEY,
    serial_number        VARCHAR(100) UNIQUE NOT NULL,
    type                 VARCHAR(20)  NOT NULL CHECK (type IN ('branded','unbranded')),
    -- Branded
    manufacturer         VARCHAR(100),
    model                VARCHAR(100),
    -- Unbranded
    system_category      VARCHAR(30)  CHECK (system_category IN ('Server','System')),
    -- Common hardware
    disk_type            VARCHAR(20)  CHECK (disk_type IN ('SATA','SSD','NVMe','HDD')),
    disk_size            VARCHAR(50),
    ram                  VARCHAR(50),
    ram_bus              VARCHAR(50),
    cpu                  VARCHAR(150),
    -- Assignment
    assigned_type        VARCHAR(20)  NOT NULL DEFAULT 'inventory'
                         CHECK (assigned_type IN ('user','inventory')),
    assigned_user_id     INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    -- Status
    warranty_expiry      DATE,
    status               VARCHAR(20)  NOT NULL DEFAULT 'available'
                         CHECK (status IN ('in_use','available','repair','retired')),
    purchase_date        DATE,
    invoice_number       VARCHAR(100),
    location             VARCHAR(100),
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── NETWORK DEVICES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS network_devices (
    id               SERIAL PRIMARY KEY,
    device_type      VARCHAR(50) NOT NULL
                     CHECK (device_type IN ('Switch','Router','Firewall','WiFi Controller','Access Point','UPS','NAS','Other')),
    brand            VARCHAR(100),
    model            VARCHAR(100),
    serial_number    VARCHAR(100),
    ip_address       VARCHAR(50),
    mac_address      VARCHAR(50),
    vlan             VARCHAR(100),
    firmware_version VARCHAR(50),
    rack_location    VARCHAR(100),
    location         VARCHAR(100),
    status           VARCHAR(20)  NOT NULL DEFAULT 'in_use'
                     CHECK (status IN ('in_use','available','repair','retired')),
    warranty_expiry  DATE,
    purchase_date    DATE,
    vendor           VARCHAR(100),
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── MOBILE PHONES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mobiles (
    id                SERIAL PRIMARY KEY,
    asset_tag         VARCHAR(30) UNIQUE,
    manufacturer      VARCHAR(100) NOT NULL,
    model             VARCHAR(100) NOT NULL,
    serial_number     VARCHAR(100),
    imei              VARCHAR(20),
    imei2             VARCHAR(20),
    color             VARCHAR(50),
    storage_capacity  VARCHAR(50),
    os                VARCHAR(20) CHECK (os IN ('Android','iOS','Other')),
    os_version        VARCHAR(50),
    -- Assignment
    assigned_type     VARCHAR(20)  NOT NULL DEFAULT 'inventory'
                      CHECK (assigned_type IN ('user','inventory')),
    assigned_user_id  INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    -- Purpose
    purpose           VARCHAR(30)  CHECK (purpose IN ('personal','qa_testing','service')),
    service_details   TEXT,
    -- Admin
    warranty_expiry   DATE,
    purchase_date     DATE,
    invoice_number    VARCHAR(100),
    status            VARCHAR(20)  NOT NULL DEFAULT 'available'
                      CHECK (status IN ('in_use','available','repair','retired')),
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SIM CARDS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sims (
    id                SERIAL PRIMARY KEY,
    phone_number      VARCHAR(30)  NOT NULL,
    iccid             VARCHAR(25),
    vendor            VARCHAR(50)  NOT NULL
                      CHECK (vendor IN ('Jazz','Telenor','Ufone','Zong','Other')),
    -- Assignment
    assigned_type     VARCHAR(20)  NOT NULL DEFAULT 'inventory'
                      CHECK (assigned_type IN ('user','service','inventory')),
    assigned_user_id  INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    sim_holder        VARCHAR(100),
    service_type      VARCHAR(100),
    package_name      VARCHAR(100),
    data_limit        VARCHAR(50),
    monthly_rate      DECIMAL(10,2),
    activation_date   DATE,
    expiry_date       DATE,
    status            VARCHAR(20)  NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','inactive','suspended')),
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── GWS ACCOUNTS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gws_accounts (
    id           SERIAL PRIMARY KEY,
    first_name   VARCHAR(100) NOT NULL,
    last_name    VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    email        VARCHAR(255) UNIQUE NOT NULL,
    org_unit     VARCHAR(100),
    phone_number VARCHAR(30),
    license      VARCHAR(20)  CHECK (license IS NULL OR license IN ('Starter','Standard','Vault','Not Assigned')),
    status       VARCHAR(20)  NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','suspended','deleted')),
    account_type VARCHAR(20)  NOT NULL DEFAULT 'user'
                 CHECK (account_type IN ('user','service_account')),
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ACTIVITY LOG ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action       VARCHAR(50)  NOT NULL,
    table_name   VARCHAR(50),
    record_id    INTEGER,
    record_label VARCHAR(150),
    details      TEXT,
    ip_address   VARCHAR(45),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── AUTO-UPDATED updated_at ────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','employees','systems','network_devices','mobiles','sims','gws_accounts'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON %s', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- ── MOBILE ASSET TAG COUNTER ──────────────────────────────
CREATE SEQUENCE IF NOT EXISTS mobile_asset_seq START 1;

-- ── PERFORMANCE INDEXES ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_systems_status      ON systems(status);
CREATE INDEX IF NOT EXISTS idx_systems_warranty    ON systems(warranty_expiry);
CREATE INDEX IF NOT EXISTS idx_systems_assigned    ON systems(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_network_type        ON network_devices(device_type);
CREATE INDEX IF NOT EXISTS idx_mobiles_status      ON mobiles(status);
CREATE INDEX IF NOT EXISTS idx_mobiles_assigned    ON mobiles(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_sims_status_vendor  ON sims(status, vendor);
CREATE INDEX IF NOT EXISTS idx_sims_assigned       ON sims(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_gws_status          ON gws_accounts(status);
CREATE INDEX IF NOT EXISTS idx_activity_created    ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employees_dept      ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_active    ON employees(is_active);
CREATE INDEX IF NOT EXISTS idx_employees_location  ON employees(location);
