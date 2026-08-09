const router = require("express").Router();
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const passport = require("passport");
const db = require("../config/db");
const { logActivity, getIP } = require("../utils/activity");
const {
  googleEnabled,
  isBreakGlassAdmin,
  ALLOWED_DOMAIN,
} = require("../utils/googleAuth");

// Every failed login was logged but nothing ever stopped one, so a password
// could be guessed indefinitely. Only failures count toward the limit
// (skipSuccessfulRequests), so people actively using the app are never
// throttled — it takes ten *wrong* passwords from one IP to trip.
// Keyed on IP via the default generator; `trust proxy` is set in server.js,
// so that is the real client address from X-Forwarded-For, not nginx's.
// Caveat: a whole office behind one NAT shares this budget — during an
// employee-account rollout week (everyone typing temp passwords), ten typos
// from the office lock the office. Raise `limit` temporarily if that bites.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: async (req, res) => {
    // Logged like the other outcomes so a burst is visible in the Activity Log.
    await logActivity(
      null,
      "login_ratelimited",
      "auth",
      null,
      req.body?.username || "unknown",
      "Too many failed attempts — temporarily blocked",
      getIP(req),
    );
    res.status(429).json({
      error: "Too many failed login attempts. Please try again in 15 minutes.",
    });
  },
});

// ── LOGIN ─────────────────────────────────────────────────
// Which login methods exist right now — the Login page renders from this.
router.get("/config", (req, res) => {
  res.json({ google: googleEnabled(), domain: ALLOWED_DOMAIN });
});

// ── GOOGLE SSO ────────────────────────────────────────────
// Both routes 404 while dormant so nothing advertises a dead flow.
router.get("/google", (req, res, next) => {
  if (!googleEnabled()) return res.status(404).json({ error: "Not enabled" });
  passport.authenticate("google", {
    scope: ["profile", "email"],
    hd: ALLOWED_DOMAIN, // advisory hint; the real check is server-side
  })(req, res, next);
});

router.get("/google/callback", (req, res, next) => {
  if (!googleEnabled()) return res.status(404).json({ error: "Not enabled" });
  passport.authenticate("google", async (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      const code = info?.message || "google_failed";
      await logActivity(
        null,
        "login_failed",
        "auth",
        null,
        "google",
        `Google sign-in rejected: ${code}`,
        getIP(req),
      ).catch(() => {});
      return res.redirect(`/login?error=${encodeURIComponent(code)}`);
    }
    req.login(user, async (loginErr) => {
      if (loginErr) return next(loginErr);
      await db.query("UPDATE users SET last_login=NOW() WHERE id=$1", [
        user.id,
      ]);
      await logActivity(
        user.id,
        "login",
        "auth",
        null,
        user.email,
        "Login successful (Google SSO)",
        getIP(req),
      );
      res.redirect("/");
    });
  })(req, res, next);
});

router.post("/login", loginLimiter, async (req, res, next) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username and password required" });
  // Once SSO is live, passwords work for exactly one account: the env-seeded
  // break-glass admin. Everyone else signs in with Google.
  if (googleEnabled() && username !== (process.env.ADMIN_USERNAME || "admin"))
    return res
      .status(403)
      .json({ error: "Password login is disabled — sign in with Google" });
  const ip = getIP(req);
  try {
    const result = await db.query(
      "SELECT * FROM users WHERE email=$1 AND password_hash IS NOT NULL",
      [username],
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      await logActivity(
        null,
        "login_failed",
        "auth",
        null,
        username,
        "Invalid credentials",
        ip,
      );
      return res.status(401).json({ error: "Invalid username or password" });
    }
    if (!user.is_active) {
      await logActivity(
        user.id,
        "login_blocked",
        "auth",
        null,
        user.email,
        "Account deactivated",
        ip,
      );
      return res.status(403).json({ error: "Account is deactivated" });
    }
    req.login(user, async (err) => {
      if (err) return next(err);
      await db.query("UPDATE users SET last_login=NOW() WHERE id=$1", [
        user.id,
      ]);
      await logActivity(
        user.id,
        "login",
        "auth",
        null,
        user.email,
        "Login successful",
        ip,
      );
      res.json({ ok: true, must_change_password: user.must_change_password });
    });
  } catch (err) {
    next(err);
  }
});

// ── LOGOUT ────────────────────────────────────────────────
router.post("/logout", (req, res, next) => {
  if (req.isAuthenticated()) {
    const ip = getIP(req);
    const userId = req.user.id;
    const email = req.user.email;
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        logActivity(userId, "logout", "auth", null, email, "Logout", ip).catch(
          () => {},
        );
        res.json({ ok: true });
      });
    });
  } else {
    res.json({ ok: true });
  }
});

// ── ME (includes per-module permissions for non-super_admin) ──
router.get("/me", async (req, res, next) => {
  if (!req.isAuthenticated())
    return res.status(401).json({ error: "Not authenticated" });
  const {
    id,
    email,
    name,
    avatar_url,
    role,
    department,
    designation,
    must_change_password,
  } = req.user;
  let permissions = null;
  if (role !== "super_admin") {
    try {
      const r = await db.query(
        "SELECT * FROM user_permissions WHERE user_id=$1",
        [id],
      );
      permissions = {};
      for (const row of r.rows) {
        permissions[row.module] = {
          can_create: row.can_create,
          can_read: row.can_read,
          can_update: row.can_update,
          can_delete: row.can_delete,
        };
      }
    } catch (err) {
      return next(err);
    }
  }
  res.json({
    id,
    email,
    name,
    avatar_url,
    role,
    department,
    designation,
    must_change_password,
    permissions,
  });
});

// ── CHANGE OWN PASSWORD ───────────────────────────────────
router.post("/change-password", async (req, res, next) => {
  if (!req.isAuthenticated())
    return res.status(401).json({ error: "Not authenticated" });
  // With SSO live there are no local passwords to change — except the
  // break-glass admin's.
  if (googleEnabled() && !isBreakGlassAdmin(req.user))
    return res
      .status(400)
      .json({ error: "Passwords are managed by Google sign-in" });
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res
      .status(400)
      .json({ error: "current_password and new_password are required" });
  if (new_password.length < 6)
    return res
      .status(400)
      .json({ error: "New password must be at least 6 characters" });
  try {
    const r = await db.query("SELECT password_hash FROM users WHERE id=$1", [
      req.user.id,
    ]);
    const user = r.rows[0];
    if (!user || !(await bcrypt.compare(current_password, user.password_hash)))
      return res.status(401).json({ error: "Current password is incorrect" });
    const hash = await bcrypt.hash(new_password, 10);
    // Also clears the first-login flag set by bulk provisioning.
    await db.query(
      "UPDATE users SET password_hash=$1, must_change_password=false WHERE id=$2",
      [hash, req.user.id],
    );
    await logActivity(
      req.user.id,
      "password_changed",
      "auth",
      null,
      req.user.email,
      "Password changed",
      getIP(req),
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
