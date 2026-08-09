const passport = require("passport");
const db = require("./db");
const { googleEnabled, handleGoogleProfile } = require("../utils/googleAuth");

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const res = await db.query("SELECT * FROM users WHERE id=$1", [id]);
    done(null, res.rows[0] || false);
  } catch (err) {
    done(err);
  }
});

// The Google strategy exists only when credentials do — with no
// GOOGLE_CLIENT_ID/SECRET the app runs exactly as before (local login).
if (googleEnabled()) {
  const GoogleStrategy = require("passport-google-oauth20").Strategy;
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // Relative + proxy:true resolves against the request host, which is
        // nginx's X-Forwarded-* thanks to trust proxy.
        callbackURL:
          process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback",
        proxy: true,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          done(null, await handleGoogleProfile(profile));
        } catch (err) {
          if (err.code) return done(null, false, { message: err.code });
          done(err);
        }
      },
    ),
  );
}
