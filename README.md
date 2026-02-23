# AU Tradie AI Receptionist (MVP)

An MVP “AI receptionist” for Australian tradies (e.g., plumbers) that answers inbound calls via Twilio, collects job details, and sends the business owner a post-call SMS summary + exports leads to a CRM placeholder (Google Sheets / Airtable).

## What’s included (MVP)

- Twilio inbound voice webhook (answer, recording, speech gather, optional warm transfer)
- Per-call state + transcript storage (SQLite)
- Post-call notification channel (SMS)
- CRM export adapter layer (Airtable / Google Sheets optional)

## Prereqs

- Node.js 20+ (tested on Node 24)
- A Twilio account with:
  - An AU Voice-capable phone number (for inbound calls)
  - An SMS-capable phone number (for sending owner notifications)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and fill values.

3. Start the server:

```bash
npm run dev
```

4. Expose locally (choose one):
   - `ngrok http 3000`
   - Cloudflare tunnel

Set `PUBLIC_BASE_URL` to your public URL (e.g. `https://xxxx.ngrok-free.app`).

## Twilio configuration

In Twilio Console for your **Voice number**:

- **A Call Comes In**: `POST {PUBLIC_BASE_URL}/twilio/voice/incoming`

If you enable signature validation, also set:

- `TWILIO_VALIDATE_SIGNATURE=true`

## Endpoints

- `POST /twilio/voice/incoming`: initial inbound call webhook (returns TwiML)
- `POST /twilio/voice/collect`: receives speech result (returns TwiML)
- `POST /twilio/voice/status`: call status updates
- `POST /twilio/voice/recording`: recording status callback

## Notes

- If `OPENAI_API_KEY` is not set, the call flow still works but uses a scripted “form-style” dialogue (useful for wiring and QA).
- Do not promise prices or arrival times; keep advice limited and safety-oriented.
- Debug endpoints under `/debug/*` can be protected with `ADMIN_TOKEN` (send header `x-admin-token`).
- To minimize stored PII, set `STORE_FULL_TRANSCRIPT=false` to avoid saving full per-turn transcripts.

