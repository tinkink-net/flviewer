# Preview deploys (ephemeral Cloudflare Worker)

How to hand someone a live, public flviewer playground to review — without
deploying into anyone's Cloudflare account and without leaving anything behind.

## TL;DR

```bash
scripts/preview-deploy.sh                 # -> https://<worker>.<account>.workers.dev
scripts/preview-deploy.sh my-branch-name  # optional Worker name
```

The script builds the playground, deploys it to an **anonymous temporary
Cloudflare account**, and prints the live URL plus a claim URL. The deployment
stays live for **60 minutes** and is then deleted automatically unless claimed.

## How it works

`wrangler deploy --temporary` (Wrangler **>= 4.102.0**) is Cloudflare's
agent-oriented deploy path:

- Wrangler solves a proof-of-work challenge and provisions a **temporary preview
  account** — no signup, no `wrangler login`, no API token.
- It deploys the Worker (including **Workers Static Assets**, which is what the
  playground uses) and prints:
  - the live URL, e.g. `https://flviewer-preview.<temp-account>.workers.dev`,
  - a **claim URL** (`https://dash.cloudflare.com/claim-preview?claimToken=…`).
- The account, Worker and supported resources are **deleted after 60 minutes**
  unless a human opens the claim URL and signs in / up to make the account
  permanent. Redeploying inside the window reuses the same temporary account.

Because the flag only works on an **unauthenticated** session, the script runs
Wrangler with an isolated config `HOME`
(`${TMPDIR:-/tmp}/flviewer-preview/home`). Your own `~/.wrangler` login and any
`CLOUDFLARE_API_TOKEN` are never touched, and nothing lands in your account.

`scripts/preview-deploy.sh` also wraps the static site in a tiny Worker that
serves the assets and returns **410 Gone** after the same 60-minute deadline,
so a stale link fails loudly even before the account is reaped.

## What reviewers should know

- **Human check.** A temporary `workers.dev` host may show Cloudflare's
  **"Verify you are human"** (Turnstile) interstitial on first load. Tick it and
  the playground loads. Automation/headless browsers usually cannot pass it.
- **It is public.** Anyone with the URL can view it until it expires. Treat the
  claim URL like a credential — whoever opens it first can claim the account.
- **60 minutes only.** Re-run the script to get a fresh window; the previous
  link stops working.
- Temporary accounts support a limited product set (Workers, Static Assets, KV,
  D1, Durable Objects, Hyperdrive, Queues, TLS). That is more than enough here.

## Manual equivalent

If you need to do it by hand, be sure you are logged out of Wrangler first
(`wrangler logout`), or point `HOME` at a scratch directory as the script does:

```bash
pnpm exec vp build
wrangler deploy --temporary --cwd <dir-with-wrangler.jsonc-and-assets>
```

Cloudflare also exposes the same flow as a REST API
(`POST /client/v4/provisioning/previews`) if a backend wants to control it.

## References

- Claim deployments (temporary accounts) — <https://developers.cloudflare.com/workers/platform/claim-deployments/>
- Temporary accounts for AI agents (changelog) — <https://developers.cloudflare.com/changelog/post/2026-06-19-temporary-accounts-for-agents/>
- Workers Static Assets — <https://developers.cloudflare.com/workers/static-assets/>
