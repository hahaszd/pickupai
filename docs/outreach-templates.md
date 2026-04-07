# PickupAI — Outreach Templates

Ready-to-use SMS, email, and call scripts for cold and warm outreach to prospective tradie customers in NSW.

> **Compliance reminder**: All SMS/email must include opt-out language. See [marketing-plan-nsw.md](./marketing-plan-nsw.md) for full Spam Act 2003 compliance guidelines. Cold B2B phone calls are generally permitted under Australian law.

---

## SMS Templates (3-stage sequence)

### Stage 1 — First Touch

**When to send:** Day 0 (initial contact)
**Goal:** Introduce PickupAI, create curiosity

```
Hey {name} — I built an AI receptionist for NSW tradies. It answers your
missed calls 24/7, captures the job details, and texts you a lead summary
within seconds. No app needed.

14-day free trial, no lock-in.

Quick demo: getpickupai.com.au

To opt out, email hello@getpickupai.com.au
```

**Character count:** ~300 (fits in 2 SMS segments)

---

### Stage 2 — Follow-up (send 24–48 hours after Stage 1)

**When to send:** Day 1–2 (if no reply to Stage 1)
**Goal:** Social proof angle, emphasise the trial

```
Quick follow-up {name} — do you miss calls when you're on the tools?
A plumber in Penrith said he was losing 3-4 leads a week to voicemail.
PickupAI picks up when you can't, captures the lead, and texts it
straight to you.

14-day free trial, cancel anytime: getpickupai.com.au

To opt out, email hello@getpickupai.com.au
```

**Character count:** ~310

---

### Stage 3 — Final Touch (send 3 days after Stage 2)

**When to send:** Day 4–5 (if no reply to Stage 2)
**Goal:** Urgency and founding offer scarcity

```
Last one {name} — we're offering founding pricing ($149/mo locked in)
to our first 20 customers. After that it's $199/mo.

If missed calls are costing you jobs, it's worth a 2-min look:
getpickupai.com.au

No hard feelings if it's not for you. To opt out, email hello@getpickupai.com.au
```

**Character count:** ~270

---

## Email Templates

### Email 1 — Intro (send alongside or instead of SMS Stage 1)

**Subject:** Quick question about missed calls at {business_name}

```
Hi {owner_name},

Quick question — do you have someone answering calls when you're on a job?

I built PickupAI, an AI receptionist for tradies. It picks up your missed
calls 24/7, has a natural Aussie accent, captures the caller's details
(name, address, job type, urgency), and texts you a summary within seconds.

No app to install — it works through call forwarding on your existing number.

We're offering a 14-day free trial to NSW tradies right now:
https://getpickupai.com.au

Happy to jump on a quick call or you can hear a live demo on the website.

Cheers,
[Your name]
PickupAI
https://getpickupai.com.au
```

---

### Email 2 — Follow-up (send 2–3 days after Email 1)

**Subject:** Re: missed calls at {business_name}

```
Hi {owner_name},

Following up on my last email — one of our plumber customers told us he was
losing 3-4 leads a week to voicemail. Within the first week of using PickupAI,
he'd captured 11 after-hours leads he would have missed.

The AI sounds natural (not robotic), asks the right questions, and even handles
complaints and follow-up calls differently.

Worth a 2-minute look? https://getpickupai.com.au

If it's not a fit, no worries at all.

Cheers,
[Your name]
```

---

## Cold Call Script

> This is the primary outreach channel — cold B2B calls are legal under Australian law. See also the scripts in [gtm-playbook.md](./gtm-playbook.md).

### Opening (15 seconds)

```
"Hey [name], it's [your name] from PickupAI — do you have 30 seconds?

I'm not selling anything complicated — I just built an AI phone receptionist
for tradies. It answers your missed calls, captures the lead details, and
texts them to you. I wanted to see if that's a problem worth solving for you."
```

### If they engage (discovery)

```
"How do you handle calls when you're on the tools right now?
Do you get many after-hours calls?
What happens to those — voicemail?"
```

### Bridge to demo

```
"What if I set you up with a 14-day free trial — you can call a demo number
right now and hear what it sounds like. Takes about 90 seconds. If you like it,
sign up takes 10 minutes. No charge for 14 days. Want to try it?"
```

### Objection handling

| Objection | Response |
|---|---|
| "I'm too busy" | "Totally get it — that's exactly why you need this. When you're flat out, calls go to voicemail and you lose the job. I can set it up in 5 minutes." |
| "I have a receptionist" | "Nice — do they work after 5pm and weekends? We handle the calls they can't." |
| "Sounds expensive" | "It's $149/mo — less than one missed job pays. And there's a 14-day trial to prove it works before you spend a cent." |
| "I'll think about it" | "No worries — can I text you the demo link so you can try it when you've got a minute?" |
| "Not interested" | "All good mate, appreciate your time." *(mark as not_interested, do not follow up)* |

### Close

```
"Let me text you the link now — you can call the demo number from
your phone and hear it in action. What's the best mobile for you?"
```

---

## Template Variables

| Variable | Replaced with |
|---|---|
| `{name}` | Business name from prospect record |
| `{owner_name}` | Owner name (if known), otherwise business name |
| `{business_name}` | Full business name |

---

## Using Templates in the Admin Panel

1. Go to **Admin → Prospects → Bulk SMS**
2. Filter by status and/or trade type
3. Click a **template button** (First touch / Follow-up / Final touch) to pre-fill
4. Review and edit the message as needed
5. Click **Send** — the system will replace `{name}` with each prospect's business name and append the opt-out footer automatically

---

## Opt-out Handling

- All SMS include "To opt out, email hello@getpickupai.com.au" (SMS is sent from an alphanumeric sender ID and cannot receive replies)
- When a prospect emails to opt out, update their status to `do_not_contact` in the admin panel
- The bulk SMS system automatically skips prospects with `do_not_contact` or `not_interested` status
- Keep an opt-out register — this is a legal requirement under the Spam Act 2003
