# Per-call cost inputs — Twilio AU, OpenAI Realtime, Mobile Message (July 2026)

Researched 2026-07-29. Every figure below was fetched live from the vendor's
own pricing page, pricing CSV, or docs on that date. Nothing here is recalled.

**Source-fetching notes.** Twilio's `/voice/pricing/au` and `/sms/pricing/au`
pages render prices into the static HTML, but the page's own "Receive calls"
table disagrees with its "Phone number pricing" table on which AU number type
costs $8.25 vs $20.00 a month (see caveat below). Where they conflict, the
figures here come from Twilio's **downloadable pricing CSVs**, which the pages
themselves link and which are unambiguous. OpenAI's `developers.openai.com`
pages have a plain-Markdown twin at the same URL with `.md` appended; the
OpenAI quotes below are verbatim from those.

Claims are tagged **[DOC]** (published by the vendor), **[CSV]** (from the
vendor's machine-readable price file), **[DERIVED]** (arithmetic from tagged
figures), or **[NOT PUBLISHED]**.

---

## Bottom line

1. **Inbound voice to an AU local number is $0.0100 USD/min.** [CSV]
2. **Media Streams does cost extra: $0.0044 USD/min, on top of the voice
   minute and the number rental.** Not bundled. One charge per call, not two —
   a bidirectional stream is a single Stream. [DOC]
3. **Audio-tokens-per-minute is published**, and it is asymmetric:
   **input audio = 1 token per 100 ms (600 tokens/min); output audio = 1 token
   per 50 ms (1,200 tokens/min).** [DOC] OpenAI publishes **no** per-minute
   price for `gpt-realtime-2` itself. [NOT PUBLISHED]
4. The single biggest cost driver is **not** the raw minute rate — it is that
   *"the entire conversation is sent to the model for each Response"* [DOC], so
   audio already paid for is re-billed on every subsequent turn — as is our
   10.1k-token instruction block. Whether that replay lands in cache ($0.40/1M)
   or not ($32/1M audio, $4/1M text) swings a 3-minute call's OpenAI cost by
   **4.8×** ($0.20 vs $0.96). See "The number that actually decides the bill".

---

## Unit prices

All Twilio prices are **USD**. Twilio's own support documentation states prices
for all products are set in USD, and account display currency can only be USD,
GBP or JPY — **AUD is not an option**, so nothing on the AU pricing page is in
Australian dollars despite being an Australia page. Mobile Message is the only
vendor here quoting AUD.

### Twilio — Australia

