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
| `OPENAI_API_KEY` | Your OpenAI key |
| `OPENAI_VOICE` | `marin` (or `sage`, `alloy`, etc.) |
| `ADMIN_TOKEN` | A strong random secret (generate with `openssl rand -hex 32`) |
| `OWNER_PHONE_NUMBER` | Admin mobile for system alerts (e.g. `+61412000000`) |
| `TWILIO_VALIDATE_SIGNATURE` | `true` |
| `SQLITE_PATH` | `/app/data/app.sqlite` |
| `PORT` | `3000` |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_live_...` or `pk_test_...`) |
| `STRIPE_PRICE_ID` | Stripe subscription price ID |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |

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

## Upgrading from SQLite to PostgreSQL (when you have 20+ customers)

1. Add a Railway PostgreSQL service to your project
2. Switch the DB layer from `sql.js` to `pg` or `drizzle-orm`
3. Migration is straightforward since the schema is simple
