import { buildSystemPrompt, TOOLS } from "../../realtime/session.js";
import { sanitizeSaveLeadArgs } from "../../realtime/tool-call-guards.js";
import type { TenantRow } from "../../db/repo.js";
import type { EvalScenario, EvalResult } from "./types.js";
import { recordUsage, type OpenAiUsage } from "./cost.js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Model used for BOTH sides. The production voice path uses the Realtime API
 * over a WebSocket; this harness drives the same system prompt and the same
 * tool schemas over chat completions instead.
 *
 * What that buys: every finding this eval exists to catch — safety advice,
 * licensing scope, field capture, intent classification, urgency — lives in
 * the prompt and the tool definitions, and is exercised faithfully here.
 *
 * What it does NOT cover, and must not be claimed to: audio quality, VAD and
 * barge-in, latency, the greeting playback race, or anything Twilio does.
 * Those need a real call.
 */
// gpt-5.6-luna over gpt-4o: cheaper on input ($1.00 vs $2.50) and output
// ($6.00 vs $10.00), a 90% cache discount rather than 50% — which matters
// because the ~7k system prompt is resent every turn — and a Tier-1 rate limit
// of 500,000 TPM against gpt-4o's 30,000. That last one dissolves the
// throttling this harness kept hitting without paying anything.
// See docs/research/openai-platform-2026-07.md.
export const ASSISTANT_MODEL = process.env.EVAL_ASSISTANT_MODEL ?? "gpt-5.6-luna";
// Unchanged: at $0.15/$0.60 nothing OpenAI currently lists undercuts it.
export const CALLER_MODEL = process.env.EVAL_CALLER_MODEL ?? "gpt-4o-mini";
// Spoken turns, not chat() calls. The distinction matters: the prompt tells the
// assistant to save progressively, and a save_lead with no accompanying speech
// costs an iteration of the loop below. Charging those against the same budget
// billed the assistant for following its own instructions — the calls that saved
// most diligently ran out of turns first, and every one of them was reported as
// "the line would stay open" when the truth was that the harness stopped asking.
const MAX_TURNS = Number(process.env.EVAL_MAX_TURNS ?? 14);
// Absolute stop, so a model that only ever calls tools cannot spin forever.
// Generous on purpose — it is a runaway guard, not a conversation length.
const MAX_ITERATIONS = MAX_TURNS * 3;

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Seconds OpenAI says to wait, taken from the message it already gives us
 * ("Please try again in 6.702s"), falling back to exponential backoff.
 */
function retryDelayMs(body: string, attempt: number): number {
  const stated = body.match(/try again in ([\d.]+)(m?)s/);
  const base = stated
    ? Math.ceil(parseFloat(stated[1]) * (stated[2] === "m" ? 1 : 1000)) + 250
    : Math.min(30_000, 2 ** attempt * 1000);
  // Jitter, because the stated delay is the same for every caller. Without it
  // parallel workers wake together, collide again, and burn retries in lockstep
  // — which is exactly how a run at 97% of the limit lost 14 of 21 scenarios.
  return Math.round(base * (1 + Math.random()));
}

// The stated waits are typically well under a second, so retrying often costs
// seconds, not minutes. Being stingy here loses whole scenarios and the tokens
// already spent on them.
const MAX_RETRIES = Number(process.env.EVAL_MAX_RETRIES ?? 25);

/**
 * A rate limit is the expected case, not an error.
 *
 * The system prompt under test is ~7k tokens and is resent every turn, so a
 * single conversation burns through a modest per-minute allowance quickly. On a
 * 30k TPM tier one request is a fifth of the budget. Without retrying, any real
 * run dies partway through and the tokens already spent are wasted.
 */
