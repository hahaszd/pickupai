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
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token |
| `TWILIO_VOICE_NUMBER` | Your Twilio number (e.g. `+61468000835`) |
| `TWILIO_SMS_NUMBER` | Same as VOICE_NUMBER or a dedicated SMS number |
| `OPENAI_API_KEY` | Your OpenAI key |
| `OPENAI_VOICE` | `marin` (or `sage`, `alloy`, etc.) |
| `ADMIN_TOKEN` | A strong random secret (generate with `openssl rand -hex 32`) |
| `TWILIO_VALIDATE_SIGNATURE` | `true` |
| `SQLITE_PATH` | `/app/data/app.sqlite` |
| `PORT` | `3000` |

Railway sets `PUBLIC_BASE_URL` for you — or you can set it manually after you get the domain.

---

## Step 5 — Get your Railway URL

After deploy, Railway gives you a URL like `https://your-app-production.up.railway.app`.

Set `PUBLIC_BASE_URL` to this URL in Railway variables.

---

## Step 6 — Point Twilio to your Railway URL

In the Twilio console, for your phone number:
- **Voice webhook**: `https://your-app.up.railway.app/twilio/voice/incoming` (HTTP POST)
- **Status callback**: `https://your-app.up.railway.app/twilio/voice/status` (HTTP POST)
- **Recording callback**: `https://your-app.up.railway.app/twilio/voice/recording` (HTTP POST)

---

## Step 7 — Create your first tenant

Use the Admin API to register your business:

```bash
curl -X POST https://your-app.up.railway.app/admin/tenants \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  -d '{
    "name": "Gary'\''s Plumbing",
    "trade_type": "plumber",
    "ai_name": "Olivia",
    "twilio_number": "+61468000835",
    "owner_phone": "+61420555555",
    "owner_email": "gary@example.com",
    "password": "secure-password-here"
  }'
```

---

## Step 8 — Log in to the owner dashboard

Navigate to `https://your-app.up.railway.app/dashboard/login` and sign in with the email + password you set above.

---

## Adding a new customer (tenant)

For each new tradie business you onboard:
1. Buy/provision a Twilio number for them
2. Point that Twilio number's webhook to your Railway URL
3. Run the `POST /admin/tenants` API call above with their details
4. Give them their dashboard login URL + credentials

---

## Upgrading from SQLite to PostgreSQL (when you have 20+ customers)

1. Add a Railway PostgreSQL service to your project
2. Switch the DB layer from `sql.js` to `pg` or `drizzle-orm`
3. Migration is straightforward since the schema is simple
