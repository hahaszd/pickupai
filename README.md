# PickupAI — 24/7 AI Receptionist for Australian Tradies

An AI receptionist that answers inbound calls via Twilio, collects job details in natural conversation, sends SMS lead summaries to the business owner, and provides a dashboard for lead management.

## What's included

- **Real-time AI voice** — speech-to-speech via OpenAI Realtime API (`gpt-realtime-1.5`)
- **Twilio integration** — inbound voice, call recording, media streams, SMS notifications
- **Multi-tenant** — each business gets its own AI personality, trade-specific prompts, and service area rules
- **Owner dashboard** — leads list, lead detail with recordings/transcripts, settings, trial management
- **Admin panel** — tenant management, number provisioning, stats overview, config
- **Stripe integration** — checkout, webhooks, subscription lifecycle, 14-day free trial
- **Demo flow** — hands-free AI-simulated demo + call-it-yourself demo for new signups
- **Landing page** — interactive demo player, revenue calculator, FAQ, pricing

## Quick start

```bash
npm install
cp .env.example .env    # fill in your API keys
npm run dev              # starts on localhost:3000
```

Expose locally with `ngrok http 3000` and set `PUBLIC_BASE_URL` to your public URL.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server (production) |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:e2e` | Run lifecycle integration tests |
| `npm run lint` | Lint with ESLint |

## Project structure

```
src/
  server.ts          — Express app, all routes, middleware
  env.ts             — Environment variable schema (Zod)
  realtime/
    session.ts       — OpenAI Realtime API session, system prompt, tools
  twilio/
    client.ts        — Twilio client singleton
    sms.ts           — SMS formatting and sending
  dashboard/
    pages.ts         — Dashboard HTML pages (SSR)
  admin/
    pages.ts         — Admin panel HTML pages (SSR)
  db/
    db.ts            — SQLite wrapper with PostgreSQL backup
    schema.ts        — Schema DDL and migrations
    repo.ts          — All database operations
  crm/
    index.ts         — CRM export adapters (Airtable, Google Sheets)
public/
  index.html         — Marketing landing page
  demos/             — Pre-recorded demo audio files (16 trade/scenario combos)
scripts/
  test-lifecycle.ts  — Integration test suite (44 tests)
  generate-demos.ts  — Generate demo audio via OpenAI TTS
tests/
  sms.test.ts        — SMS formatting unit tests
  repo.test.ts       — Database helper unit tests
  session.test.ts    — Trade alias resolution tests
docs/
  product-workflow.md        — Product architecture and workflow (English)
  产品工作流程说明.md          — Product architecture and workflow (Chinese)
  tradie-setup-guide.md      — End-user setup guide
  core-pricing-gtm.md        — Pricing strategy
  gtm-playbook.md            — Go-to-market playbook
```

## Environment variables

See `src/env.ts` for the full schema. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `PUBLIC_BASE_URL` | Yes | Your server's public URL |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio auth token |
| `TWILIO_DEFAULT_VOICE_NUMBER` | Yes | Default inbound voice number |
| `TWILIO_SMS_NUMBERS` | Yes | Comma-separated SMS sender numbers |
| `OPENAI_API_KEY` | Yes* | OpenAI API key for voice AI |
| `ADMIN_TOKEN` | No | Admin panel auth token |
| `SQLITE_PATH` | No | Path to SQLite file (default: `./data/app.sqlite`) |
| `OWNER_PHONE_NUMBER` | No | Admin mobile for system alerts |
| `TWILIO_MESSAGING_SERVICE_SID` | No | Twilio Messaging Service SID (alphanumeric sender ID) |
| `TWILIO_ADDRESS_SID` | No | Twilio Address SID (required for AU number purchases) |
| `STRIPE_SECRET_KEY` | No | Stripe secret key (test or live) |
| `STRIPE_PUBLISHABLE_KEY` | No | Stripe publishable key |
| `STRIPE_PRICE_ID` | No | Stripe subscription price ID |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook signing secret |
| `DATABASE_URL` | No | PostgreSQL URL for backup persistence |

*The server starts without `OPENAI_API_KEY` but will log a warning and voice calls will fail.

## Documentation

- [Product workflow](docs/product-workflow.md) — architecture, data flow, deployment (English)
- [产品工作流程说明](docs/产品工作流程说明.md) — architecture, data flow, deployment (Chinese)
- [Tradie setup guide](docs/tradie-setup-guide.md) — customer-facing setup instructions
- [Deployment guide](DEPLOY.md) — deploying to Railway
- [Pricing strategy](docs/core-pricing-gtm.md) — pricing tiers and positioning
- [GTM playbook](docs/gtm-playbook.md) — go-to-market strategy and outreach scripts
