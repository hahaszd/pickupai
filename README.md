# PickupAI — 24/7 AI Receptionist for Australian Tradies

An AI receptionist that answers inbound calls via Twilio, collects job details in natural conversation, sends SMS lead summaries to the business owner, and provides a dashboard for lead management.

## What's included

- **Real-time AI voice** — speech-to-speech via OpenAI Realtime API (`gpt-realtime-2.1`,
  overridable per-deploy with `OPENAI_REALTIME_MODEL`)
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

`npm run check` (typecheck + lint + test) is the pre-commit gate. CI runs the
same command, plus `npm run build` and a Docker build of the deploy image, on
every push and PR to `main` — see `.github/workflows/ci.yml`.

Expose locally with `ngrok http 3000` and set `PUBLIC_BASE_URL` to your public URL.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` (src only) |
| `npm start` | Run compiled server (production) |
| `npm run typecheck` | Type-check `src/`, `tests/` and `scripts/*.ts` (`build` covers only `src/`) |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:e2e` | Lifecycle integration suite — needs a running server and real credentials |
| `npm run lint` | Lint with ESLint |
| `npm run lint:fix` | Lint and auto-fix |
| `npm run check` | typecheck + lint + test — the pre-commit gate |

## Project structure

```
src/
  server.ts          — Express app, all routes, middleware, WebSocket, cron sweeps
  env.ts             — Environment variable schema (Zod), parsed at import time
  silence.ts         — Silence-MP3 generation and speaker-change delays
  realtime/
    session.ts       — OpenAI Realtime API session, system prompt, tools
    tool-call-guards.ts — Validation of model tool calls before they hit the DB
  twilio/
    client.ts        — Twilio client singleton
    sms.ts           — SMS formatting and sending
    twiml.ts         — TwiML builders
    verify.ts        — Webhook signature verification
    flow.ts, state.ts, recording.ts — Call flow, per-call state, recordings
  sms/
    mobile-message.ts — Mobile Message provider (cheaper AU SMS than Twilio)
  chat/
    system-prompt.ts — Website chatbot prompt
  dashboard/
    pages.ts         — Dashboard HTML pages (SSR template strings)
  admin/
    pages.ts         — Admin panel HTML pages (SSR template strings)
  db/
    db.ts            — In-memory sql.js with whole-blob persistence to disk or Postgres
    schema.ts        — Schema DDL and migrations
    repo.ts          — All database operations
  crm/
    index.ts         — CRM export adapters (Airtable, Google Sheets)
  analytics/
    ga.ts            — GA4 gtag injection
  testing/
    inbound-scenarios.ts — Inbound call scenario matrix and capture scoring
  utils/
    phone.ts, time.ts, email.ts
public/
  index.html         — Marketing landing page
  demos/             — Pre-recorded demo audio files (16 trade/scenario combos)
scripts/
  test-lifecycle.ts  — Integration test suite (44 tests)
  generate-demos.ts  — Generate demo audio via OpenAI TTS
  collect-au-tradies.mjs               — Lead-gen orchestrator (free by default)
  scrape-{hipages,oneflare,truelocal,localsearch,yellowpages}.ts — Free directories
  scrape-licenses-{nsw,vic,qld}.ts     — Free state license registers
  scrape-abn-by-anzsic.mjs             — Free ABR (requires free GUID)
  scrape-industry-associations.mjs     — Free trade-association member directories
  recover-mobiles-from-websites.mjs    — Free contact-page crawler
  enrich-prospects-from-website.mjs    — Find website (DuckDuckGo, free) + crawl
tests/
  setup-env.ts       — Populates a complete env before any test imports src/env.ts
  sms.test.ts        — SMS formatting unit tests
  repo.test.ts       — Database helper + cross-tenant isolation tests
  session.test.ts    — Trade aliases, system prompt, time context
  phone.test.ts      — AU phone normalisation
  time.test.ts       — Business-hours / timezone helpers
  inbound-scenarios.test.ts    — Scenario matrix integrity
  realtime-tool-call-guards.test.ts — Model tool-call validation
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
| `TWILIO_BUNDLE_SID` | No | Twilio Regulatory Compliance Bundle SID (required for AU local number purchases from June 2026) |
| `STRIPE_SECRET_KEY` | No | Stripe secret key (test or live) |
| `STRIPE_PUBLISHABLE_KEY` | No | Stripe publishable key |
| `STRIPE_PRICE_ID` | No | Stripe subscription price ID |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook signing secret |
| `DATABASE_URL` | No | PostgreSQL URL — persistence + direct writes for high-concurrency tables |
| `OPENAI_REALTIME_MODEL` | No | Realtime model, default `gpt-realtime-2.1`; set `gpt-realtime-2` or `gpt-realtime-1.5` to roll back without redeploying |
| `OPENAI_REALTIME_REASONING_EFFORT` | No | `minimal`–`xhigh`, default `low` (ignored by 1.5) |
| `MOBILE_MSG_API_USER` / `MOBILE_MSG_API_PASSWORD` / `MOBILE_MSG_SENDER` | No | When all set, all outbound SMS moves from Twilio (~$0.10) to Mobile Message (~$0.02) |
| `MOBILE_MSG_OPT_OUT_LINK` | No | Hosted opt-out shortlink appended to every outbound SMS |
| `GA_MEASUREMENT_ID` | No | GA4 ID; injects gtag.js when set |
| `DEMO_POOL_NUMBERS` / `DEMO_POOL_NUMBER_SID` | No | AU numbers reserved for the call-it-yourself demo |
| `TEST_OVERRIDE_PHONE` | No | Single audited number that bypasses SMS suppression — operator smoke tests only |

*The server starts without `OPENAI_API_KEY` but will log a warning and voice calls will fail.

`src/env.ts` is parsed at import time and throws on a missing required var, so
the server will not boot with an incomplete `.env`. Tests get a synthetic env
from `tests/setup-env.ts`.

## Lead generation (free)

Every lead source is free. The orchestrator runs Hipages, Oneflare,
TrueLocal, and Localsearch by default for one trade (plumber). Multi-trade
is opt-in via `--trades`.

```bash
# Single trade (default)
node scripts/collect-au-tradies.mjs

# Multiple trades
node scripts/collect-au-tradies.mjs --trades plumber,electrician,roofer,handyman

# Add the licensed-tradie universe (needs a free GUID for ABR):
ABN_GUID=<your-guid> node scripts/scrape-abn-by-anzsic.mjs
node scripts/recover-mobiles-from-websites.mjs --apply

# Enrich license-imported rows (DuckDuckGo + website crawl):
node scripts/enrich-prospects-from-website.mjs --apply
```

See [`docs/marketing-plan-nsw.md`](docs/marketing-plan-nsw.md) section 2
for the full source comparison.

## Documentation

- [Product workflow](docs/product-workflow.md) — architecture, data flow, deployment (English)
- [产品工作流程说明](docs/产品工作流程说明.md) — architecture, data flow, deployment (Chinese)
- [Tradie setup guide](docs/tradie-setup-guide.md) — customer-facing setup instructions
- [Deployment guide](DEPLOY.md) — deploying to Railway
- [Pricing strategy](docs/core-pricing-gtm.md) — pricing tiers and positioning
- [GTM playbook](docs/gtm-playbook.md) — go-to-market strategy and outreach scripts
- [NSW marketing plan](docs/marketing-plan-nsw.md) — lead sources, budget, compliance
