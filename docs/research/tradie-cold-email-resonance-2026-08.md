# What makes a cold email to a tradie get read, resonate, and draw a reply

> **These are research notes, not a guarantee of results.** They were written
> for a solo founder deciding what to send to 23 people, by an agent, not a
> marketer with a track record on this audience. Nothing here has been tested
> on Australian tradies by us; where a claim comes from a vendor's dataset it
> says so, and where no evidence could be found it says that too. Nothing in
> this file changes what n=23 can statistically prove (§9).

**Researched:** 2026-08-10.

**Method.** Five evidence streams, in the priority order set for the task.
**In-house primary evidence** read first:
`docs/research/trade-call-failure-modes-2026-07.md` and
`tradie-call-failures-raw-2026-07.md` (four *simulated* tradies — agent
role-plays, valuable for register and vocabulary, not human survey data; the
files themselves say so), `docs/channel-evidence.md` (the 560-SMS campaign,
zero genuine clicks), and the `BACKLOG.md` entries on the 23 verified
addresses and the 57% metadata error rate.
**T1 — real humans and real copy, read directly:** hipages reviews on
ProductReview.com.au (9,381 reviews, 3.7★, tradie-authored complaints quoted
verbatim); Tradify reviews on Capterra (152 reviews, 4.7/5, tradie-authored);
a Whirlpool forum archive thread on SEO cold-call scams to small businesses
(forums.whirlpool.net.au/archive/2072009); landing pages of ServiceM8
(servicem8.com/au), Tradify (tradifyhq.com), OfficeHQ (officehq.com.au) and
ReceptionHQ (receptionhq.com — the .com.au refused connection; the US site of
the same Australian-founded company was read instead); and, incidentally, a
large number of GoHighLevel-template "Never Miss a Call Again" AI-receptionist
spam pages that polluted nearly every search (§6 — they are evidence).
**T2 — datasets with stated N:** Backlinko/Pitchbox outreach study
(backlinko.com/email-outreach-study, N=12M emails, 2019, SEO/link-building
outreach — a serious selection bias, flagged wherever cited); Woodpecker
cold-email statistics (woodpecker.co, N=20M+ emails, 1,000+ customers,
cross-referenced against Belkins N=16.5M and Instantly benchmarks); Gong Labs
CTA study (gong.io, N=304,174 sales emails); Hunter.io internal
plain-text-vs-HTML data; Litmus email-client market share; ACMA
communications research (acma.gov.au); Brooks, Gino & Schweitzer, *Smart
People Ask for (My) Advice*, Management Science 61 (2015), 1421–1435;
Personalization-backfire studies (Behavioral Sciences 15(10):1323, 2025;
Psychology & Marketing 2026, three studies, ~1,800 participants).
**T3 — practitioner claims with no traceable data:** the "85% of callers
won't leave a voicemail" family of statistics, the Xero/ABS "8–12 admin hours
a week" claim (found only via a vendor blog citing Xero 2024), spam-trigger-
word lists, and all deliverability folklore not backed by a named dataset.
Reddit (r/AusElectricians etc.) was **not reachable** by any tool available
to this session; repeated searches returned no genuine threads. That gap is
recorded in §9, not papered over.

**Verified vs inferred.** Every verbatim quote below was read on the page
cited. Every T2 number is the vendor's own; N, year and bias are stated
inline. The *application* of any of it to 23 NSW tradies is inference — no
dataset found is about cold email to Australian tradies, and §9 says what
that means.

---

## 1. The short answers

1. **Draft B's CTA is the single best-evidenced element in either draft.**
   Gong Labs (N=304,174 sales emails, T2): an *interest* CTA ("Worth a
   listen?" — asking if they'd like to hear more) produced a 30% meeting
   rate in cold email, vs 15% for a specific ask and 13% for an open-ended
   question. Roughly **2x**. Keep "Worth a listen?" whatever else changes.

2. **The follow-up is worth more than any wording choice.** One follow-up:
   +65.8% total replies (Backlinko N=12M, T2). Sequences of 3–5 touches
   roughly double reply rates vs one email (Woodpecker N=20M+, T2;
   replicated across Belkins and Instantly). 42–55% of all replies come
   from follow-ups, not email 1. A batch of 23 with no follow-up plan
   throws away close to half its expected replies.

3. **Personalisation lifts replies ~30% — and our own data says it is also
   the most dangerous element.** Personalised subject +30.5%, personalised
   body +32.7% (Backlinko, T2); combined, up to +142% (Woodpecker, T2).
   But BACKLOG's measured finding: **57% of our prospect rows were wrong
   about something, wrong trade in 3/14** — and "a trade-personalised email
   to a business whose trade we have wrong is worse than a generic one,
   because the personalisation is the thing that fails" (in-house,
   measured). Every merge field must come from the page-read, never the
   prospect row. The 23 already satisfy this; keep it that way for batch 2.

