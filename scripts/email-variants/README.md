# Email sequence — DRAFT, not yet owner-approved

Copy for the first cold-email batch (23 verified NSW addresses, register:
`data/email-evidence/consent-register-2026-08-10.json`). Every choice below is
tied to a finding in
[`docs/research/tradie-cold-email-resonance-2026-08.md`](../../docs/research/tradie-cold-email-resonance-2026-08.md);
change the copy and you are disagreeing with a cited finding, which is allowed
— but read it first.

**Nothing here may be sent until the owner approves the copy**, and sending
goes through `src/outreach/email-compliance.ts` (gate → build → audit), never
raw `sendEmail()`. The s 17 identity block and s 18 unsubscribe footer are
appended by the builder — they are deliberately NOT in these files.

## The sequence

| Day | Touch | File | Why |
|---|---|---|---|
| 0 | Email 1 — founder-direct hybrid | `1-opener.txt` | A's voice (max distance from the GoHighLevel template genre now spamming this exact niche) + B's interest-CTA (Gong N=304k: ~2x a specific ask) |
| 3–4 | **One** phone call, weekday 10:00–16:00; if missed, same-day bump | `2-bump.txt` | Follow-ups outweigh wording (+65.8% replies from one follow-up, Backlinko N=12M). One call only — "call-after-call" is the behaviour tradies report vendors for |
| 8–10 | Email 3 — pain-scenario rewrite | `3-pain.txt` | New angle, not a nudge (T2: new-angle follow-ups outperform bumps later in a sequence) |
| 14 | Email 4 — two-line closer with an explicit "no" out | `4-closer.txt` | 3–5 touches ≈ optimum; the polite hard stop is the anti-pest signal |
| — | **Stop.** | | Any reply stops the sequence. "No"/unsubscribe/spoken "don't contact" → `markProspectUnsubscribed()` same day |

## Merge fields — provenance is the rule

Every field comes from the **page-read verdicts / consent register**, never
from the `prospects` table (57% of read rows had at least one wrong field —
measured 2026-08-10). A wrong personal claim is worse than no personalisation
(backfire literature, T2).

| Field | Source | Notes |
|---|---|---|
| `{firstName}` | register / email local-part (paul@, adrian@…) | If no confident name: "G'day," and drop the clause |
| `{trade}` | reader's `actual_trade` — NOT `prospects.trade_type` | |
| `{area}` | suburb **as stated on their site** | Three recorded suburb mismatches |
| `{size_line}` | reader's `size_signal` | `sole_trader` → "looks like it's you doing the work" · `small_team` → "looks like a tight crew" · `unclear` → omit the clause |
| `{onTheJob}` | by actual trade | electrician "elbow-deep in a switchboard" · roofer "two storeys up" · plumber "under a house" · handyman "mid-job" |

## Pre-registered interpretation — decided BEFORE sending

- **No A/B split.** 23 is one qualitative batch; at plausible reply rates the
  expected yield is 1–2 replies and a split proves nothing either way. (This
  retracts the earlier 12/11 split proposal.)
- **Zero replies is not evidence the channel failed** — P(0 of 23) ≈ 50% even
  at the 3% threshold rate. What the batch tests: deliverability, the opt-out
  path, and what any reply actually says.
- **Numbers stay out of the copy.** The "X% won't leave a voicemail" stat has
  no traceable primary source; the copy is numberless by decision, and no
  customer counts exist to cite (and inventing them is banned by CI).
