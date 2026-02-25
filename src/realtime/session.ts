import WebSocket from "ws";
import type { WebSocket as TwilioWs } from "ws";
import pino from "pino";
import { env } from "../env.js";
import type { LeadRow, TenantRow } from "../db/repo.js";
import type { LeadDraft } from "../twilio/state.js";

const log = pino({ level: "info" });

// Pinned to the latest gpt-realtime-mini snapshot (verified 2026-02-22 on OpenAI docs).
// Latest available: gpt-realtime-mini-2025-12-15
const OPENAI_REALTIME_MODEL = "gpt-realtime-mini-2025-12-15";
const OPENAI_REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${OPENAI_REALTIME_MODEL}`;

// ─── Tool definitions sent to OpenAI ─────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    name: "save_lead",
    description:
      "Save or update the caller's lead information collected so far. Call this whenever you have confirmed a key piece of information (name, address, issue, etc.). You can call it multiple times as the conversation progresses.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Caller's full name" },
        phone: { type: "string", description: "Best callback number" },
        address: { type: "string", description: "Job address (suburb, street, or postcode — any format)" },
        issue_type: { type: "string", description: "Short category: plumbing, electrical, roofing, etc." },
        issue_summary: { type: "string", description: "Brief description of the problem in caller's own words" },
        urgency_level: {
          type: "string",
          enum: ["emergency", "urgent", "routine"],
          description: "How urgent the job is"
        },
        preferred_time: { type: "string", description: "When the caller would like someone to come" },
        notes: { type: "string", description: "Any extra context, out-of-band info, special instructions" },
        caller_intent: {
          type: "string",
          enum: [
            "new_job", "follow_up", "complaint", "reschedule",
            "quote_only", "wrong_number", "spam", "telemarketer",
            "job_applicant", "supplier", "trade_referral", "silent", "abusive", "unknown"
          ],
          description: "Reason for the call"
        },
        next_action: { type: "string", description: "What the business owner should do next" }
      },
      required: []
    }
  },
  {
    type: "function",
    name: "end_call",
    description:
      "End the call. Call this after you have said your farewell and the conversation is complete. This will trigger an SMS to the business owner and hang up the call.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Brief reason for ending the call (e.g. 'lead collected', 'wrong number', 'abusive caller')"
        }
      },
      required: ["reason"]
    }
  }
];

// ─── Service area prompt section ─────────────────────────────────────────────

export function buildServiceAreaSection(serviceArea: string | null | undefined): string {
  if (!serviceArea?.trim()) return "";
  return `
