# Marketing-SMS A/B variants

These four templates are designed to be tested **head-to-head** in a controlled
batch (n recipients per variant, identical send window). They're intentionally
short and each tests **one** different hypothesis. Don't tweak them mid-test
that contaminates the comparison.

## Substitutions

The server renders these placeholders per recipient:

| Token   | Becomes                                                              |
|---------|----------------------------------------------------------------------|
| `{name}` | `prospects.business_name`                                           |
| `{pid}`  | `prospects.prospect_id` (raw UUID)                                  |
| `{link}` | `${PUBLIC_BASE_URL}/r/{pid}?v=<variant>` (per-recipient tracker)    |

A STOP / opt-out line is **appended automatically** by the server if the
template doesn't already contain "STOP", "opt out", "unsubscribe", or our
opt-out email — so don't add it manually unless you want to control the wording.

## URL fallback requirement (enforced from Batch 3 onwards)

Every variant **must** include a URL fallback. Either:

- `{link}` — per-recipient tracked redirect (use when click attribution matters
  more than message-credit cost; expands to ~84 chars and forces 2-credit segments)
- A bare branded URL once one is acquired (use when 1-credit budget matters and
  aggregate-only attribution via UTM params is enough)

**Rationale.** Batch 2 (May 5 2026) shipped variants A and B without a URL
fallback — they relied on Text-YES and Call-demo CTAs alone. Result: 0 clicks,
0 replies, 0 calls across 100 delivered. Variants C and D, both with `{link}`,
pulled 17 clicks combined (~17.9% CTR on delivered). The data is unambiguous:
without a URL the curious-but-not-ready slice has no path forward and bounces.

`scripts/build-test-batch.mjs` may add a hard regex guard in a future commit
(`URL_RE` matching `{link}` or any plausible URL) so future variants cannot
ship without one.

## Variants

### A · Reply-YES with URL fallback (`A_reply_yes`)

> Hi, PickupAI helps Sydney plumbers stop missing after-hours job calls.
> Text YES to 0468 104 086 or see how: {link}

**Hypothesis**: high-intent tradies will text-back YES to a numeric inbound
number; everyone else clicks the URL fallback. Tests whether the YES reply CTA
adds anything meaningful on top of the link path.

**Operational note**: outbound sender is the `PickupAI` alphanumeric ID;
inbound replies must go to a dedicated mobile number (`0468 104 086` /
`+61468104086`) wired into the Mobile Message inbound webhook.

### B · Call-demo with URL fallback (`B_call_demo`)

> Hi, missing after-hours plumbing calls = lost jobs. Call 02 8000 0796 to
> hear our AI demo, or see how: {link}

**Hypothesis**: hearing the product live beats reading about it. Tests whether
high-intent users will phone our demo line; everyone else clicks the URL.

### C · Cost-framing (`C_cost_framing`)

> Hi, missed plumbing calls cost tradies $800-$2,000/month. PickupAI catches
> them 24/7: {link}

**Hypothesis**: a dollar-anchored pain hook converts better than a free-trial
hook on the same audience. Tests cost-framing against trial-framing.

**Defensibility note**: the $800-$2,000/month range is the same figure
already published on the homepage as "Missed calls cost tradies an average
of $800-$2,000/month in lost jobs. Individual results vary." Keep the SMS
copy aligned with the homepage claim so the marketing surface presents one
defensible story under ACL s.18 (misleading-conduct rules).

**Retired predecessor**: this variant slot used to be `C_social_proof` with
the copy "Sydney plumbers using PickupAI book extra jobs from after-hours
calls". Retired May 2026 because we did not have multiple paying Sydney
plumbers as customers — a plural-customer claim under those conditions is an
ACL s.18 risk. Do not revive without (a) verifiable multi-customer base and
(b) an exact, attributable claim wording.

### D · Trial offer + tracked link (`D_trial`)

> Hi, AI answers your missed plumbing calls 24/7 + texts you the lead.
> Free 14-day trial, no card: {link}

**Hypothesis (control)**: closest to the original outreach offer; tests
whether removing trial-signup friction ("no card") lifts conversion. If this
beats C, the cost-framing angle isn't worth the test slot.

## Send mechanics

Use `scripts/send-sms-batch.mjs`:

```bash
# Test on your own number first (force=1 bypasses quiet hours)
echo "<your-prospect-id>" > /tmp/me.txt
ADMIN_TOKEN=xxx BASE_URL=https://app.example.com node scripts/send-sms-batch.mjs \
  --variant A_reply_yes \
  --message-file scripts/variants/A_reply_yes.txt \
  --prospect-ids-file /tmp/me.txt \
  --force

# Then the real cohort per variant (no --force; sends respect 9am-7pm Sydney)
ADMIN_TOKEN=xxx BASE_URL=https://app.example.com node scripts/send-sms-batch.mjs \
  --variant A_reply_yes \
  --message-file scripts/variants/A_reply_yes.txt \
  --prospect-ids-file scripts/lists/run-<date>-A_reply_yes.txt
```

## Funnel attribution

The `/r/:pid` redirect at [src/server.ts](../../src/server.ts) (~line 1007)
redirects SMS clickers to `/demo` (the focused single-screen landing page at
[public/demo.html](../../public/demo.html)) with UTM params preserved. From
there, the "Start free trial" CTA goes to `/dashboard/signup`.

When a tracked-prospect signs up with the same phone number that received
the SMS:

1. `getProspectByPhone()` matches the signup phone to the prospect (server.ts:2965)
2. `getMostRecentSmsVariantForProspect()` looks up the variant tag of their
   most-recent variant-tagged SMS (server.ts:~2972)
3. An `outreach_log` row is inserted with `channel='signup'`, `status='converted'`,
   and `variant=<the originating variant>` — closing the per-prospect funnel
4. `scripts/measure-variants.mjs` separately uses phone-match against
   `tenants.created_at` for headline signup counts per variant

So you don't need to change the signup form to capture pid/variant — the
existing phone-match path handles everything.

## Hard rules during the test

- **Same time-of-day** for all variants (e.g. all sent 11:30am Wed).
- **Same suburb mix** in each bucket — `scripts/build-test-batch.mjs` randomises
  with stratification to ensure this.
- **Don't tweak copy mid-test** — wait 72hr, read results, decide.
- **Pause immediately** if any variant hits >5% STOP at any point.
- **Every variant must have a URL fallback** — see the URL-fallback section above.
