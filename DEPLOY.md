# Deploying to Railway.app

## Prerequisites
- GitHub account + repo with this code pushed
- Railway.app account (free tier works for testing, ~$5/mo for production)
- Twilio account (production, not trial)

---

## Step 1 — Push code to GitHub

```bash
git init
git add .
git commit -m "Initial AI receptionist platform"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

---

## Step 2 — Create a Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Deploy from GitHub repo** → select your repository
3. Railway detects the `Dockerfile` automatically

---

## Step 3 — Add a persistent volume for SQLite

1. In your Railway service, click **New Volume**
2. Set **Mount Path**: `/app/data`
3. This persists the SQLite database across deploys

---

## Step 4 — Set environment variables in Railway

In your service → **Variables**, add:

| Variable | Value |
|---|---|
| `PUBLIC_BASE_URL` | Your Railway public URL — **must be set manually** (e.g. `https://your-app-production.up.railway.app`) |
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token |
| `TWILIO_DEFAULT_VOICE_NUMBER` | Your local geographic number for the default tenant and demo calls (e.g. `+61268000835`) |
| `TWILIO_SMS_NUMBERS` | One or more mobile numbers for SMS notifications, comma-separated (e.g. `+61412000111`) |
| `TWILIO_MESSAGING_SERVICE_SID` | Twilio Messaging Service SID for alphanumeric sender ID (e.g. `MG...`) |
| `TWILIO_ADDRESS_SID` | Twilio Address SID for purchasing AU numbers (e.g. `AD...`) |
| `TWILIO_BUNDLE_SID` | Twilio Regulatory Compliance Bundle SID for AU local numbers (e.g. `BU...`) |
| `OPENAI_API_KEY` | Your OpenAI key |
| `OPENAI_VOICE` | `marin` (or `sage`, `alloy`, etc.) |
| `ADMIN_TOKEN` | A strong random secret (generate with `openssl rand -hex 32`) |
| `SEED_EMAIL` / `SEED_PASSWORD` | Credentials for the first tenant, created only on a boot with an empty `tenants` table. **Both required or seeding is skipped** — there is no default, because the default used to be a working password written in the source. Also required by `npm run test:e2e`, which logs in as this tenant. |
| `AUTO_PROVISION_NUMBERS` | `false` (default) or `true`. **Leave it off.** When off, a completed Stripe checkout starts the trial and stamps the account `awaiting_approval`, the tenant is told their number is being set up, and the owner gets an SMS to approve it at `/admin/users/:id`. It is off because on 2026-09-01 a fraudulent signup — disposable mailbox, US-issued card with an AU billing country — went from account creation to owning a live Australian number in **110 seconds** and used it to receive voice OTP codes. That number was registered to **our** Twilio account and our regulatory identity, so the carrier and ACMA trail led here; the ~$6/month was the smallest part of it. Turn it on when approving signups by hand becomes annoying — and at that point the honest control is verifying the owner's mobile before provisioning, not just flipping this back. |
| `SMS_PROVIDER` | `twilio` (default) or `mobilemessage`. Mobile Message is off by decision as of 2026-07-29 — **the account credit was deliberately zeroed while the project had no customers**, so the API returns 403 on every call and Twilio carries all traffic. Those 403s in the logs are expected, not a fault. Revisit only at a message volume where ~$0.02/msg against Twilio AU's ~$0.05 is worth re-opening the `/mobilemsg/*` surface; one tenant is not it. having the `MOBILE_MSG_*` credentials present is not enough to route traffic through it. Turning it on also turns on the `/mobilemsg/*` webhooks — set `MOBILEMSG_WEBHOOK_SECRET` in the same change. |
| `MOBILEMSG_WEBHOOK_SECRET` | Shared secret for the Mobile Message webhooks, which have no signature scheme of their own. Append `?s=<value>` to **both** callback URLs in the Mobile Message dashboard (`/mobilemsg/sms/incoming` and `/mobilemsg/sms/status`). Setting the var without updating the dashboard drops inbound SMS; updating the dashboard without setting the var does nothing. While unset the endpoints accept unauthenticated writes to `prospects` and `outreach_log` — the ACMA consent trail — and log a warning on every hit. |
| `OWNER_PHONE_NUMBER` | Admin mobile for system alerts (e.g. `+61412000000`) |
| `TWILIO_VALIDATE_SIGNATURE` | `true` |
| `SQLITE_PATH` | `/app/data/app.sqlite` |
| `PORT` | `3000` |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_live_...` or `pk_test_...`) |
| `STRIPE_PRICE_ID` | Stripe subscription price ID |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `DATABASE_URL` | PostgreSQL URL (e.g. free Neon). Strongly recommended — see "Persistence" below. Without it the `/app/data` volume from Step 3 is mandatory. |
| `OPENAI_REALTIME_MODEL` | Optional. Defaults to `gpt-realtime-2.1`. Set `gpt-realtime-2` or `gpt-realtime-1.5` to roll back **without redeploying** — changing this variable is the fastest way to undo a voice regression |
| `OPENAI_REALTIME_REASONING_EFFORT` | Optional. `low` (default) is OpenAI's recommendation for live voice |
| `MOBILE_MSG_API_USER` / `MOBILE_MSG_API_PASSWORD` / `MOBILE_MSG_SENDER` | Optional. Set all three to route outbound SMS via Mobile Message instead of Twilio |
| `MOBILE_MSG_OPT_OUT_LINK` | Optional but expected in production — appends the hosted opt-out link to every SMS |
| `GA_MEASUREMENT_ID` | Optional. GA4 measurement ID |
| `GOOGLE_SITE_VERIFICATION` | Optional but needed before Search Console will report anything. The token from the "HTML tag" method — the content value only, not the whole tag. Kept in env rather than committed: it is an ownership credential. |
| `DEMO_POOL_NUMBERS` / `DEMO_POOL_NUMBER_SID` | Optional. Numbers reserved for the call-it-yourself demo |
| `OUTREACH_SENDER_LEGAL_NAME` / `OUTREACH_SENDER_CONTACT_EMAIL` / `OUTREACH_UNSUBSCRIBE_SECRET` | **All three required before any marketing email can be sent.** The send path refuses loudly until they are set; nothing else breaks without them. `OUTREACH_SENDER_CONTACT_EMAIL` must be a **monitored** mailbox — it is also the reply-based unsubscribe path under s 18, so a `noreply@` address is rejected at send time |
| `OUTREACH_SENDER_TRADING_NAME` / `OUTREACH_SENDER_ABN` / `OUTREACH_SENDER_CONTACT_PHONE` / `OUTREACH_SENDER_POSTAL_ADDRESS` | Optional, and all of them appear in the message. s 17 asks for clear and accurate identification of the authorising entity; more real detail is strictly better |

> ⚠️ **`OUTREACH_UNSUBSCRIBE_SECRET` is effectively permanent.** Unsubscribe links are HMACs over it, so rotating it invalidates every link in every email already sent — which breaks s 18 compliance retroactively for messages already in people's inboxes. Set it once, before the first campaign, and never change it.

### Required for safe shutdown — do not skip

| Variable | Value | Why |
|---|---|---|
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | `15` | **Railway allows 0 seconds by default.** Without this the app is SIGKILLed and its shutdown handler never runs, so recent writes and every in-progress call's details are lost on each deploy. |
| `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS` | `0` | Stops the new instance from loading the database while the old one is still writing. With overlap left on, the new instance's first flush silently overwrites everything the old one saved on the way out. |

These two are what make the graceful-shutdown code in `src/server.ts` do
anything at all. Setting `OVERLAP_SECONDS=0` costs roughly **30–60 seconds of
downtime per deploy** — that is the deliberate trade in
[ADR-0001](docs/adr/0001-whole-blob-persistence-and-deferred-migration.md):
durability over availability, because a lost lead is invisible to the customer
and a brief outage is not.

Prefer off-peak deploys, but treat that as discipline rather than protection —
after-hours emergency answering is a paid-for feature, and crash restarts happen
at any hour regardless.

**Keep the service at 1 replica.** Scaling up corrupts data silently instead of
failing loudly.

---

## Step 5 — Get your Railway URL

After deploy, Railway gives you a URL like `https://your-app-production.up.railway.app`.

