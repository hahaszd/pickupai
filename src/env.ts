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

  AIRTABLE_API_TOKEN: z.string().optional(),
  AIRTABLE_BASE_ID: z.string().optional(),
  AIRTABLE_TABLE_NAME: z.string().optional(),

  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional(),
  GOOGLE_SHEETS_WORKSHEET_NAME: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON_PATH: z.string().optional(),

  SQLITE_PATH: z.string().default("./data/app.sqlite"),

  SEED_EMAIL: z.string().optional(),
  SEED_PASSWORD: z.string().optional(),

  // Comma-separated AU Twilio numbers pre-configured as demo pool, e.g. "+61412000111,+61412000222"
  // Each must have its Voice webhook pointing to POST /twilio/voice/incoming.
  DEMO_POOL_NUMBERS: z.string().optional().default("")
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

