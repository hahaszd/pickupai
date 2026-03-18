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
  SMTP_FROM:   z.string().optional().default("PickupAI <noreply@pickupai.com.au>"),

  // Google Places API key for lead scraping (scripts/collect-leads.ts)
  GOOGLE_PLACES_API_KEY: z.string().optional()
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

