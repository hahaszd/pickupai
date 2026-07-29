/**
 * What one inbound call costs, end to end.
 *
 *   npx tsx scripts/cost-per-call.ts
 *   npx tsx scripts/cost-per-call.ts --minutes 3 --prompt-tokens 10143
 *
 * Every unit price below is from a primary source and dated. Re-check them
 * before quoting the output anywhere that matters — see
 * docs/research/per-call-cost-inputs-2026-07.md.
 *
 * The one number that is NOT verifiable from a price list is how a real call
 * splits between silence, caller speech and assistant speech. That is an
 * assumption, stated below and easy to change, and the usage logging added to
 * session.ts on 2026-07-29 will replace it with measurements from the first
 * real calls.
 */

// ── Unit prices ─────────────────────────────────────────────────────────────

/**
 * twilio.com/en-us/voice/pricing/au + the linked pricing CSVs — **USD**, 2026-07-29.
 *
 * The page is headed "Australia" and an automated read of it reported AUD.
 * That is wrong: Australia is the DESTINATION, and Twilio prices everything in
 * USD (it supports only USD/GBP/JPY as account currencies). Getting this
 * backwards understated the Twilio side by a third.
 */
const TWILIO_USD = {
  inboundVoicePerMin: 0.0100,
  /** Charged ON TOP of the voice minute. The line item most people miss. */
  mediaStreamsPerMin: 0.0044,
  smsPerSegment: 0.0515,
  /**
   * An AU LOCAL number is not SMS-capable (Twilio's numbers CSV: SMS Enabled =
   * No), so sending requires the mobile number or an alphanumeric sender ID.
   * The local number alone is $3.00 and cannot do the job.
   */
  numberPerMonth: 8.25
};

/** mobilemessage.com.au — AUD ex GST, 500+ tier, 2026-07-29. */
const MOBILE_MESSAGE_AUD = { smsPerSegment: 0.04 };

/** developers.openai.com/api/docs/pricing — USD per 1M tokens, gpt-realtime-2, 2026-07-29. */
const OPENAI_USD_PER_M = {
  textIn: 4.00,
  textInCached: 0.40,
  textOut: 24.00,
  audioIn: 32.00,
  audioInCached: 0.40,
  audioOut: 64.00
};

/**
 * developers.openai.com/api/docs/guides/realtime-costs, quoted verbatim:
 * "Audio tokens in user messages are 1 token per 100 ms of audio" and
 * "Audio tokens in assistant messages are 1 token per 50ms of audio".
 */
const AUDIO_TOKENS_PER_MIN = { user: 600, assistant: 1200 };

/** Stated, not looked up — a spot rate belongs in the caller, not the model. */
const USD_TO_AUD = 1.50;

// ── Call-shape assumptions ──────────────────────────────────────────────────

const ASSUMPTIONS = {
  /** Share of wall-clock the assistant is speaking. Eval transcripts sit near this. */
  assistantTalkShare: 0.40,
  /**
   * Share of wall-clock billed as user audio input. Set to 1.0 deliberately:
   * we stream continuously and this is the pessimistic reading. If OpenAI only
   * bills committed buffers, the real figure is lower and so is the total.
   */
  userAudioShare: 1.0,
  /** Assistant responses per minute of call. */
  responsesPerMin: 4,
  /** Text tokens the assistant emits per response — mostly save_lead arguments. */
  textOutPerResponse: 150,
  /** Segments in the owner SMS. Today's GSM-7 work took a realistic lead to 2. */
  ownerSmsSegments: 2,
  /** The caller confirmation SMS. */
  callerSmsSegments: 1
};

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

/**
 * @param cacheHit fraction of repeat prompt/audio actually served from cache.
 *   1.0 is the assumption everything above rests on. It is NOT documented that
 *   a cached prefix survives between calls, and turn 1 can never be warm — so
 *   this is the single largest uncertainty in the model, worth ~5x.
 */
