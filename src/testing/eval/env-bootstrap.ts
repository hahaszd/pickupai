/**
 * Side-effecting module. **Must be imported before anything that reaches
 * `src/env.ts`.**
 *
 * `src/env.ts` calls `envSchema.parse(process.env)` at import time and throws
 * on a missing required variable. The eval harness builds the real system
 * prompt, so it pulls in `session.ts`, which pulls in `env.ts` — and the whole
 * run died with a ZodError about `PUBLIC_BASE_URL` and four Twilio variables it
 * never uses. Same failure that made three test suites unrunnable; see
 * `tests/setup-env.ts`.
 *
 * Only `OPENAI_API_KEY` is genuinely required to run an eval. Everything else
 * here is a placeholder, and an explicitly exported value always wins.
 */
const PLACEHOLDERS: Record<string, string> = {
  PUBLIC_BASE_URL: "https://eval.local",
  TWILIO_ACCOUNT_SID: "ACeval0000000000000000000000000",
  TWILIO_AUTH_TOKEN: "eval-not-a-real-token",
  TWILIO_DEFAULT_VOICE_NUMBER: "+61200000000",
  TWILIO_SMS_NUMBERS: "+61400000000",
  // No network is reached with these unset, which is the point.
  TWILIO_VALIDATE_SIGNATURE: "false",
  SQLITE_PATH: "./.tmp/eval.sqlite"
};

for (const [key, value] of Object.entries(PLACEHOLDERS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