Set `PUBLIC_BASE_URL` to this URL in Railway variables (it is not set automatically).

---

## Step 6 — Point Twilio to your Railway URL

In the Twilio console, for your phone number:
- **Voice webhook**: `https://your-app.up.railway.app/twilio/voice/incoming` (HTTP POST)
- **Status callback**: `https://your-app.up.railway.app/twilio/voice/status` (HTTP POST)
- **Recording callback**: `https://your-app.up.railway.app/twilio/voice/recording` (HTTP POST)

---

## Step 7 — Customer onboarding

New customers sign up through the self-service flow:

1. They visit `https://your-app.up.railway.app/dashboard/signup`
2. They fill in their business details, email, and password
3. They complete payment via Stripe Checkout (14-day free trial)
4. The system automatically purchases an AU landline number and assigns it
5. The customer receives an SMS with their number and call-forwarding instructions

Alternatively, admins can create tenants manually via the Admin API:

```bash
curl -X POST https://your-app.up.railway.app/admin/tenants \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  -d '{
    "name": "Gary'\''s Plumbing",
    "trade_type": "plumber",
    "ai_name": "Olivia",
    "twilio_number": "+61268000835",
    "owner_phone": "+61420555555",
    "owner_email": "gary@example.com",
    "password": "secure-password-here"
  }'
```

