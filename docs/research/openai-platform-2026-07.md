# OpenAI platform facts — as of July 2026

Researched 2026-07-28. All figures below come from OpenAI primary sources only
(`developers.openai.com/api/docs/*` and the model/pricing pages hosted there).

**Important note on source URLs:** `platform.openai.com/docs/*` now issues a
301 redirect to `developers.openai.com/api/docs/*`. All citations use the new
canonical host. `openai.com/api/pricing` returned **HTTP 403** and could not be
fetched; pricing below is taken instead from
`https://developers.openai.com/api/docs/pricing` and from the per-model pages,
which are OpenAI-hosted primary sources carrying the same numbers.

---

## Bottom line

- **A higher usage tier does not cost more per token.** Tiers change rate ceilings only. Your 30,000 TPM wall on `gpt-4o` is the **Tier 1** limit; Tier 2 (reached at $50 cumulative paid) raises it to **450,000 TPM** at identical per-token pricing. Spend the $50.
- **Leave live voice alone for now.** `gpt-realtime-2` is still a current, non-deprecated model with no announced retirement date. Nothing on the deprecations page names it.
- **But plan a move to `gpt-realtime-2.1`** (released 6 Jul 2026, same price, improved alphanumeric recognition and silence/interruption handling). For an Australian receptionist reading back phone numbers, addresses and quote figures, alphanumeric recognition is the exact axis that matters.
- **Switch the eval assistant side from `gpt-4o` to `gpt-5.6-luna`**: cheaper on input ($1.00 vs $2.50), cheaper on output ($6.00 vs $10.00), a 10× better cache discount, and a Tier-1 rate limit of **500,000 TPM** vs 30,000 — which dissolves the throttling problem on its own.
- **Keep `gpt-4o-mini` for the simulated caller.** At $0.15/$0.60 it is still the cheapest tool-calling model OpenAI lists; nothing newer undercuts it. No deprecation notice.

---

## 1. Do usage tiers cost anything?

**Direct answer: No. Moving to a higher usage tier changes the rate ceiling only. It does not change the per-token price. The belief that a higher tier might cost more per token is incorrect.**

### How tiers are advanced

