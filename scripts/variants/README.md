# Marketing-SMS A/B variants

These four templates are designed to be tested **head-to-head** in a controlled
200-send batch (50 each). They're intentionally short (single SMS segment, ≤160
chars) and each tests **one** different hypothesis. Don't tweak them mid-test —
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

## Variants

### A · Reply-YES + audit hook (`A_reply_yes`)

> Hi {name}, [Your Name] from PickupAI. We help Sydney plumbers stop missing
> after-hours job calls — AI answers, texts you the lead. Want a 60-sec demo
> of how it'd sound for your business? Reply YES.

**Hypothesis**: tradies are on-the-tools and would rather reply 3 letters than
click a link. Highest expected reply rate, but only works on numeric senders
(alphanumeric IDs cannot receive replies).

**Required edit before sending**: replace `[Your Name]` with the real first
name of the person sending. A real name boosts trust + lowers spam-flag risk.

### B · Call demo line (`B_call_demo`)

> Hi {name}, missing after-hours plumbing calls = lost jobs. Call 02 8000 0796
> right now to hear our AI answer for you. 60 sec, no signup.

**Hypothesis**: hearing the product beats reading about it. Highest expected
demo-call rate. No link, no signup friction.

### C · Social proof + tracked link (`C_social_proof`)

> Hi {name}, [N] Sydney plumbers using PickupAI booked extra jobs from
> after-hours calls last month. See how: {link}

**Hypothesis**: peer proof beats feature description. Tests whether claim
+ link converts better than CTA-driven variants.

**REQUIRED EDIT BEFORE SENDING**: replace `[N]` with a real number you can
defend. If you don't yet have multiple paying Sydney plumbers, **DO NOT SEND
THIS VARIANT** — fabricated social proof is a ToS violation under the
Australian Consumer Law (misleading conduct, ACL s.18) and will torch the
brand. Either:
  - swap to a true claim ("Our first Sydney plumber added X jobs last month"),
  - or drop variant C entirely and run a 3-variant test (A, B, D).

### D · Trial offer + tracked link (`D_trial`)

> Hi {name}, AI answers your missed plumbing calls 24/7 + texts you the lead.
> Free 14-day trial: {link}

**Hypothesis (control)**: closest to the original batch-1 message but trimmed.
Single CTA, tracked link, single segment. If this beats the others, the
batch-1 problem was length and dual CTAs, not the offer.

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

# Then the real 50-prospect bucket per variant (no --force; sends respect 9am-7pm Sydney)
ADMIN_TOKEN=xxx BASE_URL=https://app.example.com node scripts/send-sms-batch.mjs \
  --variant A_reply_yes \
  --message-file scripts/variants/A_reply_yes.txt \
  --prospect-ids-file scripts/lists/sydney-plumbers-A.txt
```

## Hard rules during the test

- **Same time-of-day** for all 4 variants (e.g. all sent 11:30am Wed).
- **Same suburb mix** in each bucket — `scripts/build-test-batch.mjs` randomises
  with stratification to ensure this.
- **Don't tweak copy mid-test** — wait 72hr, read results, decide.
- **Pause immediately** if any variant hits >5% STOP at any point.