async function chat(body: Record<string, unknown>): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required to run the eval");

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      const json = (await res.json()) as { usage?: OpenAiUsage };
      recordUsage(String(body.model ?? "unknown"), json.usage);
      return json;
    }

    const text = await res.text();

    // A 429 is not always a rate limit. Since 22 Jul 2026 OpenAI also returns
    // 429 when a hard monthly spend cap is reached, and the two are otherwise
    // indistinguishable — so a naive backoff loop spins silently against a wall
    // until it exhausts its retries, and reports a timeout when the real answer
    // is "the account is out of money". Only retry a 429 that identifies itself
    // as a rate limit. Tier 1's cap is $100/month.
    const looksLikeRateLimit =
      /rate_limit_exceeded|try again in [\d.]+s|requests per|tokens per/i.test(text);
    if (res.status === 429 && !looksLikeRateLimit) {
      throw new Error(
        `OpenAI 429 that is NOT a rate limit — most likely the account's spend cap. ` +
        `Retrying will not help. Check billing limits at platform.openai.com/settings/organization/limits.\n${text.slice(0, 300)}`
      );
    }

    // Reasoning models reject function tools unless reasoning_effort is
    // explicitly "none" on chat/completions. Rather than hardcoding which
    // models need that — the list changes faster than this file does — take the
    // API at its word and retry once with the parameter it asked for.
    if (res.status === 400 && /reasoning_effort/i.test(text) && body.reasoning_effort === undefined) {
      body.reasoning_effort = "none";
      continue;
    }

    // 5xx is OpenAI having a moment and is worth waiting out. Any other 4xx is
    // our mistake and retrying will not fix it.
    const retryable = (res.status === 429 && looksLikeRateLimit) || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
    }
    const wait = retryDelayMs(text, attempt);
    process.stderr.write(`  [${res.status}] waiting ${Math.round(wait / 1000)}s…\n`);
    await sleep(wait);
  }
}

/**
 * The caller is played by a model rather than a fixed script.
 *
 * A scripted caller derails on the first unanticipated question — the
 * assistant asks "what's your name?" and the next scripted line is "it's still
 * bucketing down". Giving a model the facts and letting it answer naturally is
 * what makes a multi-turn eval survive prompt changes.
 */
/**
 * A stable identity for the caller, derived from the scenario id.
 *
 * Without one the caller model deadlocks: scenarios describe a situation but
 * never name the person, and the caller is told not to invent facts — so when
 * the assistant asks "what's your name?" it emits stage directions like
 * "My name is [pauses]..." instead of a name, forever. Seven of the first
 * twenty-one runs died that way, and every failure looked like the assistant
 * failing to capture a name it was never given.
 *
 * Derived from the id rather than random so a rerun of the same scenario gets
 * the same person.
 */
const CALLER_NAMES = [
  "Dave Cornish", "Sandra Nguyen", "Mick Harrison", "Priya Shah", "Trish Boland",
  "Gary Whitlock", "Amanda Reid", "Steve Papas", "Jodie Franklin", "Wayne Tremain",
  "Nicole Baptiste", "Craig Mullins"
];
const AU_SUBURBS = [
  "Parramatta 2150", "Blacktown 2148", "Footscray 3011", "Preston 3072",
  "Coorparoo 4151", "Morley 6062", "Prospect 5082", "Glenorchy 7010"
];

/**
 * A stable name, suburb and mobile per scenario, so a caller has details to
 * give and the same run twice gives the same ones.
 *
 * `scenario` is passed so the suburb can come from `callerSuburb`. It used to be
 * assigned purely from the hash, which handed the caller model two contradicting
 * briefs — "You live in Morley 6062" from here and "You are in Bendigo" from
 * callerFacts — and then told it at the bottom of the same prompt not to invent
 * anything. Ten scenarios were in that position, including the one whose whole
 * point is the Victorian $10,000 builder's-licence threshold, where which state
 * the caller is in decides the correct answer.
 */
