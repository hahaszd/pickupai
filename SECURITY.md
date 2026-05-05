# Security Note — Hardcoded Credentials in `scripts/`

## Status as of May 2026

The `scripts/` folder previously embedded production credentials (Neon
Postgres URL with password, Twilio account SID + auth token, PickupAI admin
token) directly in source. **All known instances have now been removed from
the working tree.** History is a separate matter (see "Known historical leak"
below).

### Refactored to env-only

These read from `process.env` and hard-fail with a clear error if the var is
missing:

- `scripts/send-sms-batch.mjs` — admin token, base URL
- `scripts/check-twilio-status.mjs` — Twilio account SID + auth token
- `scripts/check-inbound-sms.mjs` — Twilio account SID + auth token
- `scripts/check-responses.mjs` — Neon Postgres URL
- `scripts/diagnose-batch-1.mjs` — Neon Postgres URL
- `scripts/enrich-prospects-from-website.mjs` — Neon Postgres URL
- `scripts/collect-au-tradies.mjs` — Neon Postgres URL
- `scripts/recover-mobiles-from-websites.mjs` — Neon Postgres URL
- `scripts/normalize-and-mark-prospects.mjs` — Neon Postgres URL

The pattern in every refactored script:

```javascript
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL env var required. Run via: node --env-file=.env scripts/<name>.mjs");
  process.exit(1);
}
```

The `npm run` aliases for the 4 prospect-pipeline scripts (`prospects:cleanup`,
`prospects:recover-mobiles`, `prospects:enrich`, `leads:collect-au`, plus their
`:apply` variants) prepend `node --env-file=.env` so credentials are loaded
from the gitignored local `.env` file automatically.

### Deleted (never tracked)

These were untracked one-off diagnostic scripts that overlapped with the
existing `/admin/*` UI or with `diagnose-batch-1.mjs`. Removed in commit
`3a45cdc` rather than refactored:

- `scripts/check-caller.mjs`
- `scripts/check-inbound-calls.mjs`
- `scripts/check-queued.mjs`
- `scripts/check-twilio-billing.mjs`
- `scripts/count-prospects.mjs`
- `scripts/fix-stop-prospects.mjs`
- `scripts/fix-stuck-sms.mjs`
- `scripts/query-prospects.mjs`

## Known historical leak — Neon Postgres password (rotated)

The Neon `neondb_owner` password was leaked into git history in commits
`5b0cca4` and `2c4a572` (Apr 29, 2026) via the four prospect-pipeline scripts
listed above. Those commits were pushed to `origin/main` on the public repo
`github.com/hahaszd/pickupai`, which means the password was world-readable for
~6 days.

**Mitigation taken:** The Neon password was rotated twice on May 5, 2026
(once after discovery; once again because the first rotation value was
inadvertently pasted into a chat transcript). Both old passwords are dead.

**Residual exposure:** The first rotated password is still queryable in the
public git history via `git log -p`. Anyone who scraped the repo before
rotation can no longer use that credential to access the database, but the
*string* is still visible. Consider scrubbing history with `git filter-repo`
if the public visibility of the (now-defunct) string is a concern — note that
this rewrites history, requires force-push, and breaks any existing clones.

**No leak found for:** Twilio account SID, Twilio auth token, PickupAI admin
token. Those credentials only ever lived in untracked files (now deleted).

## Recommended hygiene going forward

1. **Never paste credentials into chat, comments, commit messages, or any
   tracked file.** Local `.env` and the production secret store (Railway env
   vars) are the only places. `.env` is in `.gitignore`.

2. **Verify with `git log -S` before pushing anything that contains a `pg`,
   `twilio`, or `process.env.X = "..."` literal.** Cheap, takes 2 seconds.

3. **Use `node --env-file=.env`** (Node 20+ built-in) for any script that
   needs secrets, so the `.env` is the single source of truth and forgetting
   it produces a clean failure rather than a silent prod-write.

4. **If a credential ever does leak**, rotate IMMEDIATELY at the dashboard
   (Twilio Console for SMS auth tokens, Neon Console for DB roles, Railway
   env vars for the app's own admin token). Code changes alone never undo
   exposure — only rotation does.

## Why this matters

These are PRODUCTION credentials. With them, anyone who reads the repo can:

- Send SMS as you (Twilio auth token) — direct money loss + ACMA exposure.
- Read your entire customer database (Neon URL) — every tenant, lead, call
  transcript, SMS body, and prospect phone number.
- Take administrative actions on the live PickupAI app (admin token) — modify
  tenants, send arbitrary SMS, delete data.

The blast radius if any one of these leaks is significant. Treat secret
hygiene as a daily practice, not a quarterly cleanup.