# Service Area
This business serves: ${serviceArea}.
When the caller gives their address or suburb:
- If it sounds clearly outside the service area, say: "That area might be a bit outside our usual range — let me take your details anyway and the team will confirm if we can help."
- If you are not sure whether the address is in range, proceed normally and collect their details.
- ALWAYS collect the caller's details regardless — never turn a caller away without taking their information.
- In save_lead(), if the address seems outside the service area, set next_action to "OUT OF AREA - owner to confirm".`;
}

// ─── Per-trade prompt snippets ────────────────────────────────────────────────

type TradeConfig = {
  label: string;           // human-readable trade name
  intakeQuestions: string; // extra intake guidance specific to this trade
  emergencyKeywords: string;
  emergencySafetyTip: string;
};

const TRADE_CONFIGS: Record<string, TradeConfig> = {
  plumber: {
    label: "plumbing",
    intakeQuestions: `
  • Is there active water leaking right now?
  • Is it a hot or cold water issue?
  • Can they see where it's coming from, or is it hidden?
  • Is it affecting one fixture or multiple areas?
  • Are they an owner-occupier or a tenant (and does the landlord need to be contacted)?`,
    emergencyKeywords: "burst pipe, flooding, sewage overflow, no hot water, gas leak, blocked drain backing up",
    emergencySafetyTip: "Turn off the water at the mains tap (usually near the water meter outside) to minimise damage while you wait."
  },
  electrician: {
    label: "electrical",
    intakeQuestions: `
  • Is it a complete power outage or only part of the house?
  • Has the circuit breaker tripped? Have they tried resetting it?
  • Any burning smell, sparks, or visible damage?
  • Is it safe to be in the affected area right now?`,
    emergencyKeywords: "sparks, burning smell, electrical fire, no power, power outage, shock, live wire",
    emergencySafetyTip: "If it's safe to do so, switch off the affected circuit at the switchboard and do not touch any exposed wiring."
  },
  roofer: {
    label: "roofing",
    intakeQuestions: `
  • Is there active water coming in right now?
  • Was this triggered by a recent storm or has it been happening for a while?
  • What type of roof — tiles, Colorbond/metal, or other?
  • Roughly how old is the roof?`,
    emergencyKeywords: "roof collapsed, active flooding through ceiling, structural damage, storm damage",
    emergencySafetyTip: "Avoid the rooms directly under the leak until the roof is inspected — ceilings can become waterlogged and heavy."
  },
  painter: {
    label: "painting",
    intakeQuestions: `
  • Is this interior, exterior, or both?
  • Residential home or commercial premises?
  • Roughly how many rooms or what's the approximate area?
  • Is there any prep work needed — cracks, peeling, mould, or water stains?`,
    emergencyKeywords: "",
    emergencySafetyTip: ""
  },
  carpenter: {
    label: "carpentry",
    intakeQuestions: `
  • Is this a repair (e.g. broken door/frame) or new work (e.g. shelving, decking)?
  • Roughly what's the scope — one item or a larger project?
  • Any specific timber, finish, or style in mind?`,
    emergencyKeywords: "broken door won't close, security issue, structural damage",
    emergencySafetyTip: "If the issue is a door or lock that won't secure, consider a temporary fix until we can get there."
  },
  tiler: {
    label: "tiling",
    intakeQuestions: `
  • Is this a repair (cracked/loose tiles) or a new installation?
  • What area — bathroom, kitchen, outdoor?
  • Roughly how many square metres?
  • Do they have matching tiles already, or do we need to source them?`,
    emergencyKeywords: "",
    emergencySafetyTip: ""
  },
  handyman: {
    label: "handyman and general maintenance",
    intakeQuestions: `
  • What type of job is it — trade-specific (plumbing, electrical) or general maintenance?
  • Is it a repair or an installation?
  • Roughly how big is the job?`,
    emergencyKeywords: "flooding, no power, gas leak, structural damage, burst pipe",
    emergencySafetyTip: "For immediate safety hazards, we'll prioritise getting someone out to you as quickly as possible."
  }
};

// Aliases so users can type natural variants
const TRADE_ALIASES: Record<string, string> = {
  plumbing: "plumber",
  electrical: "electrician",
  electric: "electrician",
  roofing: "roofer",
  roofs: "roofer",
  painting: "painter",
  carpentry: "carpenter",
  joiner: "carpenter",
  joinery: "carpenter",
  tiling: "tiler",
  tiles: "tiler",
  general: "handyman",
  maintenance: "handyman",
  "general maintenance": "handyman"
};

function resolveTradeKey(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return TRADE_ALIASES[lower] ?? lower;
}

function buildTradeSection(tradeKeys: string[]): {
  tradeLabel: string;
  intakeSection: string;
  emergencySection: string;
  scopeSection: string;
} {
  const resolved = tradeKeys.map(resolveTradeKey);
  const configs = resolved
    .map((k) => TRADE_CONFIGS[k])
    .filter((c): c is TradeConfig => c !== undefined);

  const isHandyman = resolved.includes("handyman") || resolved.length > 2;
  const hasMultipleTrades = resolved.length > 1;

  const tradeLabel =
    configs.length === 0
      ? resolved.join(" / ")
      : configs.length === 1
      ? configs[0].label
      : configs.map((c) => c.label).join(" and ");

  // Merge intake questions from all trades
  const intakeLines = configs.flatMap((c) =>
    c.intakeQuestions
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
  );
  const intakeSection =
    intakeLines.length > 0
      ? `
# Trade-Specific Intake Questions
Once you know it's a job enquiry, ask ONLY the relevant questions below (one at a time, only as needed):
${intakeLines.join("\n")}`
      : "";

  // Merge emergency keywords and tips
  const emergencyKws = configs
    .map((c) => c.emergencyKeywords)
    .filter(Boolean)
    .join(", ");
  const tips = configs
    .map((c) => c.emergencySafetyTip)
    .filter(Boolean);
  const emergencySection = emergencyKws
    ? `
# Emergency Handling
IF the caller mentions: ${emergencyKws}:
- Acknowledge urgency immediately.
- Give ONE practical safety tip: ${tips.length > 0 ? tips[0] : "advise them to stay safe until help arrives."}
- Set urgency_level to "emergency" in save_lead.
- Continue collecting details quickly.`
    : `
# Emergency Handling
If there is any immediate risk to life or safety: acknowledge urgency, set urgency_level to "emergency", and collect details quickly.`;

  // Out-of-trade scope (only for single-trade businesses)
  const scopeSection =
    !isHandyman && !hasMultipleTrades && configs.length === 1
      ? `
