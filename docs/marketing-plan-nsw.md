# PickupAI — NSW Marketing Plan

Comprehensive marketing strategy for acquiring tradie customers across New South Wales.

---

## 1. Target Market Sizing

### Estimated Tradies in NSW (ABS + licensing data)

| Trade | Estimated businesses | Our addressable market |
|---|---|---|
| Plumber | ~12,000 | ~6,000 (solo/small team) |
| Electrician | ~15,000 | ~7,500 |
| Roofer | ~2,500 | ~1,500 |
| Handyman | ~5,000 | ~3,500 |
| Carpenter/Joiner | ~8,000 | ~4,000 |
| Painter | ~6,000 | ~3,500 |
| Tiler | ~3,000 | ~1,800 |
| Builder (small) | ~10,000 | ~5,000 |
| Landscaper | ~4,000 | ~2,500 |
| Locksmith | ~1,200 | ~800 |
| **Total** | **~66,700** | **~36,100** |

**Initial target (Phase 1):** 500 prospects across Greater Sydney, focused on plumbers, electricians, and roofers — the trades with highest after-hours call volume.

### Ideal Customer Profile

- Solo operator or team of 2–5
- Works on tools during the day (can't answer calls)
- Gets 5+ missed calls per week
- No dedicated receptionist or answering service
- Greater Sydney / Central Coast / Wollongong / Newcastle
- Visible on Google (has reviews, probably tech-comfortable)

---

## 2. Lead Sources (ranked by quality and effort)

| # | Source | Quality | Effort | Cost | Notes |
|---|---|---|---|---|---|
| 1 | **Google Places API** | High | Low | ~$32/1000 | Best structured data; phone + rating + reviews |
| 2 | **Google Maps manual** | High | High | Free | Same data as API but manual copy |
| 3 | **Yellow Pages AU** | Medium | Medium | Free | Large directory, some data stale |
| 4 | **True Local** | Medium | Medium | Free | Good for suburban tradies |
| 5 | **Hipages / ServiceSeeking** | High | Medium | Free | Tech-savvy owners = better fit |
| 6 | **Oneflare** | Medium | Medium | Free | Similar to Hipages |
| 7 | **Facebook Groups** | Medium | Low | Free | Trade-specific groups, post value content |
| 8 | **Trade association directories** | High | Low | Free–$$ | Master Plumbers NSW, Master Electricians |
| 9 | **Referrals** | Very High | Very Low | Free | Ask early customers for intros |
| 10 | **Google/Facebook Ads** | Variable | Medium | $$$ | Phase 2, after case studies exist |

**Recommendation for Phase 1:** Start with Google Places API scraping (Source #1) for structured leads, supplemented by manual collection from Hipages/ServiceSeeking for higher-intent prospects.

---

## 3. Week-by-Week Execution Plan

### Week 1 — Lead Collection & Setup

| Day | Activity |
|---|---|
| Mon | Run `collect-leads.ts` for plumbers in Greater Sydney (target: 200) |
| Tue | Run for electricians (target: 150) and roofers (target: 100) |
| Wed | Import CSVs into Admin → Prospects. De-duplicate. Review data quality |
| Thu | Manually add 30–50 high-quality prospects from Hipages/ServiceSeeking |
| Fri | Prepare phone + SMS outreach. Test SMS templates with 5 test numbers |

### Week 2 — Cold Outreach (Phone + SMS)

| Day | Activity | Target |
|---|---|---|
| Mon | Cold calls: plumbers batch 1 (50 calls) | 5–10 demos |
| Tue | SMS Stage 1 to remaining plumbers (150 prospects) | — |
| Wed | Cold calls: electricians batch 1 (50 calls) | 5–10 demos |
| Thu | SMS Stage 1 to remaining electricians (100 prospects) | — |
| Fri | Review replies, book demos, update prospect statuses | — |

### Week 3 — Follow-up & Conversion

| Day | Activity |
|---|---|
| Mon | SMS Stage 2 to non-responders from Week 2 |
| Tue | Cold calls: roofers + handymen (80 calls) |
| Wed | Follow-up calls to SMS responders, book demos |
| Thu | SMS Stage 3 (final touch) to remaining non-responders |
| Fri | Review pipeline: demos booked, trials started, conversions |

### Week 4 — Optimise & Scale

| Day | Activity |
|---|---|
| Mon | Analyse conversion funnel — which channel/trade/suburb converted best? |
| Tue | Collect second batch of leads (new suburbs, new trades) |
| Wed | Email outreach to prospects with email addresses (Email templates 1 & 2) |
| Thu | Ask trial customers for feedback + referrals |
| Fri | Plan Week 5+ based on results |

---

## 4. Channel Strategy

### Primary: Cold Phone Calls

- **Why:** Legal under Australian law for B2B, highest conversion rate, immediate feedback
- **Volume:** 40–50 calls/day (achievable in 2–3 hours)
- **Best times:** 7:00–8:00 AM (before they start work), 12:00–1:00 PM (lunch), 4:30–5:30 PM (wrapping up)
- **Script:** See [outreach-templates.md](./outreach-templates.md)

### Secondary: Cold SMS

- **Why:** Low effort, scalable, good for follow-up after call attempts
- **Volume:** Up to 200/day using bulk SMS feature
- **Compliance:** Include opt-out, send to business numbers only, short and non-pushy
- **Sequence:** 3-stage over 5 days (see templates)

### Tertiary: Email

- **Why:** Supplements SMS for prospects with email addresses
- **Volume:** Manual for now; consider Mailgun/SendGrid later
- **Sequence:** 2-stage (intro + follow-up)

### Future (Phase 2): Paid Advertising

- Google Ads targeting "answering service for tradies" (estimated CPC: $3–8)
- Facebook/Instagram ads targeting trade-related interests in NSW
- **Only after:** 3+ case studies with real numbers, proven conversion funnel

---

## 5. Budget Breakdown (Phase 1 — First Month)

| Item | Cost | Notes |
|---|---|---|
| Google Places API | ~$50 | 500 plumber + 500 electrician lookups |
| Twilio SMS (outreach) | ~$105 | 500 prospects × 3 touches × $0.07/SMS |
| Twilio SMS (system) | ~$30 | Lead notifications, welcome SMS, etc. |
| Phone calls | $0 | Using personal mobile |
| Domain/hosting | Already paid | Railway, domain |
| **Total** | **~$185** | |

### Cost per Acquisition Target

- Target: 10 paying customers from 500 prospects = 2% conversion
- Cost per customer: ~$18.50
- Monthly revenue from 10 customers: $1,490 (at $149/mo)
- **Payback period:** < 1 day

---

## 6. Compliance Checklist

### Spam Act 2003 (Cth)

- [x] All SMS include sender identification
- [x] All SMS include opt-out mechanism ("To opt out, email hello@getpickupai.com.au" — SMS uses alphanumeric sender ID and cannot receive replies)
- [x] Opt-out register maintained (prospect status = "do_not_contact")
- [x] Messages sent only to publicly listed business numbers
- [x] Messages are relevant to the recipient's business
- [x] No messages sent to numbers on the Do Not Call Register (check below)

### Do Not Call Register (DNCR)

- The DNCR primarily applies to **consumer** numbers, not business numbers
- B2B calls and SMS to publicly listed business numbers are generally exempt
- **Recommendation:** Cross-check against the DNCR for extra safety
- DNCR wash service: https://www.donotcall.gov.au (costs apply for large lists)

### ACMA Guidelines

- Keep records of all outreach (stored in `outreach_log` table)
- Respond to opt-out requests within 5 business days
- Do not send messages outside reasonable hours (8 AM – 8 PM local time)

### Best Practices

- Personalise all messages with the business name
- Keep SMS under 320 characters (2 segments) where possible
- Space SMS touches 24–72 hours apart
- Never send more than 3 unrequited SMS to a single prospect
- Remove/update prospects who bounce, complain, or request removal immediately

---

## 7. KPIs and Tracking

### Funnel Metrics

| Metric | Target | How to Track |
|---|---|---|
| Prospects collected | 500 (Month 1) | Admin → Prospects → Total count |
| Cold calls made | 200/week | Manual tally or outreach_log |
| SMS sent | 500 Stage 1, 350 Stage 2, 200 Stage 3 | Admin → Prospects → Outreach History |
| Reply rate (SMS) | 5–10% | Count prospects with status = "replied" |
| Demos booked | 20–30 | Count status = "demo_booked" |
| Trials started | 10–15 | Count status = "trial" |
| Paying customers | 5–10 | Count status = "paying" |
| **Conversion rate** | **1–2%** (prospect → paying) | paying / total prospects |

### Revenue Targets

| Milestone | Timeline | Revenue |
|---|---|---|
| First paying customer | Week 2 | $149/mo |
| 5 paying customers | Week 3–4 | $745/mo |
| 10 paying customers | Month 2 | $1,490/mo |
| 20 paying customers | Month 3 | $2,980/mo (founding offer) |
| 50 paying customers | Month 4–6 | $9,950/mo (mix of $149 + $199) |

### Weekly Review Questions

1. How many calls did I make? How many picked up?
2. What was the SMS reply rate this week?
3. How many demos were booked? How many showed up?
4. What objections am I hearing most? How should I adjust the script?
5. Which trade type / suburb is converting best?
6. What's my cost per acquisition this week?

---

## 8. Estimated SMS Costs

| Scenario | Prospects | Touches | SMS Count | Cost ($0.07/SMS) |
|---|---|---|---|---|
| Conservative (Stage 1 only) | 500 | 1 | 500 | $35 |
| Standard (3-stage) | 500 | 3 | 1,500 | $105 |
| Aggressive (500 + 500 follow-up) | 1,000 | 3 | 3,000 | $210 |

Twilio Australian mobile SMS rate: ~$0.0675/segment outbound.

---

## 9. Phase 2 Roadmap (Month 2+)

1. **Case studies:** Document 3 real customer results (leads captured, revenue impact)
2. **Google Ads:** Target "answering service tradies", "virtual receptionist plumber"
3. **Facebook Ads:** Video ads showing the AI in action, targeting trade interests
4. **Referral programme:** Offer 1 month free for every successful referral
5. **Trade show presence:** Master Plumbers NSW events, HIA housing industry events
6. **Content marketing:** Blog posts on "how tradies lose money from missed calls"
7. **Partnerships:** Approach trade associations for member discounts/endorsements
8. **Expand geography:** Victoria, Queensland, WA

---

## Related Documents

- [GTM Playbook](./gtm-playbook.md) — tactical execution guide for Greater Sydney plumbers
- [Core Pricing & GTM](./core-pricing-gtm.md) — pricing strategy and positioning
- [Outreach Templates](./outreach-templates.md) — ready-to-use SMS, email, and call scripts