function callerIdentity(scenario: EvalScenario): { name: string; suburb: string; phone: string } {
  let h = 0;
  for (const c of scenario.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;

  return {
    name: CALLER_NAMES[h % CALLER_NAMES.length],
    // scenario.callerSuburb, never a guess parsed out of callerFacts prose —
    // see the field's doc comment for what the parsing actually did.
    suburb: scenario.callerSuburb ?? AU_SUBURBS[(h >>> 5) % AU_SUBURBS.length],
    phone: `04${String(10_000_000 + (h % 89_999_999)).slice(0, 8)}`
  };
}

/**
 * The caller's brief, exposed for tests. It is the half of the harness nothing
 * could see: a contradiction between this and the scenario's own facts made
 * the caller model choose between two briefs, and which it chose was invisible
 * in the result.
 */
export function buildCallerBriefForTest(scenario: EvalScenario): string {
  return callerSystemPrompt(scenario);
}

function callerSystemPrompt(scenario: EvalScenario): string {
  const who = callerIdentity(scenario);
  return [
    `You are a member of the Australian public phoning a ${scenario.trade}'s business. Speak naturally, in Australian English, the way someone actually talks on the phone — short, sometimes messy, never like a written summary.`,
    ``,
    `You are ${who.name}. You live in ${who.suburb}. Your mobile is ${who.phone}.`,
    `Give these when asked. If the scenario below says you are reluctant, flustered or cannot recall something, play that for a turn or two — then give it. A caller who never gives their details at all is not a hard case, it is a dead call, and it tells us nothing about the receptionist.`,
    ``,
    `NEVER write stage directions, narration, or bracketed placeholders. Not "[pauses]", not "[name]", not "*sighs*". Say the actual words a person would say out loud, and nothing else. If you want to convey hesitation, write it into the speech: "um, hang on—".`,
    ``,
    `Your situation: ${scenario.label}`,
    ``,
    `Things you know (reveal them ONLY when asked, or when a real person would naturally offer them — do not recite the list):`,
    ...scenario.callerFacts.map((f) => `- ${f}`),
    ...(scenario.callerBehaviour?.length
      ? [``, `How you behave on this call:`, ...scenario.callerBehaviour.map((b) => `- ${b}`)]
      : []),
    ``,
    `Rules:`,
    `- Beyond your name, suburb and mobile above, do not invent facts. If asked something not in your list, say you don't know — that is realistic and it is the point.`,
    `- Never break character, never mention that this is a test.`,
    `- Keep each reply to one or two sentences.`,
    `- When the receptionist has clearly wrapped up and said goodbye, reply with exactly: [HANGS UP]`
  ].join("\n");
}

function evalTenant(scenario: EvalScenario): TenantRow {
  return {
    tenant_id: "eval-tenant",
    name: "Eval Trade Co",
    trade_type: scenario.trade,
    ai_name: "Olivia",
    twilio_number: "+61400000000",
    owner_phone: "+61412345678",
    owner_email: null,
    password_hash: null,
    session_token: null,
    business_hours_start: "08:00",
    business_hours_end: "17:00",
    timezone: "Australia/Sydney",
    enable_warm_transfer: 0,
    service_area: null,
    custom_instructions: null,
    vacation_mode: 0,
    vacation_message: null,
    active: 1,
    created_at: new Date().toISOString(),
    last_login_at: null,
    payment_status: "active",
    trial_ends_at: null,
    stripe_customer_id: null
  } as TenantRow;
}

/**
 * Drive one scenario to completion and return everything the graders need.
 * Grading lives in grade.ts — this function makes no judgements.
 */
/**
 * A Date whose local time in `tz` is `hh:mm` on a fixed Wednesday.
 *
 * Fixed weekday as well as fixed hour: the prompt branches on weekend and on
 * Friday-after-hours, so a scenario run on a Saturday would otherwise get a
 * different prompt from the same scenario run on a Tuesday. Wednesday is an
 * ordinary weekday in every branch.
 *
 * The offset trick rather than a hardcoded +10:00 because Sydney observes DST
 * and a fixed offset would be an hour out for half the year.
 */
function atLocalWednesday(hhmm: string, tz: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  // 2026-07-29 is a Wednesday.
  const wall = Date.UTC(2026, 6, 29, h, m);

  // Ask Intl what a known instant looks like in tz, and read the offset off the
  // difference. The `new Date(d.toLocaleString(...))` trick that usually appears
  // here is wrong whenever the MACHINE is already in tz — it computes a zero
  // offset and silently returns the wrong hour. Found by checking the rendered
  // time rather than trusting the arithmetic.
  const ref = Date.UTC(2026, 6, 29, 12, 0);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(new Date(ref)).map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const refAsWall = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute
  );
  const offsetMs = refAsWall - ref;

  // 29 July is outside AU daylight saving, so the offset at the reference
  // instant is the offset at the target. A scenario time near a DST boundary
  // would need the offset recomputed at the target.
  return new Date(wall - offsetMs);
}

