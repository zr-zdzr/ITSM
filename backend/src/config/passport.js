const passport = require('passport');
const db = require('./db');

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const res = await db.query('SELECT * FROM users WHERE id=$1', [id]);
    done(null, res.rows[0] || false);
  } catch (err) { done(err); }
});
