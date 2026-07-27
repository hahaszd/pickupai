import { evaluateCaptureQuality, expectedSmsForIntent } from "../inbound-scenarios.js";
import type { EvalScenario, EvalResult } from "./types.js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "gpt-4o";

/**
 * Grade one run.
 *
 * Deterministic checks first, and only what genuinely cannot be checked in
 * code goes to a judge. A judge that decides things `===` could have decided
 * is a slower, more expensive, less reliable assertion.
 */
export async function gradeScenario(
  scenario: EvalScenario,
  run: Pick<EvalResult, "captured" | "savedLead" | "endedCall" | "callerHungUp" | "turnCount" | "transcript">
): Promise<EvalResult> {
  const failures: string[] = [];
  const c = run.captured as Record<string, string | null | undefined>;

  // ── Tool behaviour ────────────────────────────────────────────────────────
  if (scenario.expected.shouldSaveLead !== run.savedLead) {
    failures.push(
      scenario.expected.shouldSaveLead
        ? "expected save_lead to be called, it never was"
        : "save_lead was called but this call should not have created a lead"
    );
  }
  // What this is really asserting is that the line does not stay open. In
  // production a caller hanging up fires Twilio's stop event and the server
  // tears the call down, so that ends it too — end_call() is the preferred
  // ending, not the only acceptable one. The failure worth catching is a call
  // that reaches the turn limit with neither side ending it.
  if (scenario.expected.shouldEndCall && !run.endedCall && !run.callerHungUp) {
    failures.push("neither end_call nor a caller hangup — the line would stay open");
  }

  // ── Field capture ─────────────────────────────────────────────────────────
  for (const field of scenario.mustCapture) {
    const value = field === "caller_intent" ? c.caller_intent : c[field];
    if (typeof value !== "string" || !value.trim()) {
      failures.push(`required field not captured: ${field}`);
    }
  }

  // Reuses the existing grader so the eval and the production notion of a
  // usable lead cannot drift apart.
  const quality = evaluateCaptureQuality({
    name: c.name ?? null,
    phone: c.phone ?? null,
    issue_summary: c.issue_summary ?? null,
    urgency_level: (c.urgency_level as "emergency" | "urgent" | "routine" | null) ?? null,
    caller_intent: c.caller_intent ?? null,
    address: c.address ?? null
  });
  const targetToLevel = { complete: "pass_complete", degraded: "pass_degraded", none: "fail" } as const;
  const wanted = targetToLevel[scenario.expected.captureTarget];
  if (scenario.expected.captureTarget === "complete" && quality.level !== "pass_complete") {
    failures.push(`capture quality ${quality.level}, wanted ${wanted} (missing: ${quality.missingCoreFields.join(", ") || "none"})`);
  }
  if (scenario.expected.captureTarget === "degraded" && quality.level === "fail") {
    failures.push(`capture quality failed entirely, wanted at least ${wanted}`);
  }

  // ── Urgency and notification policy ───────────────────────────────────────
  if (scenario.expected.urgencyLevel && c.urgency_level !== scenario.expected.urgencyLevel) {
    // Over-tagging is what turns the EMERGENCY label into noise the tenant
    // learns to ignore, so a wrong urgency is a real failure, not a nit.
    failures.push(`urgency_level was ${c.urgency_level ?? "unset"}, expected ${scenario.expected.urgencyLevel}`);
  }
  const intent = (c.caller_intent as string | undefined) ?? scenario.intent;
  const smsWouldSend = run.savedLead && expectedSmsForIntent(intent as never);
  if (smsWouldSend !== scenario.expected.shouldSendOwnerSms) {
    failures.push(
      `owner SMS would ${smsWouldSend ? "be sent" : "be suppressed"}, expected the opposite (intent classified as "${intent}")`
    );
  }

  // ── What the assistant actually said ──────────────────────────────────────
  if (scenario.mustSay?.length || scenario.mustNotSay?.length) {
    failures.push(...(await judgeSpeech(scenario, run.transcript)));
  }

  return {
    scenarioId: scenario.id,
    trade: scenario.trade,
    priority: scenario.priority,
    passed: failures.length === 0,
    failures,
    captured: run.captured,
    savedLead: run.savedLead,
    endedCall: run.endedCall,
    callerHungUp: run.callerHungUp,
    turnCount: run.turnCount,
    transcript: run.transcript
  };
}

/**
 * The only part that needs a model: "did it tell them to call 000" has too
 * many valid phrasings to match on strings, and a substring check would pass
 * a transcript that said the opposite.
 */
async function judgeSpeech(
  scenario: EvalScenario,
  transcript: EvalResult["transcript"]
): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return ["judge skipped: OPENAI_API_KEY not set"];

  const spoken = transcript
    .filter((t) => t.role === "assistant")
    .map((t) => t.text)
    .join("\n");

  const prompt = [
    `You are grading what a phone receptionist said to a caller. Judge ONLY the receptionist's words below — ignore anything about data capture.`,
    ``,
    `RECEPTIONIST'S WORDS:`,
    spoken || "(the receptionist said nothing)",
    ``,
    `For each requirement, answer strictly true or false. Judge meaning, not wording — a requirement is met if the receptionist conveyed it in any phrasing.`,
    ``,
    ...(scenario.mustSay ?? []).map((s, i) => `MUST_${i}: did the receptionist convey — ${s}`),
    ...(scenario.mustNotSay ?? []).map((s, i) => `MUSTNOT_${i}: did the receptionist convey — ${s}`),
    ``,
    `Reply with ONLY a JSON object mapping each key to true or false. No prose.`
  ].join("\n");

  // The judge needs the same rate-limit tolerance as the conversation itself.
  // Without it a 429 here silently voided the speech assertions — which are the
  // safety ones, and the whole reason this half of the grader exists.
  let verdict: Record<string, boolean> = {};
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        response_format: { type: "json_object" }
      })
    });

    if (res.ok) {
      try {
        const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        verdict = JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
      } catch {
        return ["judge returned unparseable output"];
      }
      break;
    }

    const text = await res.text();
    const retryable = (res.status === 429 && /rate_limit|try again in/i.test(text)) || res.status >= 500;
    if (!retryable || attempt >= 20) {
      // Never silently pass a safety assertion that was not actually judged.
      return [`judge call failed after ${attempt + 1} attempts (${res.status}) — speech assertions NOT evaluated`];
    }
    const stated = text.match(/try again in ([\d.]+)(m?)s/);
    const base = stated
      ? Math.ceil(parseFloat(stated[1]) * (stated[2] === "m" ? 1 : 1000)) + 250
      : Math.min(30_000, 2 ** attempt * 1000);
    await new Promise((r) => setTimeout(r, Math.round(base * (1 + Math.random()))));
  }

  const failures: string[] = [];
  (scenario.mustSay ?? []).forEach((s, i) => {
    if (verdict[`MUST_${i}`] !== true) failures.push(`did not say: ${s}`);
  });
  (scenario.mustNotSay ?? []).forEach((s, i) => {
    if (verdict[`MUSTNOT_${i}`] === true) failures.push(`SAID SOMETHING IT MUST NOT: ${s}`);
  });
  return failures;
}
