import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  PUBLIC_BASE_URL: z.string().url(),

  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_VOICE_NUMBER: z.string().min(1),
  TWILIO_SMS_NUMBER: z.string().min(1),

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
  SEED_PASSWORD: z.string().optional()
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

