/**
 * Google Workspace SSO (support-module-architecture.md §6).
 *
 * Dormant until GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET exist in the
 * environment. Once they do, Google becomes the only way in for everyone
 * except the env-seeded break-glass admin — local passwords stop being
 * accepted without any code change or redeploy beyond setting the vars.
 */
const db = require("../config/db");
const { logActivity } = require("./activity");

const ALLOWED_DOMAIN = (process.env.GOOGLE_ALLOWED_DOMAIN || "bykea.com")
  .toLowerCase()
  .replace(/^@/, "");

// Read at call time, not import time, so behavior follows the environment
// and tests can exercise both modes.
function googleEnabled() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}

/** The one local account allowed to keep a password once SSO is live. */
function isBreakGlassAdmin(user) {
  return user.email === (process.env.ADMIN_USERNAME || "admin");
}

class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // short slug surfaced as /login?error=<code>
  }
}

/**
 * Turn a verified Google profile into a logged-in-able user row.
 * Strict order: reject wrong domain → match by google_id → link by email →
 * auto-provision as employee. The hd param on the auth request is advisory
 * only; this server-side check is the real gate.
 */
async function handleGoogleProfile(profile) {
  const email = (profile.emails?.[0]?.value || "").toLowerCase().trim();
  const verified = profile.emails?.[0]?.verified !== false;
  const googleId = profile.id;
  const name = profile.displayName || email;
  const avatar = profile.photos?.[0]?.value || null;

  if (!email || !verified)
    throw new AuthError("no_email", "Google returned no verified email");
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`))
    throw new AuthError(
      "domain",
      `Only @${ALLOWED_DOMAIN} accounts may sign in`,
    );

  // 1. Known Google identity.
  let r = await db.query("SELECT * FROM users WHERE google_id=$1", [googleId]);
  let user = r.rows[0];

  // 2. Existing account (provisioned or staff) — link the Google identity.
  if (!user) {
    r = await db.query("SELECT * FROM users WHERE email=$1", [email]);
    user = r.rows[0];
    if (user) {
      // must_change_password belonged to the temp-password flow; once this
      // person signs in with Google there is no local password to change.
      await db.query(
        `UPDATE users SET google_id=$1, avatar_url=COALESCE($2, avatar_url),
                must_change_password=false, updated_at=NOW()
         WHERE id=$3`,
        [googleId, avatar, user.id],
      );
      user.google_id = googleId;
      user.must_change_password = false;
    }
  }

  // 3. First sight of this person — auto-provision a self-service account,
  //    attached to their employee record when one matches by email.
  if (!user) {
    const emp = await db.query(
      "SELECT id, full_name, department, designation FROM employees WHERE LOWER(email)=$1 AND portal_user_id IS NULL",
      [email],
    );
    const e = emp.rows[0];
    r = await db.query(
      `INSERT INTO users (google_id, email, name, avatar_url, role, department, designation, is_active)
       VALUES ($1,$2,$3,$4,'employee',$5,$6,true) RETURNING *`,
      [
        googleId,
        email,
        e?.full_name || name,
        avatar,
        e?.department || null,
        e?.designation || null,
      ],
    );
    user = r.rows[0];
    if (e)
      await db.query("UPDATE employees SET portal_user_id=$1 WHERE id=$2", [
        user.id,
        e.id,
      ]);
    await logActivity(
      user.id,
      "created",
      "users",
      user.id,
      email,
      "Auto-provisioned via Google SSO",
    );
  }

  if (!user.is_active)
    throw new AuthError("deactivated", "Account is deactivated");
  return user;
}

module.exports = {
  googleEnabled,
  isBreakGlassAdmin,
  handleGoogleProfile,
  AuthError,
  ALLOWED_DOMAIN,
};