4. **This audience's defining vendor experience is being burned by lead-gen
   platforms, and the scar tissue is contracts and billing.** hipages
   reviews, tradie-authored (T1): *"designed to take money from tradies for
   leads that are often not genuine"*, *"they lock you in"*, *"they will
   not budge on cancelling"*, *"threatening call-after-call"*, *"most were
   tyre kickers"*. Correspondingly, every successful vendor to this
   audience says the same three things loudly: **free trial, no credit
   card, no lock-in** (ServiceM8, Tradify, OfficeHQ, ReceptionHQ — T1
   convergence, four of four). Draft A already says all three; that line is
   load-bearing, not filler.

5. **"Never miss a call again" is now a spam genre.** Searching this topic
   surfaced a dozen-plus near-identical GoHighLevel-template pages —
   "Answer Genie AI - Never Miss a Call Again", "Missed Call Text Back",
   "MEET YOUR DIGITAL APPRENTICE", "TradieM8" (T1: read in results,
   2026-08-10). The AI-receptionist-for-tradies pitch is being
   carpet-bombed at this audience in exactly Draft B's frame. The
   founder-direct voice of Draft A is the thing none of that genre can
   fake. (§6.)

6. **Plain text, short, zero or one link, no images.** Hunter internal data:
   HTML cold emails bounce ~650% more than plain text (T2, vendor);
   Smartlead and converging vendor tests: plain text 15–25% more replies
   (T2/T3 boundary — G2-review-derived); under ~80–120 words is the
   consistent benchmark (Instantly/Woodpecker, T2). This also matches the
   repo's own decision: the success metric is a human REPLY, and the SMS
   campaign proved this audience does not tap links. **Zero links in email
   1 is both the deliverability optimum and the strategy.**

7. **Asking for help is not weakness — it measurably raises perceived
   competence.** Brooks, Gino & Schweitzer (Management Science, 2015, T2
   lab evidence): people who ask for advice are rated *more* competent,
   and the effect is strongest when the task is hard and the person asked
   is an expert. Draft A's "tell me what's wrong with it" frames the tradie
   as the expert on his own phone. Application to cold email is inference,
   but the direction is supported; folklore says hide your newness, the
   study says the opposite when the ask treats them as the authority.