| # | Item | Price | Currency | Source |
|---|---|---|---|---|
| 1 | AU **local** number rental | $3.00 / month | USD | [SiteNumbersPricing.csv](https://assets.cdn.prod.twilio.com/pricing-csv/SiteNumbersPricing.csv) · [voice/pricing/au](https://www.twilio.com/en-us/voice/pricing/au) |
| 2 | **Inbound voice**, AU local number | **$0.0100 / min** | USD | [SiteNumbersPricing.csv](https://assets.cdn.prod.twilio.com/pricing-csv/SiteNumbersPricing.csv) |
| 3 | **Media Streams** | **$0.0044 / min** | USD | [voice/pricing/au](https://www.twilio.com/en-us/voice/pricing/au) |
| 4a | Outbound SMS → AU mobile, from Twilio AU **mobile number** | $0.0515 / segment | USD | [SMSPricing.csv](https://assets.cdn.prod.twilio.com/pricing-csv/SMSPricing.csv) |
| 4b | Outbound SMS → AU mobile, from **alphanumeric sender ID** | $0.0515 / segment | USD | [sms/pricing/au](https://www.twilio.com/en-us/sms/pricing/au) |
| — | AU **mobile** number rental (needed to send SMS) | $8.25 / month | USD | [SiteNumbersPricing.csv](https://assets.cdn.prod.twilio.com/pricing-csv/SiteNumbersPricing.csv) |
| — | Alphanumeric sender ID rental | Free | — | [sms/pricing/au](https://www.twilio.com/en-us/sms/pricing/au) |
| — | Inbound SMS to AU mobile number | $0.0075 / segment | USD | [SiteNumbersPricing.csv](https://assets.cdn.prod.twilio.com/pricing-csv/SiteNumbersPricing.csv) |
| 5 | Call recording | $0.0025 / min | USD | [voice/pricing/au](https://www.twilio.com/en-us/voice/pricing/au) |
| 5 | Recording storage | $0.0005 / min / month | USD | same |
| 5 | Twilio transcription (**we do not use this**) | $0.0500 / min | USD | same |
| 5 | Answering machine detection (not used) | $0.0075 / call | USD | same |
| 5 | Failed-message processing fee | $0.001 / message | USD | [sms/pricing/au](https://www.twilio.com/en-us/sms/pricing/au) |

Rates 4a/4b are **identical** — an alphanumeric sender ID is not cheaper per
message on Twilio, it is only cheaper because it has no monthly rental.

Twilio's AU outbound SMS price is flat across every carrier — Telstra, Optus,
Vodafone, Lycamobile, Pivotel and "Other" are all $0.05150. [CSV]

**Three things worth knowing that are not line items:**

- **An AU local number cannot send SMS.** The numbers CSV marks
  `AU / Local / SMS Enabled = No`. Only the AU **Mobile** number type is SMS
  enabled. So an SMS-capable Twilio path costs the $8.25/month mobile number
  *in addition to* the $3.00/month local voice number, or requires an
  alphanumeric sender ID (which cannot receive replies).
- Twilio's SMS page carries the footnote *"additional carrier fees may apply"*
  without quantifying them for AU. Treat $0.0515 as a floor. [DOC]
- The AU voice pricing page contradicts itself: its "Receive calls" table lists
  mobile numbers at $20.00/mo and toll-free at $8.25/mo, while its "Phone
  number pricing" table reverses them. The CSV settles it — **mobile $8.25,
  toll-free $20.00** — and the SMS page independently confirms mobile at $8.25.
  Local at $3.00 / $0.0100 per min is consistent everywhere and is the only
  figure we actually depend on.

### Media Streams — is it really extra?

Yes, and Twilio says so in as many words. From Twilio's own Media Streams
announcement: *"Media Streams is priced at $0.004 per minute. You will also be
charged for the associated Programmable Voice minutes and phone numbers used
during the duration of the call."* [DOC]
([blog](https://www.twilio.com/en-us/blog/media-streams-public-beta))

The rate on that post ($0.004) is the launch price; the **current** rate on the
live pricing table is **$0.0044/min**, and it is identical on the US and AU
pricing pages — it is a flat global rate, not country-scaled. [DOC]

On double-charging: Twilio documents that *"for bidirectional Streams, you can
have only one Stream per Call"* — our μ-law 8 kHz bidirectional stream is one
Stream, so it is **one** $0.0044/min charge, not one per direction. [DOC]

So the Twilio floor for a call is **$0.0144/min** ($0.0100 voice + $0.0044
stream), plus number rental amortised across the month. [DERIVED]

### OpenAI — `gpt-realtime-2`

Per 1M tokens, USD. Verbatim from
[developers.openai.com/api/docs/models/gpt-realtime-2](https://developers.openai.com/api/docs/models/gpt-realtime-2)
(cross-checked against the [pricing page](https://developers.openai.com/api/docs/pricing)):

| Modality | Input | Cached input | Output |
|---|---:|---:|---:|
| **Text** | $4.00 | $0.40 | $24.00 |
| **Audio** | $32.00 | $0.40 | $64.00 |
| Image | $5.00 | $0.50 | — |

Context window 128,000; max output 32,000 tokens. [DOC]

Neighbouring models, for reference — the mini is a real lever if quality holds:

| Model | Audio in | Audio cached | Audio out | Text in / cached / out |
|---|---:|---:|---:|---|
| `gpt-realtime-2` (ours) | $32 | $0.40 | $64 | $4 / $0.40 / $24 |
| `gpt-realtime-2.1` | $32 | $0.40 | $64 | $4 / $0.40 / $24 |
| `gpt-realtime-2.1-mini` | $10 | $0.30 | $20 | $0.60 / $0.06 / $2.40 |
| `gpt-realtime-1.5` (our rollback) | $32 | $0.40 | $64 | $4 / $0.40 / **$16** |
| `gpt-realtime-mini` | $10 | $0.30 | $20 | $0.60 / $0.06 / $2.40 |

Note `gpt-realtime-1.5` has **cheaper text output** ($16 vs $24) than
`gpt-realtime-2` at identical audio rates. Rolling back via
`OPENAI_REALTIME_MODEL` is therefore not a pure cost regression.

### OpenAI — audio tokens per minute

This is published, in the Realtime cost guide. Verbatim:

> Audio tokens in user messages are **1 token per 100 ms** of audio, while audio
> tokens in assistant messages are **1 token per 50 ms** of audio.

([Managing costs](https://developers.openai.com/api/docs/guides/realtime-costs))

| Direction | Tokens / second | Tokens / minute | Cost per minute of audio, uncached |
|---|---:|---:|---:|
| **Input** (caller audio) | 10 | **600** | $0.01920 USD |
| **Output** (agent audio) | 20 | **1,200** | $0.07680 USD |
| Input, if cache-hit | 10 | 600 | $0.00024 USD |

[DOC] for the token rates, [DERIVED] for the dollar column.

OpenAI adds the caveat that *"token counts include special tokens aside from
the content of a message which will surface as small variations in these
counts"*, so treat the rates as accurate to a few percent, not exact. [DOC]

**Is there a published per-minute price for `gpt-realtime-2`?** No.
[NOT PUBLISHED] The cost guide says voice-agent sessions *"accrue input and
output tokens"* while only *"streaming translation and streaming transcription
sessions are billed by audio duration"*. OpenAI does publish per-minute prices,
but only for those duration-billed models — `gpt-realtime-translate` at
**$0.034/minute**, `gpt-live-transcribe` and `gpt-realtime-whisper` at
**$0.017/minute** (USD, output). Those are useful order-of-magnitude anchors
and nothing more; they do not apply to our speech-to-speech session.

### Mobile Message (AU SMS reseller)

Publicly listed, in **AUD, excluding GST**.
([mobilemessage.com.au/pricing](https://www.mobilemessage.com.au/pricing))

| Credits purchased | Standard price / credit | First-purchase price* |
|---|---:|---:|
| 500+ | 4.0c | 1.6c |
| 1,000+ | 3.5c | 1.6c |
| 10,000+ | 3.0c | 1.6c |
| 100,000+ | 2.5c | 1.6c |
| 1,000,000+ | not published | 1.6c |

\* First-purchase price applies for 30 days from signup only. [DOC]

- One credit = up to 160 characters; 161–306 chars = 2 credits, 307–459 = 3,
  and so on. [DOC] Note this is a **160-character** boundary, i.e. GSM-7
  single-segment — same practical segmentation as Twilio.
- First dedicated number free; additional dedicated numbers $100/year ex GST.
- No setup fee, no monthly fee, inbound replies free, alphanumeric sender ID
  free, credits never expire. [DOC]

**Cost comparison for the owner-notification SMS**, at a plausible ~3.0c AUD
standard tier and ~0.65 USD/AUD:

| Path | 1 segment | 2 segments | Monthly number cost |
|---|---:|---:|---|
| Twilio, AU mobile number | $0.0515 USD | $0.1030 USD | $8.25 USD/mo |
| Twilio, alphanumeric ID | $0.0515 USD | $0.1030 USD | free (no replies) |
| Mobile Message | ~$0.0195 USD (3.0c AUD) | ~$0.0390 USD (6.0c AUD) | free (1st number) |

**Mobile Message is roughly 2.6× cheaper per segment than Twilio for AU SMS**,
before counting the $8.25/mo number saving. [DERIVED] This is consistent with
the `~$0.02/msg` note already in `src/env.ts:153`.

---

## The number that actually decides the bill

Multiplying minutes by the token rates gives a **floor**, not an estimate,
because of this [DOC]:

> The entire conversation is sent to the model for each Response. The output
> from a turn will be added as Items to the server Conversation and become the
> input to subsequent turns, thus **turns later in the session will be more
> expensive**.

Audio you already paid to send is re-sent, and re-billed, on every subsequent
turn. Over a 12-turn call the replayed volume is an order of magnitude larger
than the fresh audio. What saves it is prompt caching, *"applied automatically"*
but *"best-effort and not guaranteed"* [DOC] — and cached audio input is
$0.40/1M against $32/1M fresh, an **80× difference**.

Modelled 3-minute call, 12 assistant turns, caller talking 35% of wall clock,
agent 40%. Instructions are taken at **10.1k tokens**, the measured size of our
current prompt per
`docs/research/realtime-instruction-length-latency-2026-07.md` — and those are
re-sent on every Response too:

| Component | Tokens | Cost (USD) |
|---|---:|---:|
| Fresh input audio | 630 | $0.0202 |
| Output audio | 1,440 | $0.0922 |
| Replayed conversation, **cached** | ~11,385 | $0.0046 |
| Instructions, 10.1k × 12 turns, **cached from turn 2** | ~121,200 text | $0.0848 |
| **OpenAI subtotal** | | **~$0.202** |
| Twilio voice + Media Streams | | $0.0432 |
| Owner SMS (Mobile Message, 2 segs) | | ~$0.039 |
| **Total per 3-min call** | | **~$0.284** |

Same call with **nothing hitting cache**: replayed audio costs $0.3643 instead
of $0.0046, instructions cost $0.4848 instead of $0.0848, and the OpenAI
subtotal goes from $0.202 to **$0.961** — a **4.8× swing**. [DERIVED]

Across call lengths, cache-hit case:

| Call length | Turns | OpenAI | Twilio | SMS | Total (USD) |
|---|---:|---:|---:|---:|---:|
| 2 min | 8 | $0.146 | $0.029 | $0.039 | **~$0.213** |
| 3 min | 12 | $0.202 | $0.043 | $0.039 | **~$0.284** |
| 4 min | 16 | $0.259 | $0.058 | $0.039 | **~$0.356** |
| 5 min (cap) | 20 | $0.318 | $0.072 | $0.039 | **~$0.429** |

At the 5-minute cap with a cold cache throughout, OpenAI alone would be
**$2.04** for one call. [DERIVED] That is the tail risk the cache-hit-rate
measurement below exists to rule in or out.

**Every row of this table is [DERIVED] from assumptions about talk ratio, turn
count and cache hit rate that have not been measured.** Only the unit prices
above are sourced. Treat the totals as a shape, not a number, until measured.

Three structural observations that hold regardless of the assumptions:

- **The 10.1k-token instruction block is the largest or second-largest line
  item**, because it is re-sent on every Response. Cached it is ~$0.085 of a
  3-minute call; uncached it is ~$0.485. Prompt length is a *cost* lever even
  though the sibling research established it is barely a *latency* lever.
- **Output audio dominates the audio side.** At $64/1M and 1,200 tokens/min,
  agent speech is 4× the per-second cost of caller speech ($32/1M at 600
  tokens/min). Shortening what the agent *says* is worth roughly four times as
  much as shortening what it lets the caller say.
- **Twilio is a rounding error.** $0.0144/min means the whole telephony leg of a
  5-minute call is ~$0.072 — under a quarter of the bill. Cost work belongs on
  the OpenAI side.

### One cost line we do **not** pay

The Realtime API bills input transcription separately, on a different rate card
(`whisper-1` / `gpt-4o-transcribe`), *"if enabled"* [DOC]. Confirmed by grep:
`input_audio_transcription` appears nowhere in `src/`, so we do not enable it
and do not pay it. Anyone turning it on to get call transcripts should price it
first — it is a new line item, not a free byproduct.

---

## What is still unknown and how to measure it

| Unknown | Why it matters | How to settle it |
|---|---|---|
| **Real talk ratio** (fraction of wall clock that is caller vs agent audio) | Sets both audio token totals; assumed 35%/40% above | Sum logged `audio_in`/`audio_out` per call and divide by call duration |
| **Real turn count per call** | Drives the quadratic replay term | Count `response.done` events per session |
| **Actual cache hit rate** (instructions and replayed audio) | The 4.8× swing above; the single largest uncertainty by far | Read `cached_tokens` and `cached_tokens_details.{text,audio}_tokens` from `response.done` |
| **Twilio AU carrier surcharges on SMS** | Page says *"additional carrier fees may apply"*, unquantified for AU | Only visible on a real invoice; moot if we stay on Mobile Message |
| **Mobile Message volume rate above 1M credits** | Not published ("rates we don't publish") | Sales contact; irrelevant at current volume |
| **Whether `gpt-realtime-2.1-mini` holds quality** | Audio in/out at $10/$20 vs $32/$64 would cut the dominant line ~3× | Run the existing eval suite against the mini model |

### The audio-token question is now answerable empirically

Yes — the `response.done` usage payload settles it directly, and we already log
it. OpenAI documents the payload shape as:

```json
"usage": {
  "total_tokens": 253,
  "input_tokens": 132,
  "output_tokens": 121,
  "input_token_details": {
    "text_tokens": 119,
    "audio_tokens": 13,
    "image_tokens": 0,
    "cached_tokens": 64,
    "cached_tokens_details": { "text_tokens": 64, "audio_tokens": 0, "image_tokens": 0 }
  },
  "output_token_details": { "text_tokens": 30, "audio_tokens": 91 }
}
```

`src/realtime/session.ts:1208-1209` already logs
`input_token_details.audio_tokens` and `output_token_details.audio_tokens` per
response. That gives the true per-call totals without any modelling — sum them
across a session and divide by the call's billed duration to get the real
tokens-per-minute, and compare against the documented 600/1,200 to confirm the
overhead from special tokens.

**The gap in the current logging is caching.** We log the two audio counts but
not `input_token_details.cached_tokens` or
`cached_tokens_details.audio_tokens`. Without those, a summed token count
cannot be converted to dollars at all — the same 11,385 replayed audio tokens
are worth $0.0046 or $0.3643 depending purely on which of the two fields they
landed in. **Adding `cached_tokens` and `cached_tokens_details.audio_tokens` to
that log line is the highest-value change for cost visibility**, and it is a
two-field addition to an existing log statement.

---

## Sources

- Twilio AU voice pricing — https://www.twilio.com/en-us/voice/pricing/au
- Twilio AU SMS pricing — https://www.twilio.com/en-us/sms/pricing/au
- Twilio number pricing CSV — https://assets.cdn.prod.twilio.com/pricing-csv/SiteNumbersPricing.csv
- Twilio SMS pricing CSV — https://assets.cdn.prod.twilio.com/pricing-csv/SMSPricing.csv
- Twilio Media Streams pricing statement — https://www.twilio.com/en-us/blog/media-streams-public-beta
- Twilio Media Streams overview — https://www.twilio.com/docs/voice/media-streams
- Twilio billing currencies — https://help.twilio.com/articles/223183288-What-currencies-can-I-use-to-fund-my-Twilio-project-
- OpenAI pricing — https://developers.openai.com/api/docs/pricing
- OpenAI `gpt-realtime-2` model page — https://developers.openai.com/api/docs/models/gpt-realtime-2
- OpenAI Realtime managing costs — https://developers.openai.com/api/docs/guides/realtime-costs
- Mobile Message pricing — https://www.mobilemessage.com.au/pricing
