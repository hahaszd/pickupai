import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  PUBLIC_BASE_URL: z.string().url(),

  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  // Used only to seed the first/default tenant on startup and as the "from"
  // number when placing simulated demo calls. Actual per-tenant voice numbers
  // are stored in tenants.twilio_number in the database.
  TWILIO_DEFAULT_VOICE_NUMBER: z.string().min(1),

  // Comma-separated list of mobile numbers used to send SMS notifications to
  // tradie owners (e.g. "+61412000111,+61412000222"). Messages are sent
  // round-robin across all numbers in the pool.
  TWILIO_SMS_NUMBERS: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((n) => n.trim()).filter(Boolean)),

  OWNER_PHONE_NUMBER: z.string().optional().default(""),
  ENABLE_WARM_TRANSFER: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  WARM_TRANSFER_ONLY_DURING_BUSINESS_HOURS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  BUSINESS_TIMEZONE: z.string().default("Australia/Sydney"),
  BUSINESS_HOURS_START: z.string().default("08:00"),
  BUSINESS_HOURS_END: z.string().default("17:00"),

  TWILIO_VALIDATE_SIGNATURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  ADMIN_TOKEN: z.string().optional(),
  STORE_FULL_TRANSCRIPT: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_VOICE: z.string().default("sage"),
  // Voice for TTS demo audio generation (tts-1 model).
  // Valid: nova, shimmer, echo, onyx, fable, alloy, ash, sage, coral.
  // Falls back to OPENAI_VOICE if unset; falls back to "nova" if neither is valid for TTS.
  OPENAI_TTS_VOICE: z.string().optional(),
  // Realtime API model. Default is gpt-realtime-2.1 (released 2026-07-06),
  // which prices identically to gpt-realtime-2 and improves the two things a
  // phone receptionist lives on: alphanumeric recognition — reading back phone
  // numbers, addresses and quote figures — and silence/interruption handling,
  // the same class of problem the greeting timing was iterated on seven times.
  //
  // Roll back without a redeploy by setting OPENAI_REALTIME_MODEL in Railway:
  //   gpt-realtime-2    previous default, still current, not deprecated
  //   gpt-realtime-1.5  older still; note it bills text output at $16/1M
  //                     against 2.x's $24, an undocumented 50% jump
  // See docs/research/openai-platform-2026-07.md.
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime-2.1"),
  // Reasoning effort for gpt-realtime-2. Higher = smarter but more latency.
  // "low" is OpenAI's recommended default for live voice. Ignored by 1.5.
  OPENAI_REALTIME_REASONING_EFFORT: z
    .enum(["minimal", "low", "medium", "high", "xhigh"])
    .default("low"),
  // Hard guardrail: force-call completion if model never invokes end_call().
  // Defaults to 5 minutes to avoid stuck media streams and leaked call resources.
  MAX_CALL_DURATION_MS: z.coerce.number().int().positive().default(300000),

  AIRTABLE_API_TOKEN: z.string().optional(),
  AIRTABLE_BASE_ID: z.string().optional(),
  AIRTABLE_TABLE_NAME: z.string().optional(),

  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional(),
  GOOGLE_SHEETS_WORKSHEET_NAME: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON_PATH: z.string().optional(),

  SQLITE_PATH: z.string().default("./data/app.sqlite"),

  // When set, SQLite is backed up to (and restored from) this PostgreSQL URL as
  // a binary blob — providing persistence across container restarts on Koyeb.
  // Get a free URL from https://neon.tech (no credit card required).
  DATABASE_URL: z.string().optional(),

  SEED_EMAIL: z.string().optional(),
  SEED_PASSWORD: z.string().optional(),

  // Comma-separated AU Twilio numbers pre-configured as demo pool, e.g. "+61412000111,+61412000222"
  // Each must have its Voice webhook pointing to POST /twilio/voice/incoming.
  DEMO_POOL_NUMBERS: z.string().optional().default(""),

  // Twilio IncomingPhoneNumber SID for the first demo pool number.
  // Used to redirect the voice webhook to THIS server before each simulated demo call,
  // ensuring the correct instance handles the call when prod and dev share a number.
  // Find it in Twilio Console → Phone Numbers → Active Numbers → the demo number.
  DEMO_POOL_NUMBER_SID: z.string().optional(),

  // When true, on startup the server updates every owned Twilio number's voice
  // webhook to point to this instance (PUBLIC_BASE_URL). Use this to make dev
  // and prod each own their own webhooks — whichever starts last "wins".
  TWILIO_AUTO_CONFIGURE_WEBHOOKS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Twilio Messaging Service SID (e.g. MGxxxxxxxx).  When set, all outbound
  // SMS uses this service instead of a raw "from" number — enabling Alphanumeric
  // Sender IDs (e.g. "GetpickupAI") so texts display a business name.
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),

  // Address SID (e.g. ADxxxxxxxx) required for purchasing AU phone numbers.
  // Find it in Twilio Console → Phone Numbers → Addresses.
  TWILIO_ADDRESS_SID: z.string().optional(),

  // Regulatory Compliance Bundle SID (e.g. BUxxxxxxxx) required for
  // purchasing AU local numbers after June 2026 KYC requirements.
  // Find it in Twilio Console → Phone Numbers → Regulatory Compliance → Bundles.
  TWILIO_BUNDLE_SID: z.string().optional(),

  // ── Stripe (optional — set when ABN is confirmed and Stripe is live) ────────
  // Leave unset to keep the upgrade page in "contact us" mode.
  // Set STRIPE_SECRET_KEY to sk_test_... to enable test-mode Stripe Checkout.
  // Set to sk_live_... when ABN is confirmed and Stripe account is verified.
  STRIPE_SECRET_KEY:     z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  // Price ID from Stripe dashboard (Product → Price → copy ID e.g. price_xxx)
  STRIPE_PRICE_ID:       z.string().optional(),
  // Signing secret from Stripe dashboard → Webhooks → your endpoint → Signing secret
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Stripe coupon ID for the founding customer offer ($50/mo off for 3 months).
  // Create the coupon in Stripe Dashboard → Coupons, then paste the ID here.
  STRIPE_FOUNDING_COUPON_ID: z.string().optional(),

  // ── Email (optional SMTP for owner lead notifications) ───────────────────────
  // Supports any SMTP server: Resend, Postmark, SendGrid, Mailgun, etc.
  // When set, lead notifications are sent by both SMS and email.
  SMTP_HOST:   z.string().optional(),
  SMTP_PORT:   z.coerce.number().optional().default(465),
  SMTP_SECURE: z.enum(["true","false"]).optional().default("true").transform(v => v === "true"),
  SMTP_USER:   z.string().optional(),
  SMTP_PASS:   z.string().optional(),
  SMTP_FROM:   z.string().optional().default("PickupAI <noreply@getpickupai.com.au>"),

  // ── Mobile Message (optional — cheap SMS provider) ──────────────────────
  // When all three are set, ALL outbound SMS (marketing + transactional) is
  // sent via Mobile Message instead of Twilio, reducing cost from ~$0.10 to
  // ~$0.02/msg. Sign up at https://app.mobilemessage.com.au/register
  MOBILE_MSG_API_USER: z.string().optional(),
  MOBILE_MSG_API_PASSWORD: z.string().optional(),
  // Alphanumeric sender name (e.g. "PickupAI") or dedicated number.
  // ACMA registers the sender name to the person, not the carrier — you must
  // register it both on the ACMA SMS Sender ID Register AND get Mobile
  // Message support to whitelist the exact same string on your account.
  // Must match the registered ID exactly (case-sensitive on some carriers).
  MOBILE_MSG_SENDER: z.string().optional(),
  // Per-account opt-out shortlink that Mobile Message hosts on our behalf
  // (e.g. "mb.st/5xrt"). When a recipient taps it, MM records their number
  // in our account's unsubscribe list and blocks future marketing sends to
  // it. Find / generate the link in the MM dashboard under
  // Send Messages → Insert Opt-Out Message. When set, every outbound SMS
  // gets "\nOptOut <link>" appended; when unset, the email opt-out line is
  // used as a fallback.
  MOBILE_MSG_OPT_OUT_LINK: z.string().optional(),

  // ── Google Analytics (optional) ───────────────────────────────────────────
  // GA4 Measurement ID (e.g. G-XXXXXXXXXX). When set, the gtag.js snippet is
  // injected into all public and dashboard pages. Leave unset to disable.
  GA_MEASUREMENT_ID: z.string().optional(),

  // ── Google Search Console (optional) ──────────────────────────────────────
  // The token from the "HTML tag" verification method — just the content
  // value, not the whole <meta> tag. When set, it is injected into the public
  // marketing pages so Search Console can verify ownership.
  //
  // Kept in env rather than committed into index.html because it is an
  // ownership credential: anyone holding it can claim the property in their
  // own Search Console account.
  GOOGLE_SITE_VERIFICATION: z.string().optional(),

  // ── Build identity (injected by Railway) ──────────────────────────────────
  // Reported by /version so it is possible to tell which commit is actually
  // live. Previously both fields were hardcoded literals, which meant a deploy
  // could silently not happen and nothing would show it.
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
  RAILWAY_DEPLOYMENT_ID: z.string().optional(),

  // ── Operator test override (optional) ───────────────────────────────────
  // E.164 phone number that bypasses smsPreSendCheck's `unsubscribed_at`
  // suppression — STRICTLY for verifying the marketing pipeline end-to-end
  // on an operator's own phone after the number has been opted-out by
  // earlier compliance tests. Two safety guarantees:
  //   1. Bypass is gated by exact-match on E.164 phone — no wildcard, no
  //      regex. Any other suppressed prospect remains blocked.
  //   2. Bypass also seeds an idempotent test-prospect row at boot
  //      (deterministic prospect_id = "00000000-0000-0000-0000-000000000001")
  //      so multi-instance Railway boots converge to the same row without
  //      racing on UUID generation.
  // Every bypass triggers a WARN-level log line for ACMA audit trail.
  // Leave unset in production-normal; set ONLY when actively running an
  // operator-side smoke test through send-sms-batch.mjs.
  TEST_OVERRIDE_PHONE: z.string().regex(/^\+\d{8,15}$/, "must be E.164 format like +61420955412").optional()
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

