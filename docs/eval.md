# Inbound call eval

Drives realistic caller conversations against the real system prompt and the
real tool schemas, then grades what the assistant captured **and what it said**.

```bash
npm run eval:p0            # release gate — P0 scenarios only
npm run eval               # everything
npx tsx scripts/run-eval.ts --trade electrician --verbose
npx tsx scripts/run-eval.ts --id handyman_new_powerpoint_request
```

Needs `OPENAI_API_KEY`. Each scenario is a multi-turn conversation plus a judge
call, so a full run costs real money — start with `eval:p0`. A P0 failure exits
non-zero; anything else is backlog.

## What it covers

Everything that lives in the prompt and the tool definitions:

- **Field capture** — was the lead callable? Graded by the same
  `evaluateCaptureQuality()` the product uses, so the eval and production
  cannot drift apart on what "usable lead" means.
- **Intent and urgency** — including negative controls. Over-tagging calls as
  emergencies is a failure, not a safe default: if everything is an emergency
  the tenant stops reading the label before the real one arrives.
- **Tool behaviour** — `save_lead` fired when it should, `end_call` always
  (a call that never ends bills the tenant).
- **Notification policy** — whether the owner SMS would send, via
  `expectedSmsForIntent()`.
- **What the assistant said** — `mustSay` / `mustNotSay`. This is the half a
  capture-only eval structurally cannot check, and it is where every safety
  finding lives. An assistant can save a flawless lead while having told the
  caller to open a burning switchboard.

## What it does NOT cover

Do not read a green eval as "the phone product works". The harness talks to the
model over chat completions, not the Realtime API over a Twilio media stream.
Untested here:

- Audio quality, transcription errors, accents, background noise as *audio*
  (scenarios describe noisy callers, but the text never degrades)
- VAD, barge-in, and the greeting-playback race
- Latency and anything time-sensitive
- Twilio webhooks, call recording, number routing, warm transfer

Those need a real call. `scripts/test-lifecycle.ts` covers the HTTP surface;
nothing currently covers the audio path end to end.

## Structure

| File | Role |
|---|---|
| `src/testing/eval/types.ts` | `EvalScenario` — the caller, the expectations, the speech assertions |
| `src/testing/eval/scenarios/` | The library, one file per trade |
| `src/testing/eval/runner.ts` | Drives one conversation, makes no judgements |
| `src/testing/eval/grade.ts` | Deterministic checks, then a judge only for speech |
| `scripts/run-eval.ts` | CLI, filtering, concurrency, exit codes |
| `tests/eval-scenarios.test.ts` | Structural checks — run offline in CI, cost nothing |

## Writing a scenario

The caller is **played by a model**, not a script. Give it `callerFacts` (what
this person knows) and `callerBehaviour` (how they are difficult), not a
sequence of lines. A fixed script derails the moment the assistant asks
something it did not anticipate — it answers "what's your name?" with "it's
still bucketing down".

Phrase `mustSay` / `mustNotSay` as **outcomes**, never as literal sentences:
"told the caller to get away from the switchboard and call 000", not a wording
to match. The judge grades meaning; a substring check would pass a transcript
that said the opposite.

Add a scenario when a real call fails in a way the current library would not
catch. Every scenario carries `whyThisMatters` naming that failure — if you
cannot write that sentence, the scenario is not earning its cost.

## Relationship to `inbound-scenarios.ts`

`src/testing/inbound-scenarios.ts` is the older intent taxonomy: 25 scenarios
classified by intent, with assertions but no dialogue, so nothing could ever
run them. It still owns `evaluateCaptureQuality()` and `expectedSmsForIntent()`,
which this harness reuses. The eval adds the two things that make a scenario
runnable — a caller who can hold a conversation, and a trade.

## First real runs — 2026-07-28

| Run | Result | What it actually measured |
|---|---|---|
| 1 | 8/21 | The harness. The simulated caller had no name, so it emitted `[pauses]` placeholders and seven scenarios deadlocked to the turn limit. |
| 2 | 3/21 | The harness. Parallel workers woke from the same stated backoff, collided, and 14 scenarios exhausted their retries. |
| 3 | 17/21 | The product. Zero rate-limit failures. |
| 3 + judge fix | **18/21** | The judge had read "don't touch the switchboard" as an instruction to touch it. |

**The product code barely changed across those four numbers.** Every early
failure was this harness, and the first run was the dangerous one: each failure
read like the assistant failing to capture a name it was in fact never given.

Two lessons worth keeping:

- **Read the transcript before believing a failure.** A red result is a
  hypothesis about the product, not a finding.
- **A first run is a test of the eval.** Treat an early red as suspect in the
  harness until the transcript says otherwise — and treat an early green as
  suspect in the assertions.

Verified working by this: the branching electrical safety advice, the
electric-shock rule, the handyman licensing boundary, and all three negative
controls against emergency over-tagging.
