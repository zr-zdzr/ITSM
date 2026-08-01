#!/usr/bin/env bash
# One-step helper: paste a fresh Groq API key, update .env, restart backend, verify.
# The key is read silently (not echoed, not stored in shell history).
# Usage:  ./apply-groq-key.sh
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERROR: .env not found in $(pwd)" >&2
  exit 1
fi

printf "Paste the new Groq API key (starts with gsk_) and press Enter: "
read -rs KEY
echo

if [ -z "${KEY:-}" ]; then
  echo "ERROR: no key entered — aborting." >&2
  exit 1
fi
case "$KEY" in
  gsk_*) : ;;
  *) echo "ERROR: key does not start with 'gsk_' — aborting (nothing changed)." >&2; exit 1 ;;
esac

# Back up .env before editing (timestamped, kept local — .env is gitignored)
cp .env ".env.bak.$(date +%Y%m%d-%H%M%S)"

# Replace the GROQ_API_KEY line in-place without exposing the value on the command line.
KEY="$KEY" node -e '
  const fs = require("fs");
  let env = fs.readFileSync(".env", "utf8");
  const before = env;
  env = env.replace(/^(GROQ_API_KEY=).*$/m, "$1" + process.env.KEY);
  if (env === before) { console.error("ERROR: GROQ_API_KEY line not found in .env"); process.exit(1); }
  fs.writeFileSync(".env", env);
'
unset KEY
echo "✓ .env updated (GROQ_API_KEY replaced). Backup saved as .env.bak.*"

echo "Recreating backend so it loads the new .env (also activates SESSION_SECRET; active sessions will be logged out)..."
# NOTE: 'restart' does NOT re-read env vars from .env — the container must be recreated.
docker compose up -d --force-recreate backend
echo "Waiting for backend to come up..."
for i in $(seq 1 20); do
  if curl -fsS -o /dev/null http://localhost/api/health 2>/dev/null; then break; fi
  sleep 1
done

echo
echo "=== Verifying the new key against Groq (live call) ==="
docker compose exec -T backend sh -c '
  wget -q -O- --header="Authorization: Bearer $GROQ_API_KEY" \
    https://api.groq.com/openai/v1/models 2>/dev/null | head -c 200
' && echo "" && echo "✓ Groq accepted the key (models list returned above)." \
  || echo "⚠ Could not verify via models endpoint — open the ChatBot widget to confirm."
