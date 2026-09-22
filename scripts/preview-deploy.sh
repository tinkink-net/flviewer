#!/usr/bin/env sh
#
# Publish the playground to a throwaway Cloudflare Worker for human review.
#
# Uses `wrangler deploy --temporary` (Wrangler >= 4.102): Cloudflare provisions
# an anonymous temporary preview account, prints a claim URL, and deletes the
# account and its Worker after 60 minutes unless someone claims it. No Cloudflare
# login and no account signup are required.
#
# The caller's real Cloudflare credentials are never used: `--temporary` only
# works on an unauthenticated session, so we point wrangler at an isolated config
# HOME. Redeploys within the 60-minute window reuse the same temporary account.
#
# Usage:
#   scripts/preview-deploy.sh [worker-name]
#
set -eu

NAME="${1:-flviewer-preview}"
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
STATE="${TMPDIR:-/tmp}/flviewer-preview"
HOME_DIR="$STATE/home"
EXPIRES_AT=$(( $(date +%s) * 1000 + 60 * 60 * 1000 ))

if ! command -v wrangler >/dev/null 2>&1; then
  echo "wrangler not found. Install Wrangler >= 4.102.0: npm i -g wrangler@latest" >&2
  exit 1
fi

echo "==> Building the playground"
(cd "$ROOT" && pnpm exec vp build)

mkdir -p "$HOME_DIR"

cat > "$STATE/worker.mjs" <<'WORKER'
// Preview wrapper: serve the static playground, and keep returning 410 Gone
// after the 60-minute window (Cloudflare deletes the account around the same
// time; this makes the invalidation visible either way).
export default {
  async fetch(request, env) {
    if (Number(env.EXPIRES_AT) && Date.now() > Number(env.EXPIRES_AT)) {
      return new Response("This flviewer preview has expired.\n", {
        status: 410,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
WORKER

cat > "$STATE/wrangler.jsonc" <<EOF
{
  "name": "$NAME",
  "main": "worker.mjs",
  "compatibility_date": "$(date +%Y-%m-%d)",
  "workers_dev": true,
  "assets": {
    "directory": "$ROOT/playground/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": true
  },
  "vars": { "EXPIRES_AT": "$EXPIRES_AT" }
}
EOF

echo "==> Deploying to an anonymous temporary Cloudflare account (expires in 60 min)"
echo "    (config isolated in $HOME_DIR — your own wrangler login is untouched)"
HOME="$HOME_DIR" wrangler deploy --temporary --cwd "$STATE"

cat <<EOF

Share the Worker URL above. A browser may first show Cloudflare's
"Verify you are human" check on a temporary workers.dev host.

The deployment and its temporary account self-delete after 60 minutes.
To keep it, open the Claim URL printed above before then. Re-running this
script while the window is open reuses the same temporary account.
EOF
