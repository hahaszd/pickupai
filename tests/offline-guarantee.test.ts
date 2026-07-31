import { describe, it, expect } from "vitest";
// Deliberately imports production code: that is the whole point. The guarantee
// only ever held for tests that imported NOTHING from src/.
import { gradeScenario } from "../src/testing/eval/grade.js";
import { openDb } from "../src/db/db.js";

/**
 * CODING_STANDARDS: "Unit tests do not touch the network." That was an
 * intention with nothing enforcing it until 2026-07-31.
 *
 * tests/setup-env.ts builds a deliberately credential-free environment before
 * any test module loads. src/env.ts then called `dotenv.config()` at import
 * time, which re-read the developer's .env from disk and put every one of them
 * straight back — so on any machine with a populated .env, every test that
 * imported production code ran with live credentials.
 *
 * Found by writing a test that asserted the judge was unreachable offline. It
 * made a real, billed gpt-4o call and came back green. The billing is the mild
 * half: with a live DATABASE_URL, the suite was one openDb() argument away from
 * the production database.
 */
describe("tests run offline, and that is structural", () => {
  it("no network credential reaches a test, even one importing src/", () => {
    void gradeScenario;
    void openDb;
    for (const key of [
      "OPENAI_API_KEY",
      "DATABASE_URL",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "SMTP_URL",
      "MOBILE_MSG_API_USER",
      "MOBILE_MSG_API_PASSWORD"
    ]) {
      // Boolean(), not the value. `expect(process.env[key]).toBeFalsy()` prints
      // the RECEIVED value in its failure message — so the assertion that
      // catches a leaked credential would itself print that credential into CI
      // logs and terminal scrollback. Verified: it did exactly that the first
      // time this was mutation-checked.
      expect(
        Boolean(process.env[key]),
        `${key} leaked into the test environment — a live credential is reachable from a unit test`
      ).toBe(false);
    }
  });

  // The one that costs money per call, asserted through the real code path
  // rather than by reading an env var.
  it("the judge reports itself unreachable rather than being called", async () => {
    const { failures } = await gradeScenario(
      {
        id: "offline_probe", trade: "plumber", priority: "P0", intent: "new_job",
        label: "probe", callerOpening: "hi", callerFacts: [], mustCapture: [],
        expected: {
          shouldSaveLead: true, shouldEndCall: true,
          shouldSendOwnerSms: true, captureTarget: "degraded"
        },
        mustNotSay: ["quoted a price"],
        whyThisMatters: "probe"
      },
      {
        captured: { name: "G", phone: "0400000000", issue_summary: "leak" },
        savedLead: true, endedCall: true, callerHungUp: false,
        turnCount: 4, hitTurnCap: false,
        transcript: [{ role: "assistant", text: "hello" }]
      } as never
    );
    expect(failures.join(" ")).toContain("judge skipped");
  });
});