8. **They read on phones.** 41–60% of opens are mobile across Litmus and
   converging vendor datasets (T2, vendor); tradies specifically run their
   business from the ute (Tradify reviews, T1: *"administrative work is
   done outside the office by the technician on the road"*). Budget ~40
   characters of subject and ~40 characters of preview text as the whole
   first impression, and assume one thumb-scroll of body.

---

## 2. Subject lines

**What the data says.** The two big datasets disagree, and the disagreement
is informative:

- Backlinko (N=12M, 2019, T2): longer subjects (36–50 chars) outperformed
  short ones by 24.6–32.7%. But the sample is SEO link-building outreach to
  bloggers — an audience that triages by topic, at a desk.
- Woodpecker-aggregated benchmarks (T2, vendor): question-format subjects
  +21% opens; numbers in subjects +113% opens (that second figure smells of
  listicle contamination — treat as T3 until seen in a primary source).

For a phone screen, iOS shows roughly 35–45 characters of subject. The
practical answer for a mobile-first audience: **35–50 characters, plain
words, specific, lowercase-conversational, question form is fine** — the
zone where both datasets overlap.

**Localisation.** No dataset was found that isolates suburb-in-subject for
cold email (recorded in §9). The inference from the personalisation data
(+30.5% for personalised subjects, T2) is that a *verified* local/trade
signal is the cheapest personalisation available. The backfire literature
(T2) says the risk condition is *unattributable* data — a suburb is public
on their own website, so it sits on the safe side.

**Built from our merge fields** (each ≤50 chars, checked against the page
before sending, per the page-wins rule):

- `who answers your phone when you're on the tools?` — 48 chars, Draft A's
  own subject; it survives contact with the evidence.
- `missed calls for {businessName}?` — blunt, specific, reads like a
  customer, not a marketer.
- `{trade}s around {area} and the calls that ring out` — local + trade,
  statement not bait.
- `the 2pm call you couldn't take` — Draft B's; 30 chars, strong curiosity,
  but see §6 — it is the closest of the four to the spam genre's register.

**Avoid:** "never miss a call again" (genre-marker, §6), anything with
"free", "guarantee", "opportunity", ALL CAPS or an exclamation mark
(spam-trigger lists are T3, but the hipages/Whirlpool material shows what
this audience has learned to pattern-match: *"guaranteed"* and pay-today
pressure are the scam tells they name themselves).

---

## 3. Body

**Length.** Under ~80–120 words (Instantly/Woodpecker benchmarks, T2). Both
drafts are already in range; keep them there. One thumb-scroll on a phone.

**Structure that the evidence supports:**

1. **First line = proof you are not a template.** It doubles as preview
   text on the phone. It must contain the one page-verified specific
   ("found {businessName}" + the thing their own site says). This is where
   the +32.7% body-personalisation effect (T2) is earned or wasted.
2. **One pain sentence in their register.** The in-house survey files
   (simulated practitioners — register evidence, not measurement) put the
   daily losses on *commercial* ground: missed calls, price shoppers, "a
   dropped call with no number is a job that never existed" (electrician).
   Money and jobs, never safety — which the product's own principles ban
   claiming anyway.
3. **One sentence of what it does, concrete:** answers, gets name + number
   + job, texts you. The competitor convergence (T1) is outcomes, not
   features: ServiceM8 leads with "Cut paperwork"; nobody lists
   architecture.
4. **The honesty + free line:** new product, free, no card, no lock-in
   (§5).
5. **Interest CTA** (§4). Nothing after it. No signature links in v1 —
   Backlinko found social links correlate with +9.8% replies (T2), but for
   *bloggers*; for this audience a link is a spam signal and a tap this
   cohort demonstrably does not make (in-house, measured).

**Personalisation depth — where it flips.** The backfire studies (T2:
Behavioral Sciences 2025; Psychology & Marketing 2026, ~1,800 participants)
locate creepiness in *unattributable* data — the reader can't tell where you
got it, so it reads as surveillance, and reactance follows. The rule that
falls out: **use only facts they published themselves, and attribute the
source in the sentence** ("your website says", "found you on Google").
Name + trade + suburb + one fact from their own site, attributed = safe and
effective. Review counts, ABN lookups, "I noticed you don't have a
receptionist", or inferred revenue = the wrong side of the line. Draft A's
"looks like it's you doing the work" is borderline-safe *because* it is
framed as an inference from their own site and hedged with "looks like" —
keep the hedge.

**Tone.** The register in the T1 material and the in-house files is: plain,
concrete, numerate, allergic to hype, and contemptuous of pressure. *"Nobody
ever lost a customer to that sentence"* (in-house, handyman) is the register
to hit — declarative, a bit dry. "G'day" is fine; forced matiness beyond
that first word is not (the scam callers are the ones who oversell rapport —
Whirlpool T1: *"the telemarketer was very aggressive… it was like he was
shouting"*).

---

## 4. CTA

The best data available is Gong Labs (N=304,174, T2), and it is unambiguous
for the cold stage:

| CTA type | Example | Meeting rate (cold) |
|---|---|---|
| **Interest** | "Worth a listen?" | **30%** |
| Specific ask | "Reply YES for the recording" | 15% |
| Open-ended | "What do you think?" | 13% |

(Those percentages are of emails that got *any* positive outcome in Gong's
sample — the relative ordering is the finding, not the absolute numbers.)

- **"Worth a listen?" (Draft B) is an interest CTA** — the winning pattern.
  It sells the conversation, not the commitment.
- **"Reply 'yes' for a 60-second recording" (Draft A) is a specific-action
  CTA** — half the rate in Gong's data — *and* it reads like SMS-marketing
  syntax ("reply YES" is what the carpet-bombed SMS genre says; our own
  `A_reply_yes` SMS variant produced nothing — in-house, measured). It also
  promises a deliverable the recipient must then tap a link to consume,
  which recreates the exact failure `channel-evidence.md` documents.
- No head-to-head data was found for "reply YES" vs an interest question
  *in email specifically* (§9); the recommendation rests on Gong plus our
  own SMS result, and says so.

**Recommendation:** end every email in the sequence with an interest
question of ≤4 words: "Worth a listen?" / "Want to hear it?" / "Worth two
minutes?". When a reply arrives, *then* send the recording — at that point
Gong's data flips and specific asks win, because they're in a conversation.

---

## 5. Trust with zero customers

What the evidence supports when there is honestly no social proof:

- **Say the three words this audience has been trained to demand: free, no
  card, no lock-in.** T1 convergence — all four vendor sites read for this
  research say some version, and the hipages reviews show why: the fear is
  not "does it work", it is "will I be trapped and billed". This is the
  strongest trust substitute available and it costs one line.
- **Specificity as competence.** "Texts you the caller's name, number and
  job" is checkable and concrete; "captures every opportunity" is genre
  (§6). The in-house register evidence points the same way: tradies deal
  in specifics (metres, dollars, suburbs).
- **Admit newness as an advice-ask, not a confession.** T2 (Brooks/Gino/
  Schweitzer): asking for advice raises perceived competence when the
  asker treats the person as the expert. "It's new — I want a handful of
  NSW tradies to use it free and tell me what's wrong with it" positions
  him as the expert and is literally true. What the study does *not*
  license: grovelling ("sorry to bother you", "I know you're busy") —
  that's a status move in the wrong direction and has no evidential
  support anywhere consulted.
- **Local and named.** A real first name, a real trade, a real area, and a
  founder who signs as one person. None of the GoHighLevel spam genre does
  this — template pages are anonymous by construction. Being identifiably
  one bloke building one thing is the cheapest differentiation available
  and cannot be faked at scale.
- **Do not manufacture proof-adjacent claims.** "Tradies are loving it",
  "businesses like yours" — with zero paying customers these are the false
  claims `tests/marketing-claims.test.ts` exists to catch, and this
  audience has a finely tuned detector for them (hipages reviews, T1).

---

## 6. Anti-patterns — what the spam aimed at this audience looks like

The point of this section: the 23 recipients' inboxes and phones already
contain the genre we must not resemble.

**The genre, from evidence actually read (T1):**

- **The SEO/lead-gen pitch** (Whirlpool thread; hipages reviews):
  "guaranteed page 1", "keep your ad at the top of Google for a whole
  year", pay-today pressure ("he insisted on paying first and paying
  today"), aggression on the phone, lock-in contracts, and — the tell the
  forum named — *guarantees*. Any sentence of ours containing "guarantee",
  "#1", "ranked", or urgency ("this week only") joins that genre.
- **The AI-receptionist template flood** (GoHighLevel pages found
  2026-08-10, a dozen-plus in search results for this research alone):
  "Never Miss a Call Again", "24/7 AI receptionist", "your digital
  apprentice", "$1,200 lost per missed call" — invented-precision loss
  statistics, anonymous branding, identical page skeletons. **Draft B's
  scenario opening is the honest version of this genre's opening.** The
  genre is why the honest version now needs a human fingerprint (named
  founder, verified specific, admission of newness) to be
  distinguishable.
- **Recycled fake statistics.** "85% of callers won't leave a voicemail"
  circulates attributed variously to Forbes, BrightLocal, CallRail and
  BIA/Kelsey with figures from 67% to 90%; no primary source was
  reachable (T3). Draft B's numberless "most callers won't leave a
  voicemail" is defensible; **never attach a number to it.**
- **The distrust baseline is measured.** ACMA research (T2): six in ten
  Australians report being contacted by businesses *after* unsubscribing.
  The compliance footer is not just legal hygiene; honouring "no" fast is
  a differentiator this audience notices (hipages T1: the complaint is
  precisely that "no" was not honoured).

**Deliverability-adjacent copy factors:** plain text (T2 — Hunter bounce
data), zero images (T2/T3 — vendor tests), zero or one link (T3 — vendor
practice, consistent with our reply-CTA strategy anyway), no
spam-trigger vocabulary (T3 — lists are folklore, but the overlap with the
scam-tell vocabulary above is total, so the advice holds at T1 for this
audience regardless).

---

## 7. Verdicts on the two drafts

### Draft A — founder-direct ("who answers your phone when you're on the tools?")

**Strengths.** Subject is in the evidence's sweet spot (48 chars, question,
specific, conversational — §2). First line is page-verified and
source-attributed ("found {businessName}… looks like it's you doing the
work") — the safe side of the personalisation line, with the hedge that
keeps it there (§3). The advice-ask ("tell me what's wrong with it") has
the best non-vendor evidence in this file behind it (T2, §5). "No card, no
lock-in" hits the audience's measured scar tissue (T1, §5). Maximally
unlike the template genre (§6).

**Weaknesses.** The CTA is the weak element on the best CTA data available
(specific-action, ~half the interest-CTA rate, Gong T2 — §4), it uses SMS-
marketing syntax ("reply yes") our own SMS campaign died on, and its
promised payoff is a recording the recipient must tap — the exact behaviour
this cohort measurably does not perform. Structurally the email spends its
middle on the founder ("I'm building…") before the recipient's pain; one
pain sentence is missing.

**Line edits.**
1. Replace the CTA: ~~"reply 'yes' for a 60-second recording of it taking a
   real call"~~ → **"Worth a listen? I'll send a 60-second recording of it
   taking a real call."** Interest CTA up front, deliverable described but
   gated on the reply.
2. Insert one pain sentence before the product sentence, in-register:
   **"Every call that rings out while you're on the tools is a job that
   goes to the next {trade} on Google."** (Vocabulary from the in-house
   files; numberless; no safety framing.)
3. Keep "looks like it's you doing the work" *only* where the page-read
   confirmed `sole_trader`; for `small_team` rows swap to **"looks like a
   small crew"** — the 57% finding says a wrong personal claim is worse
   than none.

**Fits best:** the 20 confirmed `sole_trader`/`small_team` recipients where
the "it's you" observation is verified true — which is nearly the whole
batch.

### Draft B — pain-scenario ("the 2pm call you couldn't take")

**Strengths.** The CTA is the best-evidenced line in either draft (§4).
The pain is the right pain — commercial, daily, in the register the
in-house files document. Trade-specific scenario insert ({elbow-deep in a
switchboard / two storeys up / under a house}) is personalisation that
can't be wrong if keyed to the *verified* trade.

**Weaknesses.** Its skeleton — second-person imagined scenario, missed-call
loss, AI picks up, hear a demo — is the skeleton of the template-spam genre
now saturating this niche (§6, T1); on a skim it can be mistaken for its
thousandth copy. It contains no verified per-recipient fact and no named
founder, i.e. neither of the two things the genre cannot fake. "Most
callers won't leave a voicemail" is fine only while numberless. "Set it up
on a spare number" is a bigger ask than the CTA admits — it belongs in the
conversation after the reply, not in email 1.

**Line edits.**
1. Open with the verified specific *before* the scenario: **"G'day
   {firstName} — found {businessName} while looking at {trade}s around
   {area}."** Then the scenario. The first line's job is proving it's not
   a template (§3); B currently fails it.
2. Sign it as the founder with the newness line from A — the human
   fingerprint is what separates B from its genre.
3. Move "spare number" out of email 1 entirely; the offer after a reply is
   the recording first, spare-number trial second.
4. Keep "Worth a listen?" exactly as is.

**Fits best:** follow-up position (§8) — as the *second* angle for
non-repliers — and the one `unclear`-size recipient, where A's "it's you"
claim can't be safely made. As email 1 it is the riskier of the two
because of the genre collision.

**Overall verdict.** Neither draft is right whole; the evidence-backed
email is **A's voice and structure with B's CTA** and one pain sentence in
the middle. A-hybrid as email 1; B-rewritten as the new-angle follow-up.

---

## 8. Follow-up sequence design

**What the data says (all T2, all vendor):** one follow-up: +65.8% replies
(Backlinko N=12M). 3–5 touch sequences: ~8.3% vs 4.1% reply for
single-email (Woodpecker N=20M+). First follow-up is the highest-yielding
single message after email 1. Diminishing and negative returns past ~4–7
touches; first follow-up ~3 days after email 1, then widening gaps.
42–55% of all replies come from follow-ups.

**What the audience evidence adds (T1):** the pest line is real and
they name it — hipages' *"threatening call-after-call"* is the behaviour
this cohort reports to review sites. Persistence in *email*, spaced,
with a live no-cost out, is not what they mock; repeated *phone* pressure
and refusing to take no is.

**Proposed sequence, integrated with the planned phone call:**

| Day | Touch | Content |
|---|---|---|
| 0 | Email 1 | A-hybrid (§7). Interest CTA. |
| 3–4 | Phone call, once | If missed — which for this audience is the *expected* case — do not redial the same day. |
| 3–4 | Email 2, same day as the call | Short bump that enacts the product's premise: **"Tried you this arvo — figured you were on the tools, which is sort of the point. Still worth a listen?"** New information (the call), not a naked "bumping this". |
| 8–10 | Email 3 | New angle: B-rewritten (scenario, trade-keyed). Interest CTA. |
| 14 | Email 4, final | Two lines, explicit close: **"Last one from me. If it's not for you, no worries — reply 'no' and that's the end of it. If a recording of it taking a real {trade} call is worth 60 seconds, say the word."** A stated ending is the anti-pest signal, and the reply-'no' line converts even refusals into the metric we can actually measure (a human reply). |
| — | Stop | No second cold call. Any reply, including "no", ends the sequence and gets a same-day human answer. |

Four email touches + one call sits inside the 4–7 optimum (T2) and outside
the behaviour the audience mocks (T1). Spacing (3–4 days, then widening)
follows Woodpecker's data. Every email ends in an interest question; every
email restates the out.

---

## 9. What could not be verified, and the small-N reality

**Not verified / not reachable:**
- **No real Australian tradie forum threads on missed calls or answering
  services were read.** Reddit (r/AusElectricians etc.) is unreachable
  from this environment and searches returned no genuine threads. The
  register evidence for "tradie voice" therefore rests on Capterra/
  ProductReview reviews (real humans, adjacent topics) and the in-house
  *simulated* practitioner files. This is the largest gap in the file.
- The in-house "tradie survey" is **four agent role-plays**, not humans —
  its vocabulary is used here as register evidence only, never as
  measurement. The source files say the same.
- No dataset about cold email **to tradies** or to Australian
  micro-businesses exists in anything found. Every T2 number is B2B
  generally, or SEO outreach (Backlinko's whole N=12M — desk workers,
  link-building topics; its subject-length and social-link findings
  transfer worst).
- The "85% won't leave voicemail" statistic family has **no reachable
  primary source** (variants 67–90%, attributed in circles). Numberless
  phrasing only.
- ProductReview's ServiceM8 listing and hipages' tradie-facing sales page
  404'd/refused; ReceptionHQ was read on .com, not .com.au.
- No head-to-head data on "reply YES" vs interest-question CTA in email;
  §4's recommendation is Gong's category data plus our own SMS result.
- "Numbers in subject lines +113%" could not be traced past listicles —
  treat as unfounded.
- The Xero "8–12 admin hours/week" figure was found only in a vendor blog
  citing Xero 2024 + ABS; not read in a Xero primary source. T3 until
  read there — do not put it in copy.

**What n=23 means.** If the true reply rate were a *good* 10%, the expected
yield is 2.3 replies; at Woodpecker's small-list average (~5.8% for lists
under 50, T2 — the most directly applicable benchmark found), 1–2 replies.
Zero replies from 23 is entirely consistent with a working email, and 3
replies is consistent with a mediocre one. Therefore:
- **Do not A/B split 23.** 12-vs-11 cannot distinguish any two drafts this
  file discusses; splitting only guarantees both cells are unreadable.
  Send the best email per segment (§7) and treat the batch as qualitative.
- **The unit of learning is the individual reply, and the phone calls are
  the real sample.** 23 conversations-or-silences, each with a page-read
  behind it, will teach more than the rate will. Log every reply verbatim
  in the same turn it arrives (the lesson `tradie-call-failures-raw`
  exists to teach).
- Nothing in this file is validated until a real tradie replies. These are
  the best-evidenced guesses available, ranked by tier — that is all a
  research file can honestly be at n=0.
