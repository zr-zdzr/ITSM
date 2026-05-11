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
app.use('/api/reports',   require('./routes/reports'));
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
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`ITMS backend running on :${PORT}`);
  await runMigrations().catch(err => console.error('Migration error:', err.message));
  await seedAdmin().catch(err => console.error('Seed error:', err.message));
});
