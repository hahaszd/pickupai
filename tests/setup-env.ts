// Test environment bootstrap.
//
// `src/env.ts` runs `envSchema.parse(process.env)` at module load, so any test
// that (transitively) imports it throws a ZodError on a machine without a
// populated `.env`. Vitest runs this file before each test module is loaded,
// so the schema always sees a complete, deterministic set of values.
//
// Only fills gaps: an explicitly exported var (e.g. in CI) still wins.
const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  PORT: "3000",
  PUBLIC_BASE_URL: "https://test.local",

  TWILIO_ACCOUNT_SID: "ACtest00000000000000000000000000",
  TWILIO_AUTH_TOKEN: "test-auth-token",
  TWILIO_DEFAULT_VOICE_NUMBER: "+61200000000",
  TWILIO_SMS_NUMBERS: "+61400000000",
  TWILIO_VALIDATE_SIGNATURE: "false",

  OWNER_PHONE_NUMBER: "+61400000001",
  BUSINESS_TIMEZONE: "Australia/Sydney",

  ADMIN_TOKEN: "test-admin-token",

  // Deliberately no OPENAI_API_KEY / STRIPE_* / DATABASE_URL / SMTP_* /
  // MOBILE_MSG_*: they are optional in the schema, and leaving them unset
  // keeps tests on the offline code paths instead of reaching the network.
  SQLITE_PATH: "./.tmp/test.sqlite"
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
