# Realtime API: does a longer `instructions` string cost us latency? — July 2026

Researched 2026-07-29. Sources are OpenAI primary only: `developers.openai.com`
docs, the Realtime API reference, the changelog and the per-model pages.

**Source-fetching note:** every `developers.openai.com/api/docs/*` page has a
plain-Markdown twin at the same URL with `.md` appended — that is what was
fetched here, so the quotes below are verbatim from OpenAI's own copy rather
than from a rendered-HTML extraction. `openai.com/index/*` (the marketing/eng
blog) returns **HTTP 403** to every fetch attempt, so the post
"How OpenAI delivers low-latency voice AI at scale" could **not** be read; see
caveats.

Every claim below is tagged **[DOC]** (a sentence OpenAI publishes),
**[SCHEMA]** (a field's presence or absence in the API reference),
**[INFER]** (my reasoning from the above), or **[NOT DOCUMENTED]**.

---

## Bottom line

- **Instructions are re-sent to the model on every single Response, not once per
  session. [DOC]** *"The entire conversation is sent to the model for each
  Response"*, and `instructions` are *"the default system instructions (i.e.
  system message) **prepended to model calls**"*. There is no "upload once,
  amortise over the call" mechanism in the Realtime API.
- **But you are almost certainly not paying full freight for them, in money or
  in time.** Realtime supports automatic prompt caching, and instructions sit at
  the very front of the prefix — the single most cacheable position. Cached text
  input on `gpt-realtime-2` is **$0.40/M vs $4.00/M**, a **90% discount [DOC]**,
  and OpenAI describes a cache hit as *"decreases latency and bills those tokens
  at the cached-input rate"* **[DOC]**.
- **OpenAI's only published number on prompt length vs latency says it barely
  matters: *"cutting 50% of your prompt may only result in a 1-5% latency
  improvement"*. [DOC]** That sentence is in the general latency guide, not the
  Realtime guide — it is the closest documented figure but it is not
  Realtime-specific. **[INFER]** applying it here.
- **`gpt-realtime-2` was explicitly built for bigger prompts. [DOC]** The
  release note for it reads: *"expands the realtime context window from 32k to
  128k tokens, making it better suited for long sessions **and larger system
  prompts**."* 10.1k tokens is 7.9% of that window.
- **There is no documented maximum or recommended length for `instructions`.
  [NOT DOCUMENTED / SCHEMA]** No `maxLength` appears anywhere in the Realtime
  API reference. The only length-ish guidance is stylistic: *"Start simple. Do
  not over-prompt upfront."*
- **What actually dominates time-to-first-audio is turn detection and reasoning
  effort, both of which we control and neither of which is instruction length.
  [DOC + INFER]** `semantic_vad` — which we use — is documented as *"may have a
  higher latency"* than `server_vad`, and reasoning effort is documented as a
  direct latency dial.
- **We can measure all of this ourselves today and currently do not.** The
  `response.done` usage payload carries `cached_tokens` and
  `cached_tokens_details` **[DOC]**; `src/realtime/session.ts:1178` logs
  `response.done` but throws the `usage` object away. Fixing that is a two-line
  change and turns this whole question from argument into data.

---

## 1. Are `instructions` processed once per session, or on every response?

**Direct answer: on every Response. A longer `instructions` string is part of
the input to every assistant turn, not just session setup. [DOC]**

Three independent statements in OpenAI's docs say the same thing.

From the Realtime cost guide, "Per-Response costs" **[DOC]**:

> Realtime API costs are accrued when a Response is created, and is charged
> based on the numbers of input and output tokens […] **The entire conversation
> is sent to the model for each Response.** The output from a turn will be added
> as Items to the server Conversation and become the input to subsequent turns,
> thus turns later in the session will be more expensive.

From the API reference, the definition of `session.instructions` **[DOC]**:

> The default system instructions (i.e. system message) **prepended to model
> calls**. This field allows the client to guide the model on desired
> responses.

"Model calls", plural — the instructions are prepended to each one, not
installed once into the session.

From the same cost guide's worked example, which is the clearest proof because
it counts the tokens twice **[DOC]**:

> For the first turn in the conversation we've added 100 tokens of
> instructions, a user message of 20 audio tokens […] for a total of 120 input
> tokens. […] The Conversation at this point includes **the initial
> instructions**, first user message, the output assistant message from the
> first turn, plus the second user message (25 audio tokens). This turn will
> have 110 text and 64 audio tokens for input.

Turn 2's 110 text tokens = the same 100 instruction tokens + 10 text tokens of
the turn-1 assistant output. The instructions are counted again.

Corroborating **[SCHEMA]**: the truncation control is named
`token_limits.post_instructions` and is documented as *"Maximum tokens allowed
in the conversation **after** instructions (which including tool definitions)"*
— instructions are structurally exempt from truncation because they are always
present in every Response's input.

### The important qualifier: "sent to the model" ≠ "recomputed by the model"

**[DOC]** Realtime supports prompt caching, from the cost guide's "Caching"
section:

> Realtime API supports prompt caching, which is applied automatically and can
> dramatically reduce the costs of input tokens during multi-turn sessions.
> Caching applies when the input tokens of a Response match tokens from a
> previous Response, though this is best-effort and not guaranteed.
>
> The best strategy for maximizing cache rate is keep a session's history
> static. Removing or changing content in the conversation will "bust" the cache
> up to the point of the change […] **Note that instructions and tool
> definitions are at the beginning of a conversation, thus changing these
> mid-session will reduce the cache rate for subsequent turns.**

**[DOC]** And from the prompt-caching guide, on what a cache hit does:

> **Cache Hit**: If a matching prefix is found, the system uses the cached
> result. **This decreases latency** and bills those tokens at the cached-input
> rate.

**[INFER]** So the honest answer to Q1 is two-part: *logically*, the full
instruction block is input to every turn; *physically*, on a cache hit its
prefill is not recomputed, so its marginal latency contribution on turns 2..N
should be close to zero. Instructions are the best-positioned content in the
whole payload for this — they are the literal first bytes of the prefix and they
never change within a call.

**[NOT DOCUMENTED]** OpenAI does not state a cache hit rate, a prefill-time
saving in milliseconds, or whether the cached prefix survives *across* Realtime
sessions (i.e. whether call #2 to the same tenant re-uses call #1's prefix). The
caching guide's general model — *"OpenAI routes API requests to servers that
recently processed the same prompt"* with in-memory retention of *"5 to 10
minutes of inactivity, up to a maximum of one hour"* — suggests cross-call reuse
is possible for a busy tenant, but the Realtime docs never say so and I will not
assert it.

**Note on ordering, which is actionable:** we send `instructions` once in the
initial `session.update` and never change them mid-call
(`src/realtime/session.ts:1033`). That is exactly right, and the doc quote above
says why: changing instructions or tools mid-session busts the cache for every
subsequent turn. Our second `session.update` touches only
`audio.input.turn_detection` (`session.ts:1101`), which is session config, not
conversation content — **[INFER]** it should not affect the cached prefix, but
that is inference, not documented.

---

## 2. Is there a documented limit or recommended maximum for `instructions`?

**Direct answer: no. There is no documented maximum, no recommended length, and
no `maxLength` constraint in the schema. [NOT DOCUMENTED / SCHEMA]**

What does exist:

| Bound | Value | Source |
|---|---|---|
| Model context window | 128,000 tokens | [gpt-realtime-2 model page](https://developers.openai.com/api/docs/models/gpt-realtime-2) **[DOC]** |
| Max output tokens | 32,000 | same **[DOC]** |
| Effective input ceiling | context window minus max output tokens | `token_limits.post_instructions` *"cannot be higher than the model's context window size minus the maximum output tokens"* **[DOC]** |
| `instructions` string length | **no constraint published** | Realtime API reference — zero `maxLength` occurrences **[SCHEMA]** |

The nearest thing to a length recommendation is a design steer, not a limit
([Using realtime models](https://developers.openai.com/api/docs/guides/realtime-models-prompting)) **[DOC]**:

> Start simple. Do not over-prompt upfront. Begin with a minimal prompt, run
> evaluations, then add instructions only for behaviors that fail in testing.

And structural advice **[DOC]**: *"Use short, labeled sections. The model should
be able to find the relevant instructions quickly"* — with a suggested skeleton
of `# Role and Objective / # Personality and Tone / # Language / # Reasoning /
# Message Channels / # Preambles / # Verbosity / # Tools / # Unclear Audio /
# Entity Capture / # Long Context Behavior / # Escalation`.

Two more warnings that bear on a *growing* prompt more than a *long* one **[DOC]**:

> **Instruction conflicts are more costly** — Remove overlapping `always`,
> `never`, `only`, and `must` rules unless they are truly required. Define
> priority when rules compete.

> **Prompt precision matters more** — Replace broad guidance like "be helpful"
> with clear trigger, action, and exception rules.

**[INFER]** For `gpt-realtime-2` the documented risk of a 10.1k prompt is
*behavioural* (contradictory rules degrading instruction-following), not
*latency*. That is the axis to police as it grows.

Finally, the explicit endorsement of large prompts on this model **[DOC]**:

> **Expanded context window** — `gpt-realtime-2` expands the realtime context
> window from 32k to 128k tokens, making it better suited for long sessions and
> **larger system prompts**.

---

## 3. Billing: how are `instructions` tokens charged, and does caching apply?

**Direct answer: charged as input tokens on every Response, at the text-input
rate, with an automatic 90% discount on the portion served from cache. [DOC]**

### Current `gpt-realtime-2` rates (per 1M tokens)

| Modality | Input | Cached input | Output |
|---|---:|---:|---:|
| **Text** | **$4.00** | **$0.40** | **$24.00** |
| **Audio** | **$32.00** | **$0.40** | **$64.00** |
| Image | $5.00 | $0.50 | — |

Sources: [gpt-realtime-2 model page](https://developers.openai.com/api/docs/models/gpt-realtime-2)
and the [pricing index](https://developers.openai.com/api/docs/pricing) — both
OpenAI-hosted, and they agree on every figure. **[DOC]**

The cached-input discount is therefore **90% on text** ($0.40 vs $4.00) and
**98.75% on audio** ($0.40 vs $32.00). `gpt-realtime-2.1` and `gpt-realtime-1.5`
carry identical input/cached-input rates (2.1 matches 2 exactly; 1.5 differs
only on text output, $16.00 vs $24.00), so **[INFER]** a model rollback does not
change the arithmetic below.

`instructions` are text, so they bill at the **text** row.

### What a 10.1k-token instruction block actually costs

**[INFER]** — arithmetic on the documented rates, not an OpenAI figure:

| Scenario | Per Response | Over a 20-response, 5-minute call |
|---|---:|---:|
| 10.1k instruction tokens, **never cached** | $0.0404 | **$0.808** |
| 10.1k instruction tokens, **cached from turn 2** | $0.0040 | **$0.081** |
| The +2,900-token growth alone, uncached | $0.0116 | $0.232 |
| The +2,900-token growth alone, cached | $0.0012 | $0.023 |

So the cache is worth roughly **72 cents per call** at this prompt size. That is
not a rounding error against a receptionist call — it is the single largest
lever on the per-call bill, and it is free and automatic as long as we do not
mutate instructions or tools mid-session. Which we don't.

### Cache mechanics, and what does *not* apply here

| Fact | Value | Tag |
|---|---|---|
| Caching enabled for Realtime | Yes, automatic, "best-effort and not guaranteed" | **[DOC]** |
| Minimum prefix for a cache hit | 1024 tokens (general caching guide) | **[DOC]** |
| Cache reported in | `usage.input_token_details.cached_tokens` on `response.done` | **[DOC]** |
| Breakdown by modality | `cached_tokens_details.{text,audio,image}_tokens` | **[DOC]** |
| Cache-write surcharge | 1.25× uncached rate — **GPT-5.6 family and later only** | **[DOC]** |
| Does that surcharge apply to `gpt-realtime-2`? | **Unknown.** No `cache_write_tokens` field exists anywhere in the Realtime API reference, and no realtime price table has a cache-write column | **[SCHEMA] / [NOT DOCUMENTED]** |
| Explicit cache breakpoints in Realtime | `prompt_cache_breakpoint` exists on `ResponseInputText` content blocks; there is **no** session-level `prompt_cache_options` | **[SCHEMA]** |
| Cache TTL for Realtime | **not documented** — the TTL text (30m / 5-10min in-memory / 24h extended) lives in the caching guide, which never mentions the Realtime API | **[NOT DOCUMENTED]** |

**[INFER]** The absence of `cache_write_tokens` from the Realtime schema is
reasonable evidence that cache writes are not separately billed on
`gpt-realtime-2` — you cannot be billed on a number the API never reports — but
it is an argument from silence and I would not build a budget on it.

The pricing page's footnote closes the "is Realtime priced differently" question
outright **[DOC]**: *"Responses API, Chat Completions API, Realtime API, Batch
API, and Assistants API are not priced separately. Tokens are billed at the
chosen model's input and output rates."*

---

## 4. What actually dominates time-to-first-audio?

**Direct answer: OpenAI publishes no latency budget or breakdown for Realtime.
What it *does* document as latency levers, in the order it emphasises them, is
(1) reasoning effort, (2) turn-detection mode and its timeouts, (3) model size
— and it separately says input-token count is a weak lever. Instruction length
is not on the list. [DOC + INFER]**

### The levers OpenAI documents

**Reasoning effort — documented as a direct latency trade [DOC].** From the
`gpt-realtime-2` model page: *"GPT-Realtime-2 supports configurable reasoning
effort. **Higher reasoning effort can increase latency** and output token
usage."* From the prompting guide: *"`gpt-realtime-2` can trade latency for
deeper reasoning. Use the lowest reasoning level that still gives the assistant
enough intelligence for the workflow."*

| Effort | OpenAI's stated use | Example given |
|---|---|---|
| `minimal` | "Lowest latency matters most and the task is simple" | Smart-home commands, timers |
| `low` | "You need responsiveness plus basic reasoning" | **Customer support, order lookup, simple policy questions** |
| `medium` | "The assistant must reason through multi-step tasks" | Technical support, diagnostics, complex routing |
| `high` | "Deeper reasoning materially improves success" | High-precision workflows, escalation decisions |
| `xhigh` | "Maximum reasoning is worth added latency and cost" | Complex planning, critical triage |

Source: [Using realtime models](https://developers.openai.com/api/docs/guides/realtime-models-prompting) **[DOC]**.
Our `OPENAI_REALTIME_REASONING_EFFORT` default of `low` is exactly what OpenAI
recommends: *"Start with `reasoning.effort` set to `low` for most production
voice agents, then adjust based on latency tolerance and task complexity."*

**Turn detection — documented as a latency trade, and we are on the slower side
[DOC].** From the Realtime API reference:

> Semantic VAD is more advanced and uses a turn detection model (in conjunction
> with VAD) to semantically estimate whether the user has finished speaking,
> then dynamically sets a timeout based on this probability. For example, if
> user audio trails off with "uhhm", the model will score a low probability of
> turn end and wait longer for the user to continue speaking. This can be useful
> for more natural conversations, but **may have a higher latency**.

We run `semantic_vad` with `eagerness` unset, i.e. `auto` = `medium`
(`src/realtime/session.ts:1107`). Documented alternatives **[DOC]**:
`eagerness: "high"` *"will chunk the audio as soon as possible"*, and
`server_vad` exposes `silence_duration_ms` where *"with shorter values turns
will be detected more quickly"* (example config shows 500 ms).

**[INFER]** This is the load-bearing point for PickupAI. The gap between "caller
stopped talking" and "semantic classifier decides they're done" is measured in
hundreds of milliseconds and is a *wall-clock wait before inference even
starts*. It is plausibly larger than the entire prefill cost of a cached 10.1k
prompt. If perceived latency is the problem, `eagerness` is the dial, not the
prompt.

**Model choice [DOC].** `gpt-realtime-2.1-mini` exists at a third of the price
($0.60/M text in, $10/M audio in) and is described as *"a fast, reliable
non-reasoning speech-to-speech model"*; the cost guide notes the mini models are
*"significantly cheaper"* with the tradeoff *"intelligence related to
instruction following and function calling"*. **[INFER]** For a 10.1k-token
prompt whose whole point is instruction following, mini is the wrong trade.

**Perceived vs actual latency [DOC].** OpenAI treats these as separate problems
and gives preambles as the fix: *"Preambles are short spoken updates that keep a
voice agent feeling responsive while it reasons, looks something up, or calls a
tool […] Used poorly, they become filler and **increase perceived latency**."*
Guidance: *"Use one short sentence. Do not exceed two short sentences."*

### Where input length sits among these

The only quantified statement OpenAI publishes anywhere on prompt length vs
latency is in the [latency optimization
guide](https://developers.openai.com/api/docs/guides/latency-optimization),
under "Use fewer input tokens" **[DOC]**:

> While reducing the number of input tokens does result in lower latency, this
> is **not usually a significant factor** – **cutting 50% of your prompt may only
> result in a 1-5% latency improvement**. Unless you're working with truly
> massive context sizes (documents, images), you may want to spend your efforts
> elsewhere.

Contrast with the same guide on output **[DOC]**: *"Generating tokens is almost
always the highest latency step when using an LLM: as a general heuristic,
**cutting 50% of your output tokens may cut ~50% your latency**."*

And its cache advice, which we already satisfy by construction **[DOC]**:
*"**Maximize shared prompt prefix**, by putting dynamic portions (e.g. RAG
results, history, etc) later in the prompt."* Our instructions are static within
a call and everything dynamic (the conversation) comes after them.

**⚠️ Scope caveat: that 1-5% figure is from the *general* latency guide, which
is written around Chat/Responses and predates the Realtime-specific docs. OpenAI
has never restated it for Realtime.** Applying it to `gpt-realtime-2` is
**[INFER]**. Two reasons it should transfer — the underlying cost is transformer
prefill, and Realtime prefill benefits from the same caching — and one reason to
be cautious: a voice turn's total budget is much smaller than a chat request's,
so the *same absolute* prefill cost is a *larger percentage* of a voice turn.
A 1-5% figure on a 3-second chat response and on a 700 ms voice turn are not the
same thing.

**[NOT DOCUMENTED]** OpenAI publishes no time-to-first-audio target, no
component breakdown, and no measured prefill cost for Realtime. Network RTT
Sydney→OpenAI, Twilio's media path and our own WebSocket relay are entirely
outside their docs.

---

## 5. Does `reasoning.effort` interact with instruction length?

**Direct answer: not documented. No OpenAI page connects the two. [NOT DOCUMENTED]**

What is documented, separately **[DOC]**: higher effort *"can increase latency
and output token usage"*, and longer input has a *"not usually significant"*
latency effect. Nothing states that the effect of one depends on the other.

**[INFER]**, flagged clearly as unverified reasoning: reasoning effort governs
how many internal reasoning tokens are *generated* before the spoken answer, and
generation is the expensive phase; instruction length governs *prefill*, which
caching largely eliminates after turn 1. These are different phases of
inference, so a first-order independent model is the reasonable prior. The
plausible second-order coupling is behavioural rather than mechanical — a longer
prompt with more rules and more decision points gives a reasoning model more to
deliberate over, which could produce more reasoning tokens at the same `effort`
setting. **That is speculation and OpenAI does not say it.** It is, however,
directly measurable: `usage.output_token_details` on `response.done` breaks out
output tokens, so a before/after comparison at fixed `effort` would settle it.

There is one documented *behavioural* lever worth pairing with `effort` **[DOC]**
— the prompting guide recommends steering reasoning in the prompt itself, not
only via the API field:

> - For direct answers, simple lookups, and short confirmations, respond quickly
>   and do not reason.
> - For multi-step tasks, tool decisions, troubleshooting, or escalation, reason
>   before acting.
> - Do not perform extended reasoning when the user's audio is unclear; ask for
>   clarification instead.

**[INFER]** For a receptionist, most turns are "capture a detail and confirm it"
— exactly the "respond quickly and do not reason" case. A `## Reasoning` section
saying so may buy more first-audio latency than deleting 3k tokens would.

---

## 6. Can we measure this ourselves? Yes — and we currently throw the data away

**Direct answer: yes. `response.done` carries a full usage payload including
cache hits, and `input_audio_buffer.speech_stopped` carries a session-relative
millisecond timestamp. Together they let us compute both cache rate and
time-to-first-audio per turn, entirely from documented fields. [DOC/SCHEMA]**

### The `response.done` usage payload — verbatim from the cost guide **[DOC]**

```json
{
  "type": "response.done",
  "response": {
    "usage": {
      "total_tokens": 253,
      "input_tokens": 132,
      "output_tokens": 121,
      "input_token_details": {
        "text_tokens": 119,
        "audio_tokens": 13,
        "image_tokens": 0,
        "cached_tokens": 64,
        "cached_tokens_details": {
          "text_tokens": 64,
          "audio_tokens": 0,
          "image_tokens": 0
        }
      },
      "output_token_details": {
        "text_tokens": 30,
        "audio_tokens": 91
      }
    }
  }
}
```

Confirmed against the API reference **[SCHEMA]**: `realtime_response_usage` has
children `input_token_details` → `{audio_tokens, cached_tokens,
cached_tokens_details, image_tokens, text_tokens}`. Note `cache_write_tokens`
appears **zero** times in the Realtime server-events reference.

**The single number that answers Q1 empirically** is
`input_token_details.cached_tokens_details.text_tokens` on turns 2..N. If it is
≥ our instruction token count, the instructions were served from cache and their
prefill is not being recomputed. If it is 0 or small, we are paying full text
input on every turn and the growth is a genuine cost problem.

### Concrete fields to log

At `src/realtime/session.ts:1178` the `response.done` handler logs
`response.id`, `status` and `status_details` and discards `response.usage`. Add:

| Field | Why |
|---|---|
| `response.usage.input_tokens` | total input per turn; shows conversation growth |
| `response.usage.input_token_details.text_tokens` | should be ≈ instructions + tools + transcript text |
| `response.usage.input_token_details.cached_tokens` | **the cache-hit answer** |
| `response.usage.input_token_details.cached_tokens_details.text_tokens` | isolates cached *instruction* text from cached audio |
| `response.usage.output_tokens` and `output_token_details.{text,audio}_tokens` | the dominant latency term per the latency guide; also the reasoning-effort probe for Q5 |
| a locally computed turn index | cache behaviour differs on turn 1 vs turn N |

### Timing fields — what exists and what doesn't

**[SCHEMA]** `input_audio_buffer.speech_stopped.audio_end_ms` is documented as:

> Milliseconds since the session started when speech stopped. This will
> correspond to the end of audio sent to the model, and thus includes the
> `min_silence_duration_ms` configured in the Session.

**[NOT DOCUMENTED]** There is **no** server-side latency, elapsed-time or
generation-duration field on `response.created` or `response.done`. Realtime
events carry `event_id`, not timestamps.

**[INFER]** So the measurement has to be client-side, which is fine — we own the
socket and the clock. Stamp `Date.now()` on:

1. `input_audio_buffer.speech_stopped` — caller finished speaking (cross-check
   against `audio_end_ms` for session-relative drift)
2. `response.created` — OpenAI accepted the turn
3. the **first** `response.output_audio.delta` — first audio byte we can forward
   to Twilio (`session.ts:1170`)

`(3) − (1)` is our real time-to-first-audio. `(2) − (1)` isolates the
turn-detection wait, i.e. the `semantic_vad` cost. `(3) − (2)` isolates model
prefill + reasoning + first-token generation — the only window instruction
length can possibly live in. **Splitting the metric at `response.created` is
what makes the experiment conclusive**, because it separates the VAD wait from
the inference time.

**The A/B that settles it:** run the same eval scenarios at 10.1k instructions
and at a trimmed ~7k, holding model, `reasoning.effort`, `eagerness` and
scenario fixed, and compare the distribution of `(3) − (2)` and of
`cached_tokens`. The eval harness already exists. **[INFER]** — this design is
mine; OpenAI documents no methodology.

**[DOC]** OpenAI's own suggested approach for token measurement is coarser:
*"use the Realtime Playground with your intended prompts and functions, and
measure the token usage over a sample session. The token usage for a session can
be found under the Logs tab in the Realtime Playground next to the session id."*
Good for a one-off token count; useless for per-turn latency on a real Twilio
call.

---

## Could not confirm / caveats

1. **`openai.com/index/delivering-low-latency-voice-ai-at-scale/` returns HTTP
   403** to WebFetch and to curl with a browser UA. It is an OpenAI engineering
   post whose title suggests it is the single most relevant source for Q4, and I
   could not read one word of it. Everything in Q4 comes from the docs instead.
   The same 403 on `openai.com/*` was recorded in
   `docs/research/openai-platform-2026-07.md` — it is a persistent block, not a
   transient failure. **If anyone can open that page in a browser, it should be
   read before treating Q4 as closed.**
2. **The 1-5% prompt-length figure is not Realtime-specific.** It is the general
   latency guide's number. OpenAI has never restated it for Realtime, and a
   voice turn's latency budget is far tighter than a chat request's, so the
   percentage may not transfer even if the absolute milliseconds do.
3. **No cache hit rate, TTL, or cross-session reuse is documented for Realtime.**
   The caching guide's TTL numbers (30m for GPT-5.6+, 5-10 min in-memory, 24h
   extended) are stated for Responses/Chat and the guide never names the Realtime
   API. Whether a second call to the same tenant minutes later re-uses the first
   call's cached instruction prefix is **unknown** — and it matters, because
   turn 1 of every call is where an uncached 10.1k prompt would actually hurt.
   Measurable: log `cached_tokens` on the **first** `response.done` of a call and
   see whether it is non-zero on back-to-back calls.
4. **Whether the 1.25× cache-write surcharge applies to `gpt-realtime-2` is
   unresolved.** It is documented for "GPT-5.6 models and later model families".
   `gpt-realtime-2` is not named, has no `cache_write_tokens` field, and no
   realtime pricing row has a cache-write column. Treated as "probably not
   applicable" but not confirmed.
5. **No documented `instructions` length limit is not the same as no limit.**
   The absence of `maxLength` in the reference is evidence, not proof. A very
   long string could still be rejected or silently truncated at some threshold
   OpenAI has not published.
6. **Whether our second `session.update` (turn_detection only) busts the cache**
   is inference. OpenAI documents that changing *instructions and tool
   definitions* mid-session hurts the cache rate; it says nothing about
   audio/VAD config, which is not conversation content. Also measurable — it
   would show as a `cached_tokens` collapse on the first response after
   `enableNormalTurnTaking()` fires.
7. **`gpt-realtime-2.1` was not re-verified here.** Its pricing was read from
   the pricing index and matches `gpt-realtime-2` exactly on input, cached input
   and audio output. Per `docs/research/openai-platform-2026-07.md` it is the
   newer model with better alphanumeric recognition; the analysis above applies
   unchanged.

---

## What this means for PickupAI

**The +40% growth from 7.2k to 10.1k tokens is not a latency problem, and is a
manageable cost problem that we are probably already solving by accident.**

The reasoning, laid out honestly:

- Instructions *are* re-sent every turn **[DOC]** — so the naive fear is
  well-founded in principle.
- But they sit at the front of a prefix that never changes within a call, which
  is the ideal case for automatic prompt caching, and a cache hit is documented
  to reduce both cost (90% off text input) and latency **[DOC]**.
- The only number OpenAI publishes on prompt length vs latency says halving the
  prompt buys 1-5% **[DOC]**. Even taking the pessimistic end and assuming it
  transfers poorly to voice, deleting 3k tokens is not where a perceptible
  win lives.
- 10.1k is **7.9% of a 128k window** on a model whose release note explicitly
  advertises support for "larger system prompts" **[DOC]**.

**Do these three things, roughly in order of value per unit of effort:**

1. **Log the `response.done` usage payload** (fields listed in §6). Two lines at
   `src/realtime/session.ts:1178`. Until `cached_tokens` is in the logs, every
   opinion here — including mine — is inference. It also gives us per-call cost
   for free, which we do not currently have. This converts a recurring argument
   into a dashboard number.
2. **Instrument the three-point timing split** (`speech_stopped` →
   `response.created` → first `output_audio.delta`). If time-to-first-audio is
   ever raised as a complaint, this tells us in one log line whether the culprit
   is the `semantic_vad` wait or the model, and those have completely different
   fixes. My expectation **[INFER]** is that `(2) − (1)` — the VAD wait — is the
   larger term, and if so, `eagerness: "high"` is a far bigger lever than any
   prompt edit.
3. **Police the prompt on the axis OpenAI actually warns about, which is
   contradiction, not length.** *"Instruction conflicts are more costly […]
   Remove overlapping `always`, `never`, `only`, and `must` rules"* **[DOC]**. A
   10.1k prompt that grew by accretion across the recent behaviour fixes
   (callback numbers, urgency handling, caller-intent branches) is exactly the
   shape that accumulates competing `always`/`never` rules. That is a live risk
   to answer quality on a real call — unlike its length, which is not.

**What *not* to do:** do not trim the prompt for latency reasons. Trim it for
clarity reasons if the eval pass rate justifies it, and measure before and after
either way. And do not touch `instructions` or `tools` mid-call to "save
tokens" — that is the one thing OpenAI documents as actively harmful, because it
busts the cache for every remaining turn **[DOC]**.

**One thing to watch as the prompt grows further:** the cache almost certainly
does not help turn 1 of a call, and turn 1 is the greeting — the moment a caller
is most sensitive to dead air. Our greeting is triggered by us
(`maybeGreet()`, `session.ts:1138`) after `session.updated`, so its prefill is
on the critical path of the caller's first impression. **[INFER]** If anything
about a long prompt hurts perceptibly, it is there and nowhere else — and
caveat 3 above (does a cached prefix survive between calls?) is the open
question that decides it. That is measurable with the §6 logging on the first
`response.done` of back-to-back calls, and it is the one experiment worth
running before the prompt grows past ~15k.
