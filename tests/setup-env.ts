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

/**
 * Credentials that make a test reach the network and spend money. The comment
 * above says these are "deliberately unset" — and until 2026-07-31 that was an
 * intention, not a guarantee: this file only ever filled in DEFAULTS, so a
 * developer whose shell exports OPENAI_API_KEY had every judge-touching test
 * silently billing real gpt-4o calls.
 *
 * Found by writing such a test. The EVAL_JUDGE_PROBE gate added earlier the
 * same day covered six named tests; it could not cover the seventh. Deleting
 * the variable is what makes the rule structural instead of remembered.
 *
 * EVAL_JUDGE_PROBE=1 opts back in, for the frozen judge probes that exist to
 * be run deliberately.
 */
const NETWORK_CREDENTIALS = [
  "OPENAI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "DATABASE_URL",
  "SMTP_URL",
  "MOBILE_MSG_API_USER",
  "MOBILE_MSG_API_PASSWORD"
];
if (process.env.EVAL_JUDGE_PROBE !== "1") {
  for (const key of NETWORK_CREDENTIALS) delete process.env[key];
}

for (const [key, value] of Object.entries(TEST_ENV)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
