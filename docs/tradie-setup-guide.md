# PickupAI — Tradie Setup Guide
### Setting Up Call Forwarding on Your Existing Business Number

---

This guide shows you how to keep your existing phone number and have PickupAI automatically answer any calls you miss. Your clients dial the same number as always — if you pick up, it's a normal call. If you don't answer within 20 seconds, PickupAI takes over, collects the job details, and texts them straight to you.

---

## What You Need Before You Start

Your PickupAI team will provide you with:

- **Your PickupAI number** — the number calls will forward to (e.g. `+61 4XX XXX XXX`)
- **Your dashboard login link** — where you can view your leads
- **Your email and password** — to log in to the dashboard

Keep these handy before following the steps below.

---

## Step 1 — Set Up Call Forwarding on Your Mobile

Choose your carrier below and follow the steps. This takes about 2 minutes.

---

### Telstra, Optus, or Vodafone (Australian mobiles)

**Option A — Dial a code directly from your phone:**

1. Open your phone's dialler
2. Type this exactly (replace `+61XXXXXXXXX` with your PickupAI number):

```
**61*+61XXXXXXXXX*11*20#
```

3. Press **Call / Dial**
4. You should hear a confirmation tone or see a message saying "Forwarding activated"

> **Example:** If your PickupAI number is `+61 468 000 835`, you would dial:
> `**61*+61468000835*11*20#`

The `20` at the end means your phone rings for 20 seconds before forwarding. You can change this to `30` if you prefer more time to answer.

---

**Option B — Through your carrier's app or website:**

| Carrier | Where to find it |
|---|---|
| Telstra | My Telstra app → Account → Call Settings → Call Diversion |
| Optus | My Optus app → Services → Manage → Call Forward |
| Vodafone | My Vodafone app → Account → Call Controls |

Look for **"Divert on No Answer"** or **"Forward when unanswered"** and enter your PickupAI number.

---

**Option C — Call your carrier:**

Simply call your carrier's support line and ask them to set up:

> "I'd like to activate **conditional call forwarding — no answer** to `+61XXXXXXXXX`, with a 20-second delay please."

---

### iPhone — Carrier Settings (Alternative)

1. Go to **Settings → Phone → Call Forwarding**
2. Toggle **Call Forwarding** ON
3. Enter your PickupAI number
4. Note: This forwards ALL calls, not just unanswered ones. Only use this if the dial code above doesn't work for your carrier.

---

### Business Landline or VoIP / Hosted PBX

Contact your phone provider (e.g. Vonage, RingCentral, 3CX, or your telco) and ask them to set up:

> "No-answer call diversion to `+61XXXXXXXXX` after 20 seconds."

Most providers can do this over the phone or in your online account portal.

---

## Step 2 — Test It

1. Ask a friend or family member to call your business number
2. **Don't answer** — let it ring
3. After about 20 seconds, PickupAI should answer with a friendly greeting
4. Your friend can say something like "I have a leaking tap" and go through the short conversation
5. Within 60 seconds of hanging up, you should receive an **SMS summary** on your phone

If anything doesn't work as expected, contact your PickupAI support contact.

---

## Step 3 — Log In to Your Dashboard

View all your leads, play call recordings, and mark jobs as handled:

**Dashboard:** `https://your-server.com/dashboard/login`

| | |
|---|---|
| **Email** | *(provided by your PickupAI setup contact)* |
| **Password** | *(provided by your PickupAI setup contact)* |

### What you can do in the dashboard:

- View all leads sorted by urgency (emergencies shown in red)
- See the caller's name, phone number, address, and issue description
- Play back the full call recording
- Mark leads as **New / Handled / Booked / Called Back**
- Download all leads as a CSV file for Excel or your job management app

---

## How It Works Day-to-Day

```
Client calls your number
    ↓
You answer → normal phone call (AI never involved)
    ↓ (if you don't answer within 20 seconds)
PickupAI answers with: "Hi, thanks for calling [Your Business]!
                        This is Olivia — how can I help you today?"
    ↓
AI collects: name, address, issue, urgency, preferred time
    ↓
SMS sent to your phone within 60 seconds
    ↓
You call the client back when you're ready
```

---

## Turning It Off

If you ever want to disable call forwarding (e.g. you're in the office all day):

**To cancel forwarding, dial:**
```
##61#
```
Then press **Call / Dial**. This cancels the no-answer diversion.

To re-enable it, repeat Step 1.

---

## Tips for Best Results

- **Keep your voicemail turned off** or the call may go to voicemail before forwarding. To disable voicemail, contact your carrier.
- **Set the delay to 20–25 seconds** — long enough for you to reach your phone, short enough that clients don't hang up.
- **Check your SMS** after your first real forwarded call to make sure everything arrived correctly.
- If a client asks "who did I just speak to?", you can tell them: "That's our after-hours answering service — they've taken your details and I'll follow up with you shortly."

---

## Frequently Asked Questions

**Do my clients need to do anything differently?**
No. They dial the same number as always.

**Will clients know they've been forwarded?**
No. The transition is seamless. They hear a brief connection sound and then PickupAI answers.

**What if I'm on another call when someone rings?**
The caller will hear a busy signal or be placed on hold depending on your carrier settings. You can ask your carrier to also set up "divert on busy" to the same PickupAI number if you'd like those calls handled too.

**Can I choose what name and voice the AI uses?**
Yes. Contact your PickupAI setup contact to customise the AI's name, greeting style, and the services it asks about.

**What happens to the call recording?**
Recordings are stored securely and accessible in your dashboard. They are kept for 90 days.

---

*Questions? Contact your PickupAI setup contact or email support.*