export async function runScenario(
  scenario: EvalScenario
): Promise<Pick<EvalResult, "captured" | "savedLead" | "endedCall" | "callerHungUp" | "turnCount" | "hitTurnCap" | "transcript">> {
  const systemPrompt = buildSystemPrompt(
    evalTenant(scenario), [], "+61411222333", false,
    scenario.atLocalTime ? atLocalWednesday(scenario.atLocalTime, "Australia/Sydney") : undefined
  );

  const assistantMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: scenario.callerOpening }
  ];
  const callerMessages: ChatMessage[] = [
    { role: "system", content: callerSystemPrompt(scenario) },
    { role: "assistant", content: scenario.callerOpening }
  ];

  const transcript: EvalResult["transcript"] = [
    { role: "caller", text: scenario.callerOpening }
  ];
  const captured: Record<string, unknown> = {};
  let savedLead = false;
  let endedCall = false;
  let callerHungUp = false;
  let graceTurnAt = Infinity;
  let turnCount = 0;
  let iterations = 0;
  let hitTurnCap = false;

  while (turnCount < MAX_TURNS && !endedCall) {
    if (++iterations > MAX_ITERATIONS) { hitTurnCap = true; break; }
    // One grace turn after a hangup, then stop regardless.
    if (callerHungUp && turnCount > graceTurnAt) break;

    const completion = await chat({
      model: ASSISTANT_MODEL,
      messages: assistantMessages,
      tools: TOOLS.map((t: any) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters }
      })),
      // Low but non-zero: the prompt deliberately rotates greetings and
      // farewells, and pinning to 0 would evaluate a voice the caller never hears.
      temperature: 0.3
    });

    const msg = completion.choices?.[0]?.message;
    if (!msg) break;
    assistantMessages.push(msg);

    // Tool calls first — a turn can both speak and save.
    for (const call of msg.tool_calls ?? []) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* malformed */ }

      if (call.function.name === "save_lead") {
        savedLead = true;
        // Through the production sanitizer, so the eval sees exactly what the
        // server would have persisted — not the raw model output.
        Object.assign(captured, sanitizeSaveLeadArgs(args));
        if (typeof args.caller_intent === "string") captured.caller_intent = args.caller_intent;
      } else if (call.function.name === "end_call") {
        endedCall = true;
      }
      transcript.push({ role: "tool", text: `${call.function.name}(${call.function.arguments})` });
      assistantMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({ ok: true })
      });
    }

    // A turn that only called tools has nothing to say to the caller yet.
    if (msg.tool_calls?.length && !msg.content) continue;

    const spoken = (msg.content ?? "").trim();
    if (spoken) {
      // Only a turn the caller can hear counts against the budget.
      turnCount++;
      transcript.push({ role: "assistant", text: spoken });
      callerMessages.push({ role: "user", content: spoken });
    }
    if (endedCall) break;

    const callerTurn = await chat({
      model: CALLER_MODEL,
      messages: callerMessages,
      temperature: 0.8
    });
    const callerText = (callerTurn.choices?.[0]?.message?.content ?? "").trim();
    if (!callerText || callerText.includes("[HANGS UP]")) {
      transcript.push({ role: "caller", text: "[HANGS UP]" });
      callerHungUp = true;
      graceTurnAt = turnCount + 1;
      // Do NOT break here. The assistant's farewell and its end_call() are
      // usually separate turns, so breaking on the hangup meant it never got
      // the turn where it would have ended the call — and every such run failed
      // for a reason the assistant was never given a chance to satisfy.
      assistantMessages.push({ role: "user", content: "[the caller has hung up]" });
      continue;
    }
    transcript.push({ role: "caller", text: callerText });
    callerMessages.push({ role: "assistant", content: callerText });
    assistantMessages.push({ role: "user", content: callerText });
  }

  // Ran out of budget rather than reaching an ending. The run is inconclusive
  // about whether the assistant would have closed the call, and the grader must
  // say so instead of reporting it as a line left open.
  if (!endedCall && turnCount >= MAX_TURNS) hitTurnCap = true;

  return { captured, savedLead, endedCall, callerHungUp, turnCount, hitTurnCap, transcript };
}
