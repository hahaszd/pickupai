# PickupAI — Product Workflow & Architecture Overview

A detailed walkthrough of how the product works end-to-end, from onboarding a new tradie to how they access their lead information after every call.

---

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TRADIE ONBOARDING                            │
│  Admin creates account → Tradie sets up call forwarding →           │
│  AI persona configured → Twilio number assigned                     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         LIVE CALL HANDLING                          │
│  Client calls → Forwarded to PickupAI → AI answers via Realtime →  │
│  Lead data collected → Stored in DB → SMS sent to tradie            │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        TRADIE FOLLOW-UP                             │
│  Tradie reads SMS → Logs in to dashboard → Reviews leads →          │
│  Marks job status → Calls client back                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Tradie Onboarding & Setup

### 1.1 Information Collected from the Tradie

Before setting up an account, we need the following from the tradie:

| Field | Example | Purpose |
|---|---|---|
| **Business name** | "Mike's Plumbing" | Used in AI greeting |
| **AI receptionist name** | "Olivia" | Personalises the call experience |
| **Trade type(s)** | "plumber, gasfitter" | Shapes which questions the AI asks |
| **Service area** | "Sydney metro, within 50km of Parramatta" | AI declines out-of-area calls softly |
| **Mobile number** (for SMS alerts) | `+61 412 000 000` | Receives lead SMS after every call |
| **Twilio number** (assigned to this tradie) | `+61 468 000 835` | The number clients call / forward to |
| **Email + Password** | — | Dashboard login credentials |

### 1.2 Admin Creates the Tenant Account

An admin uses the protected Admin API to create the tradie's account:

```
POST /admin/tenants
Authorization: Bearer <ADMIN_TOKEN>

{
  "name": "Mike's Plumbing",
  "ai_name": "Olivia",
  "phone_number": "+61468000835",   ← Twilio number assigned to this tradie
  "owner_phone": "+61412000000",    ← Tradie's personal mobile (for SMS)
  "trade_type": "plumber,gasfitter",
  "service_area": "Sydney metro, within 50km of Parramatta"
}
```

The system:
- Creates a tenant record in the database
- Stores a hashed password for the dashboard
- Associates the Twilio number with the tenant so inbound calls are routed correctly

### 1.3 Tradie Sets Up Call Forwarding

The tradie keeps their existing business number. They configure **conditional call forwarding (no answer)** to the PickupAI Twilio number.

**How it works:**
- Client dials the tradie's regular number
- Phone rings normally for 20 seconds
- If unanswered → the carrier silently redirects to the Twilio number
- PickupAI answers on the tradie's behalf

**Setup method (Australian mobile):**
```
Dial: **61*+61XXXXXXXXX*11*20#
```
*(Full carrier-specific instructions in `tradie-setup-guide.md`)*

---

## Phase 2 — Inbound Call Handling

### 2.1 Call Arrives at Twilio

When a call hits the PickupAI Twilio number, Twilio sends a webhook to the server:

```
POST /twilio/voice/incoming
```

The server:
1. Looks up the tenant by the Twilio `To` number (e.g. `+61468000835`)
2. Loads the tenant's full profile (name, AI name, trade type, service area, etc.)
3. Checks if the caller has called before (caller history lookup by phone number)
4. Returns TwiML instructing Twilio to open a **Media Stream WebSocket** back to the server

```xml
<Response>
  <Connect>
    <Stream url="wss://pickupai.ai-builders.space/media-stream?callSid=CA..."/>
  </Connect>
</Response>
```

### 2.2 Real-Time Audio Bridge

Once the Media Stream is open, the server acts as a **bridge** between Twilio and OpenAI:

```
Twilio (caller audio) ←──WebSocket──→ PickupAI Server ←──WebSocket──→ OpenAI Realtime API
       μ-law 8kHz                                                         PCM 24kHz
```

Audio packets flow in both directions in real time:
- Caller's voice → encoded → sent to OpenAI
- OpenAI's AI voice response → decoded → sent back to caller