Advancement is automatic and driven by cumulative amount paid. From the
rate-limits guide: *"As your spend on our API goes up, we automatically graduate
you to the next usage tier. This usually results in an increase in rate limits
across most models."*
([rate-limits](https://developers.openai.com/api/docs/guides/rate-limits))

| Tier | Qualification | Monthly usage limit |
|---|---|---|
| Free | User must be in an allowed geography | $100 / month |
| Tier 1 | $5 paid | $100 / month |
| Tier 2 | $50 paid | $500 / month |
| Tier 3 | $100 paid | $1,000 / month |
| Tier 4 | $250 paid | $5,000 / month |
| Tier 5 | $1,000 paid | $200,000 / month |

Source: [rate-limits](https://developers.openai.com/api/docs/guides/rate-limits).
"Qualification" is cumulative amount paid, not monthly spend. The "usage limit"
column is a spending cap, not a price.

Rate limits are measured in RPM, RPD, TPM, TPD and IPM, and are *"defined at the
organization level and at the project level, not user level."* (same page).

### `gpt-4o` rate limits by tier

| Tier | RPM | TPM |
|---|---|---|
| Tier 1 | 500 | **30,000** |
| Tier 2 | 5,000 | **450,000** |
| Tier 3 | 5,000 | 800,000 |
| Tier 4 | 10,000 | 2,000,000 |
| Tier 5 | 10,000 | 30,000,000 |

Source: [gpt-4o model page](https://developers.openai.com/api/docs/models/gpt-4o).

The 30,000 TPM you are hitting is exactly the Tier 1 figure, which confirms the
account is on Tier 1. Tier 2 is a **15× increase** and is triggered by $50
cumulative paid.

### Why the "no price change" answer is unambiguous

The rate-limits guide does not contain a sentence reading "tiers do not affect
price" — I want to be precise about that. The proof is structural, and it is
conclusive:

- Every model page lists **one** price for the model (e.g. `gpt-4o`: input $2.50,
  cached input $1.25, output $10.00 per 1M tokens) and, **separately**, a
  rate-limit table that varies by tier. Price is a property of the model; the
  tier table sits beside it and only carries RPM/TPM columns. There is no
  per-tier price column anywhere on any model page I fetched (`gpt-4o`,
  `gpt-4o-mini`, `gpt-realtime-2`, `gpt-realtime-2.1`, `gpt-realtime-2.1-mini`,
  `gpt-realtime-1.5`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.4-mini`,
  `gpt-5.4-nano`).
- The pricing page ([pricing](https://developers.openai.com/api/docs/pricing))
  is a flat per-model table with Input / Cached input / Output columns and no
  tier dimension at all.

Sources: [gpt-4o](https://developers.openai.com/api/docs/models/gpt-4o),
[pricing](https://developers.openai.com/api/docs/pricing),
[rate-limits](https://developers.openai.com/api/docs/guides/rate-limits).

**What this means for us:** Pay the $50 to reach Tier 2 — it is a pure 15× rate-limit
unlock on `gpt-4o` with zero effect on the bill per token, and it is the single
cheapest fix for the eval harness throttling.

---

## 2. What Realtime API models exist now?

**Direct answer: `gpt-realtime-2` is still current and is NOT deprecated — it does not appear anywhere on the deprecations page. However, it has been superseded in practice by `gpt-realtime-2.1`, released 6 July 2026, at identical pricing.**

### Currently offered Realtime models

| Model id | Description | Status |
|---|---|---|
| `gpt-realtime-2.1` | Reasoning model with tool use — newest | Current (rel. 6 Jul 2026) |
| `gpt-realtime-2.1-mini` | Faster, lower-cost distilled reasoning model | Current (rel. 6 Jul 2026) |
| `gpt-realtime-2` | Reasoning model with tool use | Current, no retirement date |
| `gpt-realtime-1.5` | "The best voice model for audio in, audio out" | Current |
| `gpt-realtime-translate` | Streaming speech-to-speech translation | Current (rel. 7 May 2026) |
| `gpt-realtime-whisper` | Streaming speech-to-text transcription | Current (rel. 7 May 2026) |
| `gpt-realtime-mini` | Cost-efficient v1 mini | **Deprecated** |

Sources: [models](https://developers.openai.com/api/docs/models),
[realtime guide](https://developers.openai.com/api/docs/guides/realtime),
[changelog](https://developers.openai.com/api/docs/changelog).

Note: the Realtime *guide* foregrounds only `gpt-realtime-2.1`,
`gpt-realtime-translate` and `gpt-realtime-whisper` as the models to build
against, while the models index still lists `gpt-realtime-2` and
`gpt-realtime-1.5` as available. Read that as a soft steer toward 2.1 rather
than a removal of 2.

### Retirements and successors

| Shutdown date | Model | Recommended replacement |
|---|---|---|
| Jan 20, 2027 | `gpt-realtime` | `gpt-realtime-2.1` |
| Jan 20, 2027 | `gpt-realtime-mini` | `gpt-realtime-2.1-mini` |
| May 7, 2026 | `gpt-4o-realtime-preview` | `gpt-realtime-1.5` |
| May 7, 2026 | `gpt-4o-realtime-preview-2025-06-03` | `gpt-realtime-1.5` |
| May 7, 2026 | `gpt-4o-realtime-preview-2024-12-17` | `gpt-realtime-1.5` |
| May 7, 2026 | `gpt-4o-mini-realtime-preview` | `gpt-realtime-mini` |
| Oct 10, 2025 | `gpt-4o-realtime-preview-2024-10-01` | `gpt-realtime-1.5` |

Source: [deprecations](https://developers.openai.com/api/docs/deprecations).

Explicitly confirmed against that page:

- **`gpt-realtime-2` does not appear on the deprecations page at all.** No
  retirement date, no successor entry, no migration note.
- `gpt-realtime-1.5` appears only as a *replacement target* for the retired
  `gpt-4o-realtime-preview` family — it is not itself deprecated.
- The most recent deprecation announcement on the page is dated **20 July 2026**,
  covering legacy audio, realtime and transcription model families for removal
  on **20 January 2027**. That announcement covers the v1 `gpt-realtime` /
  `gpt-realtime-mini` line, not the 2.x line.

The 2.1 release note reads: *"Released GPT-Realtime-2.1, an updated realtime
reasoning model with improved alphanumeric recognition, silence and noise
handling, and interruption behavior. Also released GPT-Realtime-2.1 mini, a
faster, lower-cost distilled reasoning model."*
([changelog](https://developers.openai.com/api/docs/changelog), 6 Jul 2026)

Both `gpt-realtime-2` and `gpt-realtime-2.1` report a 128,000 context window,
32,000 max output tokens, function calling supported, and identical tier rate
limits (Tier 1: 200 RPM / 40,000 TPM; Tier 5: 20,000 RPM / 15M TPM).
Sources: [gpt-realtime-2](https://developers.openai.com/api/docs/models/gpt-realtime-2),
[gpt-realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1).

**What this means for us:** No forced migration and no deadline — the pin on
`gpt-realtime-2` is safe indefinitely as far as any published date goes. But 2.1
is same-price, same-shape, same rate limits, and its headline improvements
(alphanumeric recognition, silence/noise handling, interruption behaviour) are
precisely the failure modes of a phone receptionist, so it is worth an A/B on the
eval harness.

---

## 3. What does Realtime audio cost?

**Direct answer: `gpt-realtime-2` and `gpt-realtime-2.1` are priced identically — audio input $32.00 and audio output $64.00 per 1M tokens. Text is billed separately at $4.00 in / $24.00 out. `gpt-realtime-2.1-mini` is roughly 3× cheaper on audio.**

All figures USD per 1M tokens.

| Model | Modality | Input | Cached input | Output |
|---|---|---|---|---|
| `gpt-realtime-2.1` | Audio | $32.00 | $0.40 | $64.00 |
| `gpt-realtime-2.1` | Text | $4.00 | $0.40 | $24.00 |
| `gpt-realtime-2.1` | Image | $5.00 | $0.50 | — |
| `gpt-realtime-2` | Audio | $32.00 | $0.40 | $64.00 |
| `gpt-realtime-2` | Text | $4.00 | $0.40 | $24.00 |
| `gpt-realtime-2` | Image | $5.00 | $0.50 | — |
| `gpt-realtime-2.1-mini` | Audio | $10.00 | $0.30 | $20.00 |
| `gpt-realtime-2.1-mini` | Text | $0.60 | $0.06 | $2.40 |
| `gpt-realtime-2.1-mini` | Image | $0.80 | $0.08 | — |
| `gpt-realtime-1.5` | Audio | $32.00 | $0.40 | $64.00 |
| `gpt-realtime-1.5` | Text | $4.00 | $0.40 | **$16.00** |

Sources: [pricing](https://developers.openai.com/api/docs/pricing),
[gpt-realtime-2](https://developers.openai.com/api/docs/models/gpt-realtime-2),
[gpt-realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1),
[gpt-realtime-2.1-mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini),
[gpt-realtime-1.5](https://developers.openai.com/api/docs/models/gpt-realtime-1.5).

Yes — Realtime models bill text tokens separately from audio tokens, with their
own rates and their own cached-input rate, as shown above.

### Did pricing change since `gpt-realtime-2` launched?

**Could not confirm a change, and I believe there was none.** I searched the
changelog specifically for pricing entries covering realtime or audio tokens and
found none between the 7 May 2026 launch and today. `gpt-realtime-2`'s current
posted audio price ($32.00 / $64.00) is the same as `gpt-realtime-1.5`'s, which
predates it. I therefore cannot give "old vs new" figures because no price change
is documented. Page tried: [changelog](https://developers.openai.com/api/docs/changelog).

One genuine difference worth noting, though it is a *cross-model* difference and
not a price change to an existing model: **`gpt-realtime-2` charges $24.00 per 1M
text output tokens versus $16.00 on `gpt-realtime-1.5`** — a 50% increase on the
text-output axis when moving from 1.5 to 2.x. Audio pricing is unchanged between
them. The changelog does not comment on this.

The two duration-billed realtime models are priced differently again:
`gpt-realtime-translate` at **$0.034 per minute** of realtime audio, and
`gpt-realtime-whisper` at **$0.017 per minute**, both billed by audio duration
rather than tokens.
Sources: [gpt-realtime-translate](https://developers.openai.com/api/docs/models/gpt-realtime-translate),
[gpt-realtime-whisper](https://developers.openai.com/api/docs/models/gpt-realtime-whisper).

**What this means for us:** Moving `gpt-realtime-2` → `gpt-realtime-2.1` is
cost-neutral, so quality is the only thing to weigh. If per-call voice margin ever
gets tight, `gpt-realtime-2.1-mini` cuts audio cost from $32/$64 to $10/$20 —
worth evaluating for simple call types (hours, address, "we'll call you back")
while keeping full 2.1 for booking and quoting flows.

---

## 4. Better models for the eval harness?

**Direct answer: Yes for the assistant side — `gpt-5.6-luna` beats `gpt-4o` on price, cache economics and rate limits simultaneously. No for the simulated caller — `gpt-4o-mini` at $0.15/$0.60 is still the cheapest tool-calling model OpenAI offers, and nothing newer undercuts it.**

All models below support multi-turn Chat Completions with function/tool calling,
which is the shape the harness needs.

| Model | Input / 1M | Cached input / 1M | Output / 1M | Context | Tier-1 TPM |
|---|---|---|---|---|---|
| `gpt-4o` (current assistant) | $2.50 | $1.25 | $10.00 | — | 30,000 |
| `gpt-4o-mini` (current caller) | $0.15 | $0.075 | $0.60 | — | 200,000 |
| `gpt-5.6-sol` | $5.00 | $0.50 | $30.00 | 1,050,000 | — |
| `gpt-5.6-terra` | $2.50 | $0.25 | $15.00 | 1,050,000 | 500,000 |
| **`gpt-5.6-luna`** | **$1.00** | **$0.10** | **$6.00** | 1,050,000 | **500,000** |
| `gpt-5.4-mini` | $0.75 | $0.075 | $4.50 | 400,000 | — |
| `gpt-5.4-nano` | $0.20 | $0.02 | $1.25 | 400,000 | — |

Sources: [pricing](https://developers.openai.com/api/docs/pricing),
[gpt-4o](https://developers.openai.com/api/docs/models/gpt-4o),
[gpt-4o-mini](https://developers.openai.com/api/docs/models/gpt-4o-mini),
[gpt-5.6-luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna),
[gpt-5.6-terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra),
[gpt-5.4-mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini),
[gpt-5.4-nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano).

### Assistant side: `gpt-4o` → `gpt-5.6-luna`

`gpt-5.6-luna` is described as built for *"cost-sensitive, high-volume
workloads"*, supports Chat Completions, the Responses API and function calling,
and carries a 1.05M context window
([gpt-5.6-luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)).
Against `gpt-4o` it is:

- **60% cheaper on input** ($1.00 vs $2.50)
- **40% cheaper on output** ($6.00 vs $10.00)
- **12.5× cheaper on cached input** ($0.10 vs $1.25) — this is the big one for
  your harness
- **16.7× higher Tier-1 rate limit** (500,000 vs 30,000 TPM)

That last point matters more than the price: switching the assistant side to
`gpt-5.6-luna` **removes the 30,000 TPM throttle without paying anything to move
tiers**, because the limit is per-model and luna's Tier-1 ceiling is already 500K.

Rough per-turn arithmetic on your ~7k-token system prompt plus ~200 output tokens:

| Model | Uncached turn | With the 7k prefix cached |
|---|---|---|
| `gpt-4o` | ~$0.0195 | ~$0.0108 |
| `gpt-5.6-luna` | ~$0.0082 | ~$0.0019 |

That is ~58% cheaper uncached and roughly **5-6× cheaper once caching engages** —
because `gpt-4o`'s cached rate is only a 50% discount while luna's is a 90%
discount.

### Prompt caching is the lever your harness is missing

A 7k-token system prompt resent every turn is the ideal caching case. Per the
caching guide: *"Caching is available for prompts containing 1024 tokens or
more"*, it is automatic for `gpt-4o` and newer with no code changes, and the
cached prefix must be the **start** of the prompt — so keep the system prompt
first and put per-turn variation at the end.
([prompt-caching](https://developers.openai.com/api/docs/guides/prompt-caching))

Two things changed here recently and both affect you:

- **29 May 2026** — `prompt_cache_retention` now defaults to `24h` instead of
  `in_memory` for organizations without ZDR enabled
  ([changelog](https://developers.openai.com/api/docs/changelog)). Good news for
  an eval harness run in bursts hours apart.
- On **GPT-5.6 and later**, `prompt_cache_retention` is deprecated in favour of
  `prompt_cache_options.ttl`, whose only supported value is `"30m"`. Also on
  GPT-5.6+, cache **writes** cost 1.25× the uncached input rate (on pre-5.6
  models cache writes are free)
  ([prompt-caching](https://developers.openai.com/api/docs/guides/prompt-caching)).
  With a 7k prefix reused across many turns the write surcharge is trivially
  repaid, but it does mean a one-turn eval gains nothing.

### Caller side: keep `gpt-4o-mini`

`gpt-4o-mini` at $0.15 in / $0.60 out is cheaper than every GPT-5.x option
including `gpt-5.4-nano` ($0.20 / $1.25). It supports function calling, has a
Tier-1 limit of 200,000 TPM — well clear of your ceiling — and carries **no
deprecation notice**
([gpt-4o-mini](https://developers.openai.com/api/docs/models/gpt-4o-mini);
confirmed absent from [deprecations](https://developers.openai.com/api/docs/deprecations)).

**What this means for us:** Move the eval assistant to `gpt-5.6-luna` and order the
system prompt cache-first; that alone kills the 30,000 TPM throttle and cuts eval
cost by roughly half to five-sixths depending on cache hit rate. Leave the
simulated caller on `gpt-4o-mini` — there is nothing cheaper to move to.

---

## 5. Anything that would break a production voice product

**Direct answer: Nothing in the changelog or deprecations page from May 2026 onward breaks a service pinned to `gpt-realtime-2`, provided you are already on the GA Realtime interface rather than the beta.**

### The one real breaking change — and it landed 12 May 2026

> *"Deprecated DALL·E model snapshots and the Realtime API Beta. ... The Realtime
> API Beta was deprecated and removed from the API on May 12, 2026."* — with the
> guidance *"If you are still using the beta interface, migrate to the released
> Realtime API."*
> ([changelog](https://developers.openai.com/api/docs/changelog))

**This is removal, not deprecation — the beta interface is gone.** If the voice
path still sends the `OpenAI-Beta: realtime=v1` header, it is already broken. The
GA interface differs in these specific ways
([realtime guide](https://developers.openai.com/api/docs/guides/realtime)):

- The `OpenAI-Beta: realtime=v1` header is **removed**.
- Unified `/v1/realtime` endpoint, with ephemeral credentials minted via
  `POST /v1/realtime/client_secrets`.
- **`session.type` must be set**, and output audio configuration moves under
  **`session.audio.output`**.
- Event names are the newer forms: `response.output_text.delta`,
  `response.output_audio.delta`, `response.output_audio_transcript.delta`.
- An `OpenAI-Safety-Identifier` header carrying a stable, privacy-preserving
  user identifier is recommended for abuse monitoring.

Given the repo already runs `gpt-realtime-2` — a model released 7 May 2026, after
the beta line — the GA interface is almost certainly already in use. Worth one
grep to confirm no stale beta header or legacy event name (`response.audio.delta`,
`response.text.delta`) survives in the code.

### Model retirement risk to a `gpt-realtime-2` pin: none published

- `gpt-realtime-2` is **absent from the deprecations page** — no shutdown date,
  no successor entry
  ([deprecations](https://developers.openai.com/api/docs/deprecations)).
- The 20 July 2026 announcement retiring legacy audio/realtime/transcription
  families on **20 January 2027** targets the v1 `gpt-realtime` and
  `gpt-realtime-mini` line, not 2.x (same page).
- No changelog entry between May and July 2026 introduces newly *required*
  Realtime session parameters, renames events, or changes WebSocket behaviour
  beyond the beta removal above. I searched for this specifically and found
  nothing ([changelog](https://developers.openai.com/api/docs/changelog)).

### Two non-Realtime changes that can still bite a production service

- **22 Jul 2026 — hard spend limits.** A monthly cap now causes requests to
  return **`429`** once the limit is reached
  ([changelog](https://developers.openai.com/api/docs/changelog)). A `429` from a
  spend cap is indistinguishable at the status-code level from a rate-limit
  `429`, so a retry/backoff path will silently spin against a wall. On Tier 1 the
  usage limit is **$100/month** — low enough for a growing voice product to hit.
  Check what the org's hard limit is set to and make sure a spend-cap `429`
  raises an alert rather than quietly retrying.
- **29 May 2026 — prompt cache retention default** changed to `24h` for orgs
  without ZDR (same page). Behavioural change, not breaking, but it alters cache
  hit patterns and therefore cost.

### WebSocket note for phone pipelines

For server-side media pipelines — phone systems specifically — the guide notes
WebSocket connections allow continuous audio streaming without the standard
assistant turn lifecycle
([realtime guide](https://developers.openai.com/api/docs/guides/realtime)). No
change to this was announced in the window reviewed.

**What this means for us:** No fire drill and no deadline on the `gpt-realtime-2`
pin. Do two concrete things: grep the voice path for any surviving
`OpenAI-Beta: realtime=v1` header or legacy `response.audio.delta` /
`response.text.delta` event names, and make sure the `429` handler distinguishes
a spend-cap `429` from a rate-limit `429` so a hard limit does not present as a
silent outage.

---

## Confidence and gaps

**High confidence** (read directly from an OpenAI-hosted page, cited inline):
tier thresholds and monthly limits; `gpt-4o` and `gpt-4o-mini` rate limits and
pricing; all Realtime model ids and their status; all Realtime and GPT-5.x
pricing; the deprecations table; the May–July 2026 changelog entries; the
Realtime GA-vs-beta interface differences.

**Could not confirm / caveats:**

1. **`openai.com/api/pricing` returned HTTP 403** and could not be fetched. I
   used `https://developers.openai.com/api/docs/pricing` plus the individual
   model pages instead. Both are OpenAI-hosted primary sources and the model
   pages agreed with the pricing index on every overlapping figure, so I regard
   the numbers as sound — but I did not verify them against the marketing
   pricing page you named.
2. **The rate-limits page never states in words that tiers do not affect price.**
   My unambiguous "tiers do not change per-token price" answer is inferred from
   page structure — a single price per model, a tier table containing only
   RPM/TPM, and a pricing index with no tier dimension. That inference is strong
   and consistent across all ten model pages I checked, but it is an inference,
   not a quoted sentence. Page tried:
   `https://developers.openai.com/api/docs/guides/rate-limits`.
3. **No documented Realtime price change since `gpt-realtime-2` launched.** I
   cannot supply old-vs-new figures because the changelog contains no pricing
   entry for realtime or audio tokens in the window. Absence of an entry is not
   proof no change occurred. Page tried:
   `https://developers.openai.com/api/docs/changelog`.
4. **Conflict on `gpt-4o` snapshot deprecation.** The `gpt-4o` model page
   describes snapshot `gpt-4o-2024-08-06` as deprecated, but the deprecations
   page lists only `gpt-4o-2024-05-13` (announced 26 Sep 2025, shutdown
   23 Oct 2026, replacement `gpt-5.6-sol`) and has no entry for
   `gpt-4o-2024-08-06`. I could not reconcile these two OpenAI pages. Neither
   deprecates the floating `gpt-4o` alias, which is what matters for the harness.
   Pages tried: `https://developers.openai.com/api/docs/models/gpt-4o`,
   `https://developers.openai.com/api/docs/deprecations`.
5. **`gpt-4o` and `gpt-4o-mini` context windows** are not captured above — the
   model pages I fetched surfaced pricing and rate limits but the context-window
   figure did not come back in the extraction. Not load-bearing for the
   recommendation, but the table cells are marked "—" rather than guessed.
6. **No dedicated Realtime migration guide exists** at
   `https://developers.openai.com/api/docs/guides/realtime-migration` (HTTP 404).
   The beta-to-GA differences in section 5 come from the main Realtime guide
   instead. There is consequently **no published `gpt-realtime-2` →
   `gpt-realtime-2.1` migration note**; I found no evidence a code change is
   required beyond swapping the model id, but I could not confirm that from a
   migration document because none exists.
7. **`gpt-5.6-terra` Tier-5 rate limits** came back as prose ("Tier 5 reaches
   15,000 RPM with 40M TPM") rather than a full per-tier table; only its Tier-1
   figure is quoted above.
