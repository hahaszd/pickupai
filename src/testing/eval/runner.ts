import { buildSystemPrompt, TOOLS } from "../../realtime/session.js";
import { sanitizeSaveLeadArgs } from "../../realtime/tool-call-guards.js";
import type { TenantRow } from "../../db/repo.js";
import type { EvalScenario, EvalResult } from "./types.js";

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
const ASSISTANT_MODEL = process.env.EVAL_ASSISTANT_MODEL ?? "gpt-5.6-luna";
// Unchanged: at $0.15/$0.60 nothing OpenAI currently lists undercuts it.
const CALLER_MODEL = process.env.EVAL_CALLER_MODEL ?? "gpt-4o-mini";
const MAX_TURNS = Number(process.env.EVAL_MAX_TURNS ?? 14);

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
  const stated = body.match(/try again in ([\d.]+)s/);
  if (stated) return Math.ceil(parseFloat(stated[1]) * 1000) + 500;
  return Math.min(30_000, 2 ** attempt * 1000);
}

const MAX_RETRIES = Number(process.env.EVAL_MAX_RETRIES ?? 6);

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
    if (res.ok) return res.json();

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
function callerSystemPrompt(scenario: EvalScenario): string {
  return [
    `You are a member of the Australian public phoning a ${scenario.trade}'s business. Speak naturally, in Australian English, the way someone actually talks on the phone — short, sometimes messy, never like a written summary.`,
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
    `- Never invent facts beyond what you know. If asked something not in your list, say you don't know — that is realistic and it is the point.`,
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
export async function runScenario(
  scenario: EvalScenario
): Promise<Pick<EvalResult, "captured" | "savedLead" | "endedCall" | "turnCount" | "transcript">> {
  const systemPrompt = buildSystemPrompt(evalTenant(scenario), [], "+61411222333");

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
  let turnCount = 0;

  while (turnCount < MAX_TURNS && !endedCall) {
    turnCount++;

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
      break;
    }
    transcript.push({ role: "caller", text: callerText });
    callerMessages.push({ role: "assistant", content: callerText });
    assistantMessages.push({ role: "user", content: callerText });
  }

  return { captured, savedLead, endedCall, turnCount, transcript };
}