### 2.3 System Prompt Construction

Before connecting to OpenAI, the server dynamically builds a **system prompt** tailored to this specific tradie. It includes:

**a) Business Identity**
```
You are Olivia, a friendly AI receptionist for Mike's Plumbing.
```

**b) Trade-Specific Intake Questions**

Based on `trade_type`, the AI knows exactly what to ask. For a plumber:
- Location of the problem (kitchen, bathroom, hot water, etc.)
- Is it urgent / is water actively leaking?
- Do they own or rent?

For an electrician:
- Safety check (power out? burning smell? sparks?)
- Type of work (fault, install, inspection, switchboard)
- Property type

For multi-trade (e.g. "plumber, electrician"), relevant questions from all trades are merged.

**c) Caller History**

If the caller has called before, the prompt includes:
```
This caller has contacted us before. Previous calls:
- 2025-06-01: Leaking tap repair – booked and completed
```
The AI can greet returning customers warmly without re-asking basic details already on file.

**d) Service Area Rules**

```
Service area: Sydney metro, within 50km of Parramatta.
If the caller is outside this area: apologise warmly, explain you don't service
that area, wish them luck finding someone local. Still collect their name and
issue in case circumstances change. Do NOT use the phrase "OUT OF AREA" verbatim.
```

**e) Call Scenario Handling**

The AI is trained to gracefully handle:
- New job enquiries
- Follow-up calls on existing jobs
- Complaints
- Rescheduling requests
- Quote-only requests
- Wrong numbers, spam, telemarketers
- Job applicants, suppliers
- Silent or abusive callers

### 2.4 AI Conversation

The OpenAI Realtime API (`gpt-realtime-mini-2025-12-15`) handles:
- **Speech-to-text** (transcribes the caller in real time)
- **Language understanding** (intent, sentiment, urgency)
- **Response generation** (natural, conversational Australian-accented English)
- **Text-to-speech** (voice: `marin`, low-latency)
- **Semantic VAD** (detects when the caller has finished speaking — supports barge-in)

During the call, when enough information is collected, the AI calls a **function tool**:

```json
{
  "function": "save_lead",
  "arguments": {
    "caller_name": "Sarah",
    "address": "12 Main St, Parramatta NSW 2150",
    "issue": "Burst pipe under kitchen sink, water actively leaking",
    "urgency": "emergency",
    "preferred_time": "ASAP"
  }
}
```

### 2.5 Lead Saved to Database

On `save_lead`, the server:
1. Creates or updates a `leads` record in SQLite, linked to the tenant
2. Creates or updates a `calls` record with the call transcript and metadata
3. Sets `lead_status = 'new'`

### 2.6 SMS Alert Sent to Tradie

Within seconds of the call ending, an SMS is sent to the tradie's mobile:

```
📞 New lead – Mike's Plumbing

Caller: Sarah (+61400123456)
Address: 12 Main St, Parramatta NSW 2150
Issue: Burst pipe under kitchen sink – URGENT
Preferred time: ASAP

Log in to review: https://pickupai.ai-builders.space/dashboard
```

Emergency calls are flagged clearly so the tradie knows to call back immediately.

---

## Phase 3 — Tradie Reviews Leads

### 3.1 SMS Notification

The tradie receives the SMS immediately after each call. This gives them:
- Enough information to decide priority
- The caller's phone number to call back directly
- A link to the dashboard for full details

### 3.2 Dashboard Login

**URL:** `https://pickupai.ai-builders.space/dashboard/login`

The tradie logs in with their email and password. A secure HTTP-only session cookie keeps them logged in.

### 3.3 Leads List

The dashboard displays all leads for this tradie's account, sorted newest first:

| Lead | Caller | Address | Issue | Status | Date |
|---|---|---|---|---|---|
| 🔴 URGENT | Sarah | 12 Main St, Parramatta | Burst pipe | New | Just now |
| 🟡 | John | 45 Oak Ave, Penrith | Slow drain | New | 2h ago |
| ✅ | Maria | 8 Hill Rd, Blacktown | Hot water | Booked | Yesterday |

### 3.4 Lead Detail View

Clicking a lead shows the full record:
- Caller name, phone number, full address
- Detailed issue description
- Urgency level
- Preferred call-back time
- **Call recording** (playable directly in browser)
- Full **call transcript** (text)
- Status update controls

### 3.5 Status Management

Tradie can mark each lead as:

| Status | Meaning |
|---|---|
| `new` | Not yet actioned |
| `called_back` | Tradie has phoned the client |
| `booked` | Job is scheduled |
| `handled` | Job completed or closed |

### 3.6 CSV Export

The dashboard has a **Download CSV** button that exports all leads to a spreadsheet for use in Excel, Google Sheets, or a job management app like ServiceM8 or Tradify.

---

## Data Architecture

```
tenants
  └── tenant_id (primary key)
  └── name, ai_name, phone_number, owner_phone
  └── trade_type, service_area
  └── password_hash, session_token

calls
  └── call_sid (Twilio identifier)
  └── tenant_id (foreign key → tenants)
  └── from_number, to_number
  └── transcript (full conversation text)
  └── recording_url
  └── call_status, started_at, ended_at

leads
  └── lead_id
  └── call_sid (foreign key → calls)
  └── tenant_id (foreign key → tenants)
  └── caller_name, address, issue_description
  └── urgency, caller_intent, preferred_time
  └── lead_status (new / called_back / booked / handled)
  └── created_at

notifications
  └── Log of all SMS messages sent
```

---

## Security Model

| Protection | Implementation |
|---|---|
| Webhook authenticity | Twilio signature validation on every incoming request |
| Admin API | Bearer token (`ADMIN_TOKEN`) required for all `/admin/*` routes |
| Dashboard sessions | HTTP-only cookie with UUID session token, stored in DB |
| Passwords | `pbkdf2Sync` hashing with per-user salt |
| Multi-tenant isolation | All queries filter by `tenant_id`; tenants cannot see each other's data |

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Telephony** | Twilio Voice + Media Streams |
| **AI (voice)** | OpenAI Realtime API (`gpt-realtime-mini-2025-12-15`) |
| **Backend** | Node.js + Express + TypeScript |
| **WebSocket bridge** | `ws` package |
| **Database** | SQLite via `sql.js` (WASM, zero native dependencies) |
| **SMS** | Twilio Programmable Messaging |
| **Dashboard** | Server-side rendered HTML (built into Express) |
| **Deployment** | Docker / AI Builder Space (Koyeb) — live at `https://pickupai.ai-builders.space` |
| **Dev tunnelling** | ngrok |

---

## Latency Profile

A typical call interaction:

| Stage | Time |
|---|---|
| Caller speaks → audio reaches OpenAI | ~100–200ms (Twilio + network) |
| OpenAI processes and begins responding | ~300–700ms (Realtime API) |
| First audio packet back to caller | ~200ms |
| **Total perceived response delay** | **~600ms–1s** |

This is comparable to a real human receptionist and a significant improvement over the previous HTTP Chat Completions approach which took 5–15 seconds per turn.

---

## Deployment Overview

The server can be run:

- **Locally** (development): `npm run dev` + ngrok tunnel for Twilio webhooks
- **Production**: Docker container deployed on AI Builder Space (Koyeb) — currently live at `https://pickupai.ai-builders.space`

Environment variables required:

```env
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
OPENAI_API_KEY=...
OPENAI_VOICE=marin
ADMIN_TOKEN=...
PUBLIC_BASE_URL=https://pickupai.ai-builders.space
PORT=3000
```

---

*For tradie-facing setup instructions, see `tradie-setup-guide.md`.*
*For deployment instructions, see `DEPLOY.md`.*