function costOneCall(minutes: number, promptTokens: number, cacheHit = 1.0) {
  const a = ASSUMPTIONS;
  const responses = Math.max(1, Math.round(minutes * a.responsesPerMin));

  // ── OpenAI, USD ──
  // Instructions are re-prepended to EVERY response (documented), so what keeps
  // this from scaling with turn count is the cache, not the send pattern.
  const promptFirst = (promptTokens * OPENAI_USD_PER_M.textIn) / 1e6;
  const repeatRate =
    cacheHit * OPENAI_USD_PER_M.textInCached + (1 - cacheHit) * OPENAI_USD_PER_M.textIn;
  const promptRest = ((responses - 1) * promptTokens * repeatRate) / 1e6;

  const userAudioTokens = minutes * a.userAudioShare * AUDIO_TOKENS_PER_MIN.user;
  const asstAudioTokens = minutes * a.assistantTalkShare * AUDIO_TOKENS_PER_MIN.assistant;

  // Each chunk of audio is billed fresh once, then re-sent at the cached rate on
  // every later response. Average accumulated ≈ half the total, per response.
  const audioInFresh = (userAudioTokens * OPENAI_USD_PER_M.audioIn) / 1e6;
  const audioOut = (asstAudioTokens * OPENAI_USD_PER_M.audioOut) / 1e6;
  const audioRepeatRate =
    cacheHit * OPENAI_USD_PER_M.audioInCached + (1 - cacheHit) * OPENAI_USD_PER_M.audioIn;
  const audioResent =
    (((userAudioTokens + asstAudioTokens) / 2) * responses * audioRepeatRate) / 1e6;

  const textOut = (responses * a.textOutPerResponse * OPENAI_USD_PER_M.textOut) / 1e6;

  const openaiUsd = promptFirst + promptRest + audioInFresh + audioOut + audioResent + textOut;

  // ── Twilio: priced in USD, converted here ──
  const voice = minutes * TWILIO_USD.inboundVoicePerMin * USD_TO_AUD;
  const stream = minutes * TWILIO_USD.mediaStreamsPerMin * USD_TO_AUD;
  const sms = (a.ownerSmsSegments + a.callerSmsSegments) * TWILIO_USD.smsPerSegment * USD_TO_AUD;
  const twilioAud = voice + stream + sms;

  return {
    minutes, responses,
    openaiAud: openaiUsd * USD_TO_AUD,
    breakdownAud: {
      promptFirst: promptFirst * USD_TO_AUD,
      promptRest: promptRest * USD_TO_AUD,
      audioIn: audioInFresh * USD_TO_AUD,
      audioOut: audioOut * USD_TO_AUD,
      audioResent: audioResent * USD_TO_AUD,
      textOut: textOut * USD_TO_AUD,
      voice, stream, sms
    },
    twilioAud,
    totalAud: openaiUsd * USD_TO_AUD + twilioAud
  };
}

const promptTokens = arg("prompt-tokens", 10143);
const only = process.argv.indexOf("--minutes");
const durations = only >= 0 ? [arg("minutes", 3)] : [1, 2, 3, 5];

console.log(`\nCost of one inbound call — AUD, prompt ${promptTokens} tokens, USD→AUD ${USD_TO_AUD}\n`);
console.log("  min  turns   OpenAI   Twilio    TOTAL    per-call detail");
console.log("  " + "─".repeat(72));
for (const m of durations) {
  const c = costOneCall(m, promptTokens);
  const b = c.breakdownAud;
  console.log(
    `  ${String(m).padStart(3)}  ${String(c.responses).padStart(5)}   ` +
    `$${c.openaiAud.toFixed(3)}   $${c.twilioAud.toFixed(3)}   $${c.totalAud.toFixed(3)}    ` +
    `audio $${(b.audioIn + b.audioOut + b.audioResent).toFixed(3)} · prompt $${(b.promptFirst + b.promptRest).toFixed(3)} · sms $${b.sms.toFixed(3)}`
  );
}

const three = costOneCall(3, promptTokens);
const b = three.breakdownAud;
console.log(`\n  Where a 3-minute call's money goes:`);
for (const [k, v] of Object.entries(b).sort((x, y) => y[1] - x[1])) {
  console.log(`    ${k.padEnd(14)} $${v.toFixed(4)}  ${(100 * v / three.totalAud).toFixed(0)}%`);
}
console.log(`    ${"TOTAL".padEnd(14)} $${three.totalAud.toFixed(4)}`);

// What the growth actually cost, on the axis where it is real.
console.log(`  Cache hit rate is the largest unknown — nothing documents whether a`);
console.log(`  cached prefix survives BETWEEN calls, and turn 1 can never be warm:`);
for (const hit of [1.0, 0.75, 0.5, 0.0]) {
  const c = costOneCall(3, promptTokens, hit);
  console.log(`    ${(hit * 100).toFixed(0).padStart(3)}% cached   3-min call  $${c.totalAud.toFixed(3)}`);
}

const at7k = costOneCall(3, 7235).totalAud;
const at10k = costOneCall(3, 10143).totalAud;
console.log(
  `\n  Prompt 7,235 → 10,143 tokens: $${at7k.toFixed(4)} → $${at10k.toFixed(4)} per 3-min call ` +
  `(+$${((at10k - at7k) * 1000).toFixed(2)} per 1,000 calls)\n`
);