# Scope — Out-of-Trade Calls
${businessPlaceholder} only handles ${tradeLabel} work. If a caller needs a different trade (e.g. they're calling about electrical but this is a plumbing business):
Say: "We specialise in ${tradeLabel} — for [what they need] you'd want to contact a licensed [trade] directly. Is there anything ${tradeLabel}-related I can help with today?"
Do not attempt to assist with out-of-scope technical questions.`
      : `
# Scope
This business handles: ${tradeLabel}. Accept enquiries for all of these service types.`;

  return { tradeLabel, intakeSection, emergencySection, scopeSection };
}

// Placeholder replaced after tenant is known
const businessPlaceholder = "This business";

// ─── System prompt ────────────────────────────────────────────────────────────

function buildDemoSection(tenant: TenantRow): string {
  const tradeKeys = tenant.trade_type.split(",").map((s) => s.trim()).filter(Boolean);
  const tradeLabel = tradeKeys[0] ?? "tradie";
  return `
# Demo Mode
This is a DEMONSTRATION call placed by an automated system to show the business owner (${tenant.name}) how their AI receptionist works.
The "caller" is a pre-recorded script playing the role of a customer with a ${tradeLabel} job enquiry.
Respond as you would to any real customer — greet them warmly, collect their details, and end the call naturally.
At the end, say something like: "Great, I've taken your details — the team at ${tenant.name} will be in touch soon."
Keep the call to around 90 seconds.
`;
}

function buildSystemPrompt(
  tenant: TenantRow,
  callerHistory: LeadRow[],
  fromNumber: string | null,
  isDemo = false
): string {
  const aiName = tenant.ai_name || "Olivia";
  const businessName = tenant.name;

  // Support comma-separated multi-trade: "plumber,electrician" or single "plumber"
  const tradeKeys = tenant.trade_type
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { tradeLabel, intakeSection, emergencySection, scopeSection } =
    buildTradeSection(tradeKeys);

  // Replace the placeholder with the real business name
  const scopeSectionFinal = scopeSection.replace(businessPlaceholder, businessName);

  const serviceAreaSection = buildServiceAreaSection(tenant.service_area ?? null);

  const historySection =
    callerHistory.length > 0
      ? `
# Returning Customer Context
This caller has contacted us before. Here are their recent jobs:
${callerHistory
  .map(
    (r, i) =>
      `  ${i + 1}. [${r.created_at?.slice(0, 10) ?? "?"}] ${r.issue_type ?? "job"} at ${r.address ?? "unknown address"} — ${r.issue_summary ?? ""}`
  )
  .join("\n")}
Greet them warmly as a returning customer. You may reference their history to be helpful, but still collect details for today's new call.
`
      : "";

  const demoSection = isDemo ? buildDemoSection(tenant) : "";

  return `${demoSection}# Role & Objective
You are ${aiName}, the friendly receptionist for ${businessName}, an Australian ${tradeLabel} business. You answer calls 24/7.
Your goal: collect enough information about the caller's job so the business owner can follow up.
Success means the caller feels helped, not interrogated.

# Personality & Tone
- Warm, friendly, confident. Think of a knowledgeable local who genuinely cares.
- Use natural Australian phrases: "No worries", "Thanks for that", "Absolutely", "Sounds good".
- Keep replies SHORT — 1 to 2 sentences. Never lecture or over-explain.
- Vary your phrasing. Do NOT repeat the same sentence twice.
- You are speaking on a LIVE phone call. Be conversational, not robotic.

# Language
- English only, Australian style.
- If the caller speaks another language, politely explain you can only assist in English.

# Instructions / Rules
- Collect information in this natural order: understand the issue first → name → address (suburb or street is fine, do NOT insist on postcode) → callback number if different from caller ID → preferred time.
- ASK ONE QUESTION AT A TIME. Never list multiple questions in one response.
- CHECK what you already know before asking. NEVER ask for something you already have.
- STOP collecting once you have: name + issue description + any address detail. Move to confirmation.
- After confirming, call save_lead() then end_call().
- NEVER promise specific prices, quotes, or arrival times.
- The caller's number is: ${fromNumber ?? "unknown"}. Use this as the callback number unless they give a different one.
${scopeSectionFinal}
${serviceAreaSection}
${intakeSection}

# Call Types & Handling
- NEW JOB (most common): full collection → confirm → save_lead() → end_call()
- FOLLOW-UP (checking on a booking): collect name + address → save_lead with next_action="Follow-up requested" → end_call()
- COMPLAINT (unhappy): apologise sincerely → collect name → save_lead with next_action="COMPLAINT - urgent callback needed" → end_call()
- RESCHEDULE: collect name + address + new preferred time → save_lead → end_call()
- QUOTE ONLY: explain you can't quote by phone, offer a callback → collect name + number → save_lead → end_call()
- WRONG NUMBER: confirm the business name, wish them well → end_call() with no save_lead
- SPAM / TELEMARKETER: brief polite decline → end_call()
- JOB APPLICANT: suggest they email or check the website → end_call()
- SILENT CALLER: prompt once ("Hello, is anyone there?"), if still silent → end_call()
- ABUSIVE CALLER: give ONE calm warning. If abuse continues → end_call()
${emergencySection}

# Out-of-Band Communication
If a caller says they already spoke to someone or the boss said something you don't know about:
Say: "I'm sorry, I don't always have full visibility of direct conversations — I'll make sure your details and notes are flagged for the team."
Do NOT make the owner look bad. Frame it as a system gap.

# Conversation Flow
Greeting → Understand purpose → Collect details (one at a time) → Confirm summary → End call

## Greeting (use a variation, don't always use the same one)
- "Hi, thanks for calling ${businessName}! This is ${aiName}, how can I help you today?"
- "G'day, you've reached ${businessName}, this is ${aiName} — what can I do for you?"
- "Hi there, ${aiName} speaking from ${businessName} — what's brought you to call today?"

## Confirmation (once you have enough details)
"Just to confirm — you're [name] at [address], and you need [brief issue summary]. Is that right?"

## Farewell (after end_call is triggered)
- "Brilliant, I've got all your details. The team at ${businessName} will be in touch soon — have a great day!"
- "No worries at all, someone from ${businessName} will give you a call back shortly. Cheers!"

# Tools
- Call save_lead() as soon as you have confirmed any key detail. You can call it multiple times as you learn more.
- Before calling end_call(), say your farewell out loud first.
- After calling end_call(), do not say anything further.

# Safety & Escalation
- If there is any risk to life: treat as emergency, set urgency=emergency, end call quickly with save_lead.
- After 2+ turns with no response at all: end_call with reason="silent caller".
- After abusive language persists after one warning: end_call with reason="abusive caller".
${historySection}`;
}

// ─── RealtimeSession ──────────────────────────────────────────────────────────

export type SessionCallbacks = {
  /** Called when the AI function save_lead fires — merge into in-memory lead */
  onLeadUpdate: (patch: Partial<LeadDraft> & { caller_intent?: string; next_action?: string }) => void;
  /** Called when the AI function end_call fires — do DB save + SMS then hangup */
  onEndCall: (reason: string) => void;
  /** Called when the OpenAI session errors unrecoverably */
  onError: (err: Error) => void;
};

export class RealtimeSession {
  private openAiWs: WebSocket;
  private twilioWs: TwilioWs;
  private streamSid: string | null = null;
  private lastAssistantItemId: string | null = null;
  private responseStartTs: number | null = null;
  private latestMediaTs = 0;
  private markQueue: string[] = [];
  private callbacks: SessionCallbacks;
  private callSid: string;
  private ended = false;

  constructor(opts: {
    twilioWs: TwilioWs;
    callSid: string;
    fromNumber: string | null;
    callerHistory: LeadRow[];
    tenant: TenantRow;
    isDemo?: boolean;
    callbacks: SessionCallbacks;
  }) {
    this.twilioWs = opts.twilioWs;
    this.callSid = opts.callSid;
    this.callbacks = opts.callbacks;

    const instructions = buildSystemPrompt(opts.tenant, opts.callerHistory, opts.fromNumber, opts.isDemo ?? false);

    this.openAiWs = new WebSocket(OPENAI_REALTIME_URL, {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }
    });

    this.openAiWs.on("open", () => {
      log.info({ callSid: opts.callSid }, "OpenAI Realtime connected");
      this.initSession(instructions);
    });

    this.openAiWs.on("message", (data) => {
      this.handleOpenAiEvent(JSON.parse(data.toString()));
    });

    this.openAiWs.on("error", (err) => {
      log.error({ callSid: opts.callSid, err }, "OpenAI Realtime WebSocket error");
      if (!this.ended) this.callbacks.onError(err);
    });

    this.openAiWs.on("close", () => {
      log.info({ callSid: opts.callSid }, "OpenAI Realtime WebSocket closed");
    });
  }

  // ── Session initialisation ────────────────────────────────────────────────

  private initSession(instructions: string) {
    const sessionUpdate = {
      type: "session.update",
      session: {
        type: "realtime",
        model: OPENAI_REALTIME_MODEL,
        output_modalities: ["audio"],
        instructions,
        tools: TOOLS,
        tool_choice: "auto",
        audio: {
          input: {
            format: { type: "audio/pcmu" },
            turn_detection: { type: "semantic_vad" }
          },
          output: {
            format: { type: "audio/pcmu" },
            voice: env.OPENAI_VOICE
          }
        }
      }
    };
    this.send(sessionUpdate);

    // Inject the initial greeting as a user turn so the AI speaks first.
    setTimeout(() => {
      this.send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "(call connected, greet the caller)" }]
        }
      });
      this.send({ type: "response.create" });
    }, 200);
  }

  // ── Handle events from OpenAI ─────────────────────────────────────────────

  private handleOpenAiEvent(event: any) {
    switch (event.type) {
      case "response.output_audio.delta":
        this.forwardAudioToTwilio(event);
        break;

      case "response.output_item.done":
        if (event.item?.id) this.lastAssistantItemId = event.item.id;
        break;

      case "input_audio_buffer.speech_started":
        this.handleBargein();
        break;

      case "response.function_call_arguments.done":
        this.handleFunctionCall(event);
        break;

      case "error":
        log.error({ callSid: this.callSid, event }, "OpenAI Realtime error event");
        break;

      case "session.created":
      case "session.updated":
      case "response.done":
      case "rate_limits.updated":
        break;
    }
  }

  private forwardAudioToTwilio(event: any) {
    if (!this.streamSid || !event.delta) return;

    if (this.responseStartTs === null) {
      this.responseStartTs = this.latestMediaTs;
    }

    const mark = `r-${Date.now()}`;
    this.sendToTwilio({ event: "media", streamSid: this.streamSid, media: { payload: event.delta } });
    this.sendToTwilio({ event: "mark", streamSid: this.streamSid, mark: { name: mark } });
    this.markQueue.push(mark);
  }

  private handleBargein() {
    if (!this.streamSid || this.markQueue.length === 0 || this.responseStartTs === null) return;

    const elapsed = this.latestMediaTs - this.responseStartTs;
    if (this.lastAssistantItemId) {
      this.send({
        type: "conversation.item.truncate",
        item_id: this.lastAssistantItemId,
        content_index: 0,
        audio_end_ms: Math.max(0, elapsed)
      });
    }
    this.sendToTwilio({ event: "clear", streamSid: this.streamSid });
    this.markQueue = [];
    this.responseStartTs = null;
  }

  private handleFunctionCall(event: any) {
    const name: string = event.name;
    let args: Record<string, any> = {};
    try {
      args = JSON.parse(event.arguments ?? "{}");
    } catch {
      log.warn({ callSid: this.callSid, raw: event.arguments }, "Failed to parse function args");
    }

    const callId = event.call_id;

    if (name === "save_lead") {
      this.callbacks.onLeadUpdate(args);
      // Acknowledge the function call so the model can continue speaking.
      this.send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify({ ok: true })
        }
      });
      this.send({ type: "response.create" });
    } else if (name === "end_call") {
      if (this.ended) return;
      this.ended = true;
      // Acknowledge so the model can say farewell before we hang up.
      this.send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify({ ok: true })
        }
      });
      this.send({ type: "response.create" });
      // Give the AI a moment to speak its farewell, then trigger hangup.
      setTimeout(() => {
        this.callbacks.onEndCall(args.reason ?? "conversation complete");
      }, 4000);
    }
  }

  // ── Handle events from Twilio ─────────────────────────────────────────────

  handleTwilioMessage(raw: string) {
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    switch (data.event) {
      case "start":
        this.streamSid = data.start?.streamSid ?? null;
        log.info({ callSid: this.callSid, streamSid: this.streamSid }, "Twilio media stream started");
        this.latestMediaTs = 0;
        this.responseStartTs = null;
        break;

      case "media":
        this.latestMediaTs = data.media?.timestamp ?? this.latestMediaTs;
        if (this.openAiWs.readyState === WebSocket.OPEN) {
          this.send({ type: "input_audio_buffer.append", audio: data.media?.payload });
        }
        break;

      case "mark":
        this.markQueue.shift();
        break;

      case "stop":
        this.cleanup();
        break;
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  cleanup() {
    if (this.openAiWs.readyState === WebSocket.OPEN) {
      this.openAiWs.close();
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private send(event: object) {
    if (this.openAiWs.readyState === WebSocket.OPEN) {
      this.openAiWs.send(JSON.stringify(event));
    }
  }

  private sendToTwilio(event: object) {
    if (this.twilioWs.readyState === WebSocket.OPEN) {
      this.twilioWs.send(JSON.stringify(event));
    }
  }
}
