# Security Note — Hardcoded Credentials in `scripts/`

## Summary

Several diagnostic/admin scripts in `scripts/` historically embedded production
credentials directly in source. As part of Phase 6 of the SMS-funnel
remediation, the following files were refactored to read from environment
variables instead:

- `scripts/send-sms-batch.mjs` — admin token, base URL
- `scripts/check-twilio-status.mjs` — Twilio account SID + auth token
- `scripts/check-inbound-sms.mjs` — Twilio account SID + auth token
- `scripts/check-responses.mjs` — Neon Postgres URL

## Still hardcoded (not yet refactored — owner to action)

A grep against the same Twilio SID, Twilio auth token, Twilio API key, and
Neon Postgres password (the four production credentials referenced by the
already-refactored files above) finds them inside:

- `scripts/enrich-prospects-from-website.mjs`
- `scripts/collect-au-tradies.mjs`
- `scripts/count-prospects.mjs`
- `scripts/check-caller.mjs`
- `scripts/check-inbound-calls.mjs`
- `scripts/check-queued.mjs`
- `scripts/query-prospects.mjs`
- `scripts/check-twilio-billing.mjs`
- `scripts/fix-stuck-sms.mjs`
- `scripts/fix-stop-prospects.mjs`
- `scripts/recover-mobiles-from-websites.mjs`
- `scripts/normalize-and-mark-prospects.mjs`

These weren't touched as part of the SMS-funnel work — they're broader admin
utilities owned by the operator. They should be cleaned up before the repo
is shared with a contractor or pushed to a public host.

## Recommended actions, in priority order

1. **Rotate all three credentials NOW**, in production:
   - Twilio: regenerate the auth token in the Twilio console.
   - Neon: rotate the database password (or rotate the entire role).
   - PickupAI admin token: regenerate `ADMIN_TOKEN` in Railway env vars.

   Even once you delete the strings from source, they're potentially in your
   shell history, terminal logs, and IDE swap files. Rotation is the only
   safe move.

2. **Add `.env*` and any local credential files to `.gitignore`**. Verify none
   of `scripts/*.mjs` were ever committed with credentials by running (replace
   the placeholders with the actual values you find in your local working
   copy of the scripts listed above):

   ```bash
   git log --all --source --oneline -S '<your-twilio-sid>' -- scripts/
   git log --all --source --oneline -S '<your-neon-password-fragment>' -- scripts/
   ```

   If anything comes back, the credentials are in history and rotation in
   step 1 is doubly important. (Note: do NOT paste the actual secrets into
   any file you commit — GitHub push protection will reject it, and even if
   it didn't, the secret would now be in two places instead of one.)

3. **Refactor the remaining 12 scripts** to read from `process.env` the same
   way as the four already-refactored ones. The common pattern is:

   ```javascript
   const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
   const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
   if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
     console.error("ERROR: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars required.");
     process.exit(1);
   }
   ```

4. **Use a local `.env.local` file** loaded with `dotenv` (or `node --env-file`
   on Node 20+) so you don't have to type credentials into the shell every
   time. Add the file to `.gitignore`.

## Why this matters

These are PRODUCTION credentials. With them, anyone who reads the repo can:

- Send SMS as you (Twilio auth token) — direct money loss + ACMA exposure.
- Read your entire customer database (Neon URL) — every tenant, lead, call
  transcript, SMS body, and prospect phone number.
- Take administrative actions on the live PickupAI app (admin token) — modify
  tenants, send arbitrary SMS, delete data.

The blast radius if any one of these leaks is significant. Fix today, not
"when we have time".