---

## Step 8 — Log in to the owner dashboard

Navigate to `https://your-app.up.railway.app/dashboard/login` and sign in with the email + password.

---

## Adding a new customer (tenant)

For most customers, the self-service signup handles everything automatically (number purchase, webhook configuration, welcome SMS). Admins can monitor onboarding status and intervene via the admin panel at `/admin`.

For manual onboarding:
1. Use the admin panel's auto-provision feature (one-click number purchase + assignment)
2. Or run the `POST /admin/tenants` API call above with their details
3. Give them their dashboard login URL + credentials

---

## Persistence — how it actually works

There is no separate "migrate to PostgreSQL" step; `DATABASE_URL` already
switches the backing store. `src/db/db.ts` runs SQLite (sql.js) **in memory**
and persists the whole database as a single exported blob:

- **`DATABASE_URL` unset** — blob is written to `SQLITE_PATH` on disk. This is
  the local-dev path, and on Railway it requires the `/app/data` volume from
  Step 3 or every deploy wipes the database.
- **`DATABASE_URL` set** — blob is written to one `sqlite_blob` row in
  PostgreSQL (a free Neon database is enough). Survives container restarts
  without a volume. This is the recommended production setup.

### Which Neon project this actually is

Worth writing down, because getting it wrong cost a session. The Neon account
`hahaszd@gmail.com` holds **two organisations**, and PickupAI is not in the one
you land on from a Vercel-flavoured link:

| | PickupAI | the other one |
|---|---|---|
| org | `hahaszd@gmail.com` | `Vercel: hahaszd's projects` |
| project | **`pickupai`** | `neon-fuchsia-ocean` (Council Beacon) |
| endpoint | **`ep-long-mountain-a75ui4v2`** | `ep-small-meadow-a72xuvz7` |

Neon hostnames carry the endpoint id, never the project display name, so the
only way to match a console page to a connection string is that endpoint. Usage
alerts and the 5 GB free network-transfer allowance are **per project**: a
suspend on one does not touch the other. Confirm the endpoint before acting on
any Neon email.

### The multi-instance caveat

Every flush overwrites the entire blob. If you scale Railway past **one
instance**, concurrent writers silently clobber each other's rows.

Two consequences:

1. Keep the service at 1 replica unless you have deliberately moved the
   affected tables off the blob.
2. Append-only, high-write tables (funnel events, outreach logs) are written
   **directly to PostgreSQL** through `db.pg`, bypassing the blob. See
   `/api/funnel/event` in `src/server.ts` for the pattern to copy.

A genuine move to per-table PostgreSQL (`pg` or `drizzle-orm`) is the fix when
single-instance stops being enough — the schema is simple, but it is a real
migration, not a config flag.
