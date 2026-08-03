# Does an AI receptionist owe a duty of care to the caller?

> **This is not legal advice.** It is research notes written for a solo founder
> deciding how to build a product, by an agent, not a lawyer. Nothing here is a
> substitute for advice from an Australian legal practitioner, and no one should
> rely on it in a dispute. Where the law is unsettled it says so; where no
> authority could be found it says that too.

**Researched:** 2026-08-03.

**Method.** Primary sources only for anything stated as fact: the
Competition and Consumer Act 2010 (Cth) compilation from the Federal Register of
Legislation, the Wrongs Act 1958 (Vic) authorised version from
`content.legislation.vic.gov.au`, the Civil Liability Act 2003 (Qld) from
`legislation.qld.gov.au`, and judgments from NSW Caselaw
(`caselaw.nsw.gov.au`, the courts' own publication) and the High Court's own
judgment summaries. AustLII and `legislation.nsw.gov.au` both refused automated
access; where a NSW statutory provision appears below it is quoted from a NSW
court's own verbatim recitation of it, and that is flagged. No law-firm
commentary is cited as a source for anything.

**Verified vs inferred.** Every quoted statutory provision and every quoted
judicial passage below was read in the source named. The *application* of any of
it to an AI voice receptionist is inference — no Australian court has decided a
case about one, and I could not find one that has (see §6).

---

## The short answers

1. **Duty to the caller.** Not an established category. It would be a novel
   duty, decided on the "salient features" analysis, and on the current design
   most of the features point away from a duty — the service does not create the
   hazard, has no control over it, and the caller retains control. Nobody has
   decided it. **Arguable, leaning no.**

2. **Does saying one thing create a duty about everything else?** On the closest
   Australian authority, **no** — beginning to help does not generate a duty to
   have helped more. What matters is whether what you *did* say was itself
   careless, or induced reliance that left the person worse off. **The narrowing
   on 2026-07-31 reduced exposure; it did not create a new flank.** This is the
   most confident conclusion in the document, and it is still an inference from
   analogy, not a decided point.

3. **Is improvising advice the larger exposure?** **Yes, clearly.** Australian
   negligence law is organised around the act/omission distinction and treats a
   negligent utterance far more readily than a pure failure to speak. Seven
   hazard scripts were seven positive acts; one referral line is close to none.

There is also a fourth answer nobody asked for but which matters more than any
of the above: **do not market the triple-zero line as a safety feature.** See
§7.

---

## 1. Is there a duty to the third-party caller?

### The framework is settled

There is no accepted category of duty covering "business's answering service to
member of the public who rang it". So it is a novel duty, and the method is the
one Allsop P set out in **Caltex Refineries (Qld) Pty Ltd v Stavar [2009] NSWCA
258** at [102]:

> "If the circumstances fall within an accepted category of duty, little or no
> difficulty arises. If, however, the posited duty is a novel one, the proper
> approach is to undertake a close analysis of the facts bearing on the
> relationship between the plaintiff and the putative tortfeasor by references to
> the 'salient features' or factors affecting the appropriateness of imputing a
> legal duty to take reasonable care to avoid harm or injury."

At [103] the list — verbatim, and note [104]: "There is no suggestion in the
cases that it is compulsory in any given case to make findings about all of
these features. Nor should the list be seen as exhaustive."

> (a) the foreseeability of harm; (b) the nature of the harm alleged; (c) the
> degree and nature of control able to be exercised by the defendant to avoid
> harm; (d) the degree of vulnerability of the plaintiff to harm from the
> defendant's conduct, including the capacity and reasonable expectation of a
> plaintiff to take steps to protect itself; (e) the degree of reliance by the
> plaintiff upon the defendant; (f) any assumption of responsibility by the
> defendant; (g) the proximity or nearness in a physical, temporal or relational
> sense of the plaintiff to the defendant; (h) the existence or otherwise of a
> category of relationship between the defendant and the plaintiff or a person
> closely connected with the plaintiff; (i) the nature of the activity undertaken
> by the defendant; (j) the nature or the degree of the hazard or danger liable to
> be caused by the defendant's conduct or the activity or substance controlled by
> the defendant; (k) knowledge (either actual or constructive) by the defendant
> that the conduct will cause harm to the plaintiff; (l) any potential
> indeterminacy of liability; (m) the nature and consequences of any action that
> can be taken to avoid the harm to the plaintiff; (n) the extent of imposition on
> the autonomy or freedom of individuals, including the right to pursue one's own
> interests; (o) the existence of conflicting duties arising from other principles
> of law or statute; (p) consistency with the terms, scope and purpose of any
> statute relevant to the existence of a duty; and (q) the desirability of, and in
> some circumstances, need for conformance and coherence in the structure and
> fabric of the common law.

### And there is no general duty to rescue

**Ibrahimi v Commonwealth of Australia [2018] NSWCA 321** (Payne JA, Meagher JA
and Simpson AJA agreeing) is the most useful modern statement, at [207]:

> "…the wrongs asserted are better understood as omissions, which engage the
> general principle stated by Windeyer J in *Hargrave v Goldman* (1963) 110 CLR
> 40 … at 66 that the common law 'casts no duty upon a man to go to the aid of
> another who is in peril or distress, not caused by him'. That position has been
> justified as a recognition of individual autonomy, and historically, as
> embodying a distinction between misfeasance and nonfeasance…"

and quoting **Stuart v Kirkland-Veenstra (2009) 237 CLR 215; [2009] HCA 15** at
[88] (Gummow, Hayne and Heydon JJ):

> "The co-existence of a knowledge of a risk of harm and power to avert or
> minimise that harm does not, without more, give rise to a duty of care at common
> law… And there is no general duty to rescue."

The High Court's own summary of *Stuart v Kirkland-Veenstra* (22 April 2009) puts
the operative point in one sentence: "The Justices held that the control of the
risk of the harm to himself remained with Mr Veenstra."

### Applying it (this part is inference)

Against a duty, on the current design:

- **Control (c), and the risk's origin.** The service does not create the fire,
  the gas leak or the injury, and can do nothing about any of them. In
  *Ibrahimi* the absence of any positive act that "increased the risk of harm"
  was decisive at [190] and [224].
- **Vulnerability (d) and autonomy (n).** The caller has a phone in their hand
  and can dial 000. Control over the risk stays with them, as it did with Mr
  Veenstra.
- **Indeterminacy (l).** A duty owed to every member of the public who happens
  to ring any subscribing tradie, about any hazard they might mention, is close
  to the indeterminate class the salient-features analysis exists to constrain.
- **Coherence (q).** A duty on a receptionist to give hazard advice sits badly
  against the licensing statutes that reserve that advice to licensed trades.

Toward a duty:

- **Knowledge (k).** The caller has said, in their own words, that something is
  on fire. Knowledge is actual, not constructive.
- **Relational proximity (g).** The caller chose to speak to this specific
  service and is speaking to it in real time.
- **Assumption of responsibility (f).** This is question 2, and it is the one
  that has to be taken seriously. See below.

**Honest position:** no Australian court has considered whether a business's
answering service — human or automated — owes a duty to a caller in respect of
safety information. The salient features on this design lean against a duty, but
that is an evaluative judgment a court makes, not a rule I can look up.

---

## 2. The crux: does drawing a line at three facts make things worse than silence?

**No, on the closest available Australian authority.** The worry behind the
question is a real one and it has a proper legal name — voluntary assumption of
responsibility, which *is* a recognised route to a duty for an omission. But the
Australian cases do not treat *starting* to help as the thing that triggers it,
and *Ibrahimi* is close to being directly against that reading.

Three passages, all from *Ibrahimi v Commonwealth* [2018] NSWCA 321. The
Commonwealth had patrolled, had begun a rescue, and had not saved everyone.

- **[221]:** "Whilst any assumption of responsibility can be a salient feature
  pointing towards the existence of a duty of care, the characterisation of
  Operation Resolute as an assumption of responsibility for the safe arrival of
  SIEVs in Australia is inaccurate… **There could be no reasonable reliance** upon
  the operations of Border Protection Command to ensure the safe arrival of
  SIEVs."
- **[223]:** "…nothing done by the respondent in this case **made the situation
  of those on board the SIEV worse**."
- **[224]:** "**The commencement of a rescue operation by Commonwealth vessels
  does not support the existence of a novel duty of care.**"

The Court of Appeal also quoted with approval, at [189], Lord Reed in *Robinson v
Chief Constable of West Yorkshire Police* [2018] UKSC 4 at [69(4)], as the
statement of when omissions *do* attract liability:

> "…the exceptions to the general non-imposition of liability for omissions
> include situations where there has been a voluntary assumption of responsibility
> to prevent harm…, situations where a person has assumed a status which carries
> with it a responsibility to prevent harm, such as being a parent or standing in
> loco parentis, and situations where the omission arises in the context of the
> defendant's having acted so as to **create or increase a risk of harm**."

And on reliance, [216] is the sharpest sentence in the judgment for present
purposes. The Court rejected "general reliance" — a bare expectation that an
entity will perform its function properly — as a foundation for a novel duty,
and held:

> "Thus, something more is needed, in the nature of **a specific representation
> upon which reliance was, or should have been, anticipated and could reasonably
> be placed**: *Mutual Life & Citizens' Assurance Co Ltd v Evatt* (1968) 122 CLR
> 556 … at 571 (Barwick CJ); *Tepko Pty Ltd v Water Board* (2001) 206 CLR 1 … at
> [47]…"

### What that means for the three-fact line

The doctrine does not run "you helped a bit, so now justify the edges". It runs:
*did you make a specific representation that a reasonable person would rely on,
and did your conduct leave them worse off than if you had done nothing?*

On the current design, both answers look like no:

- The line is a **referral away from itself** — "give them a ring first" — not an
  undertaking to do anything. It transfers responsibility outward; it does not
  gather it in.
- The prompt forbids the two things that would convert it into a representation
  worth relying on: it must not tell a caller to ring the business back instead
  of 000, and must not ask them to stay on the line. Those are the instructions
  that keep the service on the right side of [223].
- The system never says a situation *is not* dangerous. Saying "that's nothing to
  worry about" would be the positive act that makes someone worse off. Recording
  a hot switchboard without comment is not.

**But — and this is the honest limit — no Australian court has considered
whether a scripted, deliberately-bounded AI triage line amounts to an assumption
of responsibility.** *Ibrahimi* is a public-authority case about a maritime
rescue. It is the closest analogy I can find, not an answer. Its reasoning on
omissions and reliance is general and would be applied, but a court could
distinguish it.

### One UK case worth knowing, and its status

At [128] the Court of Appeal recorded the Commonwealth's submission that
*Michael v Chief Constable of South Wales Police* [2015] 1 AC 1732 at [112]–[115]
is authority that intervening in response to a risk you did not create "does not
generally give rise to a duty of care to provide assistance, except so as not to
make the situation worse". *Michael* is the case of a 999 call that was mishandled
and the caller was killed. It is factually the nearest thing in the common-law
world to "someone rang for help and the system did not get them help".

**It is UK law, and in *Ibrahimi* it appears as a party's submission, not as part
of the ratio.** I record it because it is the analogy anyone advising on this
would reach for, not because it decides anything in Australia.

---

## 3. Positive act vs omission — where the real exposure is

Australian law is organised around this distinction and *Ibrahimi* says so
directly, at [213]:

> "A public authority that chooses to perform an act authorised, but not
> required, by statute is generally liable for any negligence in its performance…
> However, it would not generally be liable for the mere choice not to perform
> such an act… **Much therefore turns on the proper characterisation of harmful
> conduct as amounting to an act, as opposed to an omission.**"

Hazard-specific safety advice is an act. And the test for when a *statement*
attracts a duty is settled and well-defined. **Mbakwe v Sarkis [2009] NSWCA 330**
at [25] calls Barwick CJ's formulation in *MLC v Evatt* (1968) 122 CLR 556 at 571
"the classic statement in Australia", and at [26] confirms it has been accepted
as authoritative in *Shaddock & Associates Pty Ltd v Parramatta City Council [No
1]* [1981] HCA 59, *San Sebastian Pty Ltd v The Minister* [1986] HCA 68, *Esanda
Finance Corporation Ltd v Peat Marwick Hungerfords* [1997] HCA 8 and *Tepko*:

> "…the circumstances must be such as to have caused the speaker or be calculated
> to cause a reasonable person in the position of the speaker to realise that he
> is being **trusted** by the recipient of the information or advice to give
> information which the recipient believes the speaker to possess … or to give
> advice, about a matter upon or in respect of which the recipient believes the
> speaker to possess a capacity or opportunity for judgment, in either case the
> subject matter of the information or advice being **of a serious or business
> nature**… the speaker must realise or the circumstances be such that he ought to
> have realised that **the recipient intends to act upon** the information or
> advice … Further it seems to me that the circumstances must be such that it is
> **reasonable** … for the recipient to seek, or to accept, and to rely upon the
> utterance of the speaker."

Read that against the seven deleted scripts. "Don't touch the main switch",
"stay clear of the cable", "don't reach into the overflow relief gully" satisfy
every element on their face: the subject matter is serious; the caller is being
invited to trust the speaker's judgment about a hazard; the speaker plainly
intends the caller to act on it; and the caller — having rung a trade business —
could reasonably do so.

That the speaker is an AI does not obviously help. If anything it hurts on the
"capacity or opportunity for judgment" limb, because the system is speaking with
the confident fluency of a person who knows, from a speech-to-text transcript of
a hazard it cannot see.

**So the direction of the 2026-07-31 change is the direction the law rewards.**
Deleting seven positive utterances removed seven occasions on which the Evatt
elements could be made out. The remaining line does not engage them: it asserts
no fact about the hazard and offers no judgment about what to do with it. It
says *ask someone else*.

---

## 4. What the Civil Liability Acts add — and they differ by state

These are **state** Acts and they are not uniform. Three checked; the others were
not.

### Obvious risk / no duty to warn

**NSW — Civil Liability Act 2002 s 5H** (quoted verbatim by the NSW District
Court in *Livsey v Australian National Car Parks Pty Ltd* [2014] NSWDC 232; the
NSW legislation site refuses automated access):

> "**5H No proactive duty to warn of obvious risk**
> (1) A person (*the defendant*) does not owe a duty of care to another person
> (*the plaintiff*) to warn of an obvious risk to the plaintiff.
> (2) This section does not apply if: (a) the plaintiff has requested advice or
> information about the risk from the defendant, or (b) the defendant is required
> by a written law to warn the plaintiff of the risk, or (c) the defendant is a
> professional and the risk is a risk of the death of or personal injury to the
> plaintiff from the provision of a professional service by the defendant.
> (3) Subsection (2) does not give rise to a presumption of a duty to warn of a
> risk in the circumstances referred to in that subsection."

**Queensland — Civil Liability Act 2003 s 15** is materially identical, with one
wording difference: the professional carve-out in s 15(2)(c) reads "a
professional, **other than a doctor**".

**Victoria has no equivalent at all.** Part X of the Wrongs Act 1958 has s 53
(meaning of obvious risk) and s 54 (a presumption of awareness, and only where a
*volenti* defence is raised), and s 55 (inherent risk) — but **no section
abolishing a duty to warn of an obvious risk**. Anyone reasoning "the Civil
Liability Act says I don't have to warn" is reasoning about NSW and Queensland,
not Victoria.

Two practical points, both inference:

- Whether "the house is on fire" is an *obvious risk* to the person standing in
  it is almost certainly yes, which is what makes s 5H / s 15 relevant at all.
- **s 5H(2)(a) / s 15(2)(a) matter to this product specifically.** The prompt has
  a whole branch for "when they ask you outright what to do". A caller who asks
  *"should I turn it off at the mains?"* has, on the face of the section,
  "requested advice or information about the risk", and the shield in
  subsection (1) switches off. But — and this is why subsection (3) exists —
  **losing the shield is not the same as acquiring a duty.** Both states say so
  expressly. The general law still has to produce a duty from somewhere, and §1
  and §2 say it probably does not.

### Standard of care for professionals

- **NSW ss 5O and 5P.** Leeming JA's summary in *Paul v Cooke*, quoted by the
  Supreme Court in *Polsen v Harrison (No 8)* [2023] NSWSC 764: "although a
  professional will be held to have satisfied a duty if he or she acted in a
  manner which was widely accepted by peer professional opinion by reason of
  s 5O, that does not apply to liability arising in connection with the failure to
  give a warning, advice or other information in respect of the risk of death or
  personal injury: s 5P."
- **Qld s 22(5)** does the same job expressly, and **Vic s 60** likewise
  ("Section 59 does not apply to a liability arising in connection with the
  giving of (or the failure to give) a warning or other information…").

So the peer-professional-opinion defence is unavailable for warnings anywhere.
It was never going to be available here anyway: a receptionist is not practising
a profession. Note the definitions differ — **Vic s 57**: "*professional* means
an **individual** practising a profession"; **Qld s 20**: "a *professional* means
a **person** practising a profession". A company cannot be a "professional" in
Victoria at all.

What *is* relevant, and cuts the right way, is **Vic s 58**:

> "In a case involving an allegation of negligence against a person (the
> defendant) who **holds himself or herself out as possessing a particular
> skill**, the standard to be applied … is to be determined by reference to — (a)
> what could reasonably be expected of a person possessing that skill…"

The product holds itself out as an AI receptionist that takes messages, and says
so out loud on every call. The yardstick that follows is a competent
receptionist, not a competent safety adviser. **That the disclosure is spoken to
the caller, not buried in the tradie's contract, is doing real legal work.**

### Good samaritan provisions do not help — and one of them is a warning

**Wrongs Act 1958 (Vic) s 31B(1)**: "A good samaritan is an **individual** who
provides assistance, advice or care to another person in relation to an
emergency or accident in circumstances in which — (a) **he or she expects no
money or other financial reward**…". A company operating a paid subscription
service fails both limbs. Section 31B(2)(b) does extend to "providing advice by
telephone", which is tantalising, but the entry conditions are not met.

**NSW Civil Liability Act 2002 Part 8**, quoted verbatim by the District Court in
*Barrett v Lets Go Adventures Pty Ltd* [2016] NSWDC 345 (the judge noting "There
have been few cases acknowledging the nature and extent of these provisions"):

> "**56 Who is a good samaritan.** For the purposes of this Part, a 'good
> samaritan' is a person who, in good faith and **without expectation of payment
> or other reward**, comes to the assistance of a person who is apparently
> injured or at risk of being injured.
> **57 (1)** A good samaritan does not incur any **personal** civil liability…
> **58 (3)** This Part does not confer protection from personal liability on a
> person in respect of any act or omission done or made while the person is
> impersonating a health care or emergency services worker or a police officer or
> is otherwise **falsely representing that the person has skills or expertise in
> connection with the rendering of emergency assistance**."

Same conclusion — paid service, and "personal" liability at that. But **s 58(3)
is worth reading as a design constraint rather than a defence**: the legislature
singles out falsely representing emergency expertise as the thing that forfeits
protection. An AI that sounds like it knows what to do in an emergency is
walking towards that description. One that says "I'm the AI receptionist here,
so I'm honestly not the one to tell you what to do" is walking away from it.

---

## 5. Australian Consumer Law

Verified against the current compilation of the Competition and Consumer Act
2010 (Cth) (Compilation No. 165, in force 1 July 2026), Schedule 2.

**Section 60 does not reach the caller.** The text is:

> "**60 Guarantee as to due care and skill.** If a person supplies, in trade or
> commerce, services **to a consumer**, there is a guarantee that the services
> will be rendered with due care and skill."

and the right of action, **s 267(1)**: "A consumer may take action under this
section if: (a) a person (*the supplier*) supplies, in trade or commerce,
services **to the consumer**…"

The caller is not the acquirer of anything. And the ACL's mechanism for
extending guarantees past the acquirer is confined to goods — the s 2
definition begins "**affected person, in relation to goods, means**…" and there
is no services counterpart anywhere in the Act. **That is a deliberate statutory
choice, not a gap, and it is the cleanest single finding in this document: the
s 60 due-care-and-skill guarantee is not available to a third-party caller.**

**Section 60 does run to the tradie.** The tradie acquires the service and is a
consumer under s 3(3) (monetary limb: $40,000, or such greater amount as is
prescribed — a PickupAI subscription is far below it either way). So the vendor
owes the tradie a guarantee of due care and skill, and s 267(4) lets the tradie
recover "damages for any loss or damage suffered … because of the failure to
comply with the guarantee if it was reasonably foreseeable". **If a caller ever
sued a tradie over something the AI said, the tradie's route back to the vendor
runs through s 60, not through negligence.**

(That an ACL services claim can carry *personal injury* damages is not
theoretical: *Barrett v Lets Go Adventures Pty Ltd* [2016] NSWDC 345 was a claim
for personal injury pleaded under ACL ss 60 and 61, informed by the Civil
Liability Act. The plaintiff there was the customer, which is the point — the
claim ran because he was the acquirer.)

**But s 18 is open to anybody.** "A person must not, in trade or commerce,
engage in conduct that is misleading or deceptive or is likely to mislead or
deceive", and s 236(1) gives an action to "a person (*the claimant*) [who]
suffers loss or damage because of the conduct of another person" where the
conduct contravened Chapter 2 or 3. **No consumer requirement, no privity
requirement.** So the caller's realistic ACL route is not s 60 — it is s 18 plus
s 236, and it needs a misleading representation.

Which is the same conclusion as §3 by a different road: **the exposure is in
what the system says, not in what it declines to say.** A silence is hard to
characterise as misleading conduct. "Don't touch the main switch" is a
representation.

---

## 6. Is there anything specific to AI? Caselaw, then regulators

### Caselaw: none found

**I could not find an Australian judgment on the liability of an AI system for
what it says to a member of the public.** Searched: NSW Caselaw full text
(`caselaw.nsw.gov.au`) for combinations of *chatbot* / *artificial intelligence*
with *duty of care* and *negligence*; AustLII, the Federal Court judgments site,
the High Court site and the Queensland reports site via filtered web search. What
comes back is Australian courts regulating AI use *by lawyers* — the Federal
Court's Generative Artificial Intelligence Practice Note (GPN-AI), and judgments
about fabricated citations — which is a different subject.

The nearest thing in the common-law world is not Australian:
*Michael v Chief Constable of South Wales Police* [2015] 1 AC 1732 (UK), the
mishandled 999 call. **I have seen it only as cited in *Ibrahimi* at [128] — as
a party's submission — not in the original report**; see §2. (The Canadian airline
chatbot decision everyone cites is widely reported but I could not retrieve it
from a primary source; both CanLII and the tribunal's own site refused automated
access. **Treat it as unverified.** It is in any event about misrepresentation,
not safety, which is where §3 says the exposure sits anyway.)

**Anyone who tells you the Australian position on AI liability is settled is
telling you about a different jurisdiction's law or about a law-firm article.**

### Regulators: no AI-specific law, and existing law is the deliberate answer

**There is no Australian AI Act, and as at August 2026 the government's stated
position is that there will not be one for this kind of product.** The **National
AI Plan** (Commonwealth of Australia, December 2025) says so under the heading
"Keep Australians Safe":

> "The government's regulatory approach to AI will continue to build on
> Australia's robust existing legal and regulatory frameworks, ensuring that
> **established laws remain the foundation** for addressing and mitigating
> AI-related risks… Agencies and regulators will retain responsibility for
> identifying, assessing, and addressing potential AI-related harms within their
> respective policy and regulatory domains."

and under Action 7:

> "Australia has strong existing, **largely technology-neutral** legal
> frameworks, including sector-specific guidance and standards, that can apply to
> AI and other emerging technologies."

**The 2024 "mandatory guardrails for AI in high-risk settings" proposal did not
survive into the Plan.** The phrase "mandatory guardrails" appears nowhere in
the 2025 National AI Plan document; what appears instead is the AI Safety
Institute, whose role is to "support existing regulators with independent
advice". Treat the 2024 proposals paper as superseded rather than pending —
though note that is my reading of an absence, and an absence is weaker evidence
than a statement.

**Directly on the ACL question in §5**, the Plan records:

> "Consumer protections for AI-enabled goods and services: The Department of the
> Treasury's Review of AI and the Australian Consumer Law found that
> **Australians enjoy the same strong consumer protections for AI products and
> services as they do for traditional goods and services, including safety
> protections.** The Government will consult with states and territories on minor
> opportunities to clarify existing rules that the review identified…"

That is the government saying, in terms: the ACL applies to AI exactly as it
applies to anything else. Which means §5's analysis — s 60 for the tradie, s 18
+ s 236 for anyone — is the analysis, not a stopgap until AI law arrives.

**What is voluntary.** The **Voluntary AI Safety Standard** (National AI Centre,
published 5 September 2024, page updated 2 December 2025) sets out "10 voluntary
guardrails that apply to all organisations throughout the AI supply chain",
including "transparency and accountability requirements across the supply
chain". On 21 October 2025 the National AI Centre published **Guidance for AI
Adoption** — "6 essential practices" that the department says "evolves the
Voluntary AI Safety Standard". **Both are voluntary and neither is a source of
liability**, but adopting them is the cheapest available evidence of reasonable
care if breach is ever argued.

**Institutionally**, the Office of AI was established in the Department of the
Prime Minister and Cabinet on 15 July 2026. Its stated remit is to "design and
legislate the new Australia artificial intelligence (AI) standard", with the
concrete items named being mandatory requirements for large AI **data centres**
(energy and water) and copyright protections for creators. **Nothing in its
stated remit touches AI giving safety information to members of the public.**

### The specific question: guidance on AI giving safety-adjacent information

**I found none.** Searched: `industry.gov.au` (DISR, National AI Centre,
Voluntary AI Safety Standard, National AI Plan, Guidance for AI Adoption),
`pmc.gov.au` (Office of AI), and filtered searches across `accc.gov.au`,
`aph.gov.au` and `treasury.gov.au`. The Plan names the sectors where AI-specific
regulatory review *is* happening — healthcare, medical device software (TGA),
copyright, privacy, online safety — and a business's answering service is in
none of them.

**So there is no regulator telling you what an AI must or must not say to
someone who mentions a hazard. That is the whole answer, and it means the
question is governed by the general law in §§1–5 and by nothing else.**

*(Caveat on this section: it rests on what I could reach. `accc.gov.au` was
searched but not exhaustively read, and ACMA's emergency-call instruments were
not examined — those obligations attach to carriage service providers, not to a
business answering its own phone, but I did not verify that against the
Telecommunications (Emergency Call Service) Determination itself. If it matters,
check it.)*

---

## 7. Who is the defendant — and the one thing to change

**Unresolved, and it is a question of fact.** The AI answers in the tradie's
business name and says "I'm the AI receptionist here". A caller who wanted to sue
would sue the business — that is whose phone they rang and whose name they heard.
Whether the vendor is also a defendant turns on whether the vendor's design
choices are characterised as its own negligent act (a positive act, engaging §3)
or as merely supplying a tool the tradie deployed. **No Australian authority
addresses this for an AI service and I did not find one.** The commercial answer
is more certain than the legal one: the tradie is sued first, and comes back
along the s 60 chain.

### The actionable finding

*Ibrahimi* [216] says a novel duty founded on reliance needs "**a specific
representation upon which reliance was, or should have been, anticipated and
could reasonably be placed**". Nothing on a phone call creates that. **Marketing
does.**

A landing page that says the AI "makes sure emergencies get to triple zero", or
"screens dangerous calls", or "keeps your customers safe" is precisely the
specific representation the case says is missing — and it would be made to the
world, in trade or commerce, in writing, and archived. It would simultaneously
strengthen a reliance-based duty argument and create an s 18 exposure if the
system ever failed to do it.

**The triple-zero line is a design detail. It must never become a selling
point.** That is the single change with the best ratio of protection to cost,
and it costs nothing.

**Checked, and the product is currently on the right side of this.** Nothing in
the marketing routes in `src/server.ts` makes a safety claim, and the website
sales assistant's scripted answer in `src/chat/system-prompt.ts` (to "Can it
handle emergencies properly?") is *"It does not try to… An AI improvising safety
advice off a phone call is a liability you do not want."* That answer is worth
more than it looks: it is a written, archived disclaimer of exactly the
representation *Ibrahimi* [216] says a reliance-based duty would need. **Do not
soften it to win a sale.**

Secondary, all cheaper than they sound:

- **Keep the two prohibitions absolutely.** Never tell a caller to ring the
  business back instead of 000; never ask them to stay on the line. These are the
  instructions that keep the product inside *Ibrahimi* [223] — nothing done made
  the situation worse.
- **Never assert the negative.** "That's probably fine" about a hot switchboard
  would be an Evatt-shaped statement and is the one utterance that could convert
  a recorded fact into a negligent misstatement. The prompt already forbids
  saying a situation is or is not dangerous; that rule is load-bearing.
- **Retain transcripts and audio.** Every question in §1–§3 turns on what the
  caller actually said and what the system actually said back. The trigger is the
  caller's own words; the evidence of those words is the defence.
- **The "say it once, then drop it" rule is the weakest point** and worth
  watching, because dropping the subject after a caller plays a gas smell down is
  the closest the design comes to conduct a plaintiff could characterise as
  reassurance. It is mitigated by never saying anything reassuring — the system
  goes quiet, it does not agree. Keep it that way.

---

## What would change these conclusions

- **Any Australian judgment** on a duty of care owed by an automated system to a
  third party it speaks to. There is none as at August 2026; the first one will
  matter more than everything above.
- **Marketing the safety behaviour.** Turns §2's "no reasonable reliance" into an
  argument, per *Ibrahimi* [216].
- **Adding hazard-specific advice back.** Re-engages the *Evatt* test in §3 on
  every call it fires.
- **The system ever discouraging a 000 call**, or holding someone on the line.
  Converts an omission into an act that made things worse.
- **A mandatory AI guardrails regime** with obligations attaching to deployers of
  AI in safety-relevant settings — see §6 for where that stood when this was
  written.
- **Operating in a state not checked here.** SA, WA, TAS, NT and ACT have their
  own Civil Liability Acts and were not read. Victoria alone diverged materially
  on two of the three provisions checked, so assume the others diverge too.

---

## Sources

Legislation (primary):

- Competition and Consumer Act 2010 (Cth), Sch 2 (Australian Consumer Law),
  Compilation No. 165, in force 1 July 2026 — Federal Register of Legislation,
  `https://www.legislation.gov.au/C2004A00109/latest/text`
- Wrongs Act 1958 (Vic), authorised version No. 130, in force 25 February 2026 —
  `https://www.legislation.vic.gov.au/in-force/acts/wrongs-act-1958/130`
- Civil Liability Act 2003 (Qld), current in-force version —
  `https://www.legislation.qld.gov.au/view/whole/html/inforce/current/act-2003-016`
- Civil Liability Act 2002 (NSW) — site refused automated access; ss 5H, 5O, 5P
  quoted from the judgments below.

Judgments (primary, from the courts' own publication):

- *Caltex Refineries (Qld) Pty Limited v Stavar* [2009] NSWCA 258 —
  `https://www.caselaw.nsw.gov.au/decision/549ff6423004262463c653b8`
- *Ibrahimi v Commonwealth of Australia* [2018] NSWCA 321 —
  `https://www.caselaw.nsw.gov.au/decision/5c11f9bce4b0b9ab40212176`
- *Mbakwe v Sarkis* [2009] NSWCA 330 —
  `https://www.caselaw.nsw.gov.au/decision/549ff1cf3004262463c544d4`
- *Action Paintball Games Pty Ltd (In liquidation) v Barker* [2013] NSWCA 128 —
  `https://www.caselaw.nsw.gov.au/decision/54a63a703004de94513daa91`
- *Livsey v Australian National Car Parks Pty Ltd* [2014] NSWDC 232 —
  `https://www.caselaw.nsw.gov.au/decision/54a640003004de94513dca55`
- *Barrett v Lets Go Adventures Pty Ltd* [2016] NSWDC 345 —
  `https://www.caselaw.nsw.gov.au/decision/584f4a2de4b058596cba2881`
- *Polsen v Harrison (No 8)* [2023] NSWSC 764 —
  `https://www.caselaw.nsw.gov.au/decision/1891e1641949b4395b01df44`
- *Polsen v Harrison (No 8)* quotes Leeming JA in *Paul v Cooke* at [42]; the
  original of *Paul v Cooke* was not read.
- *Stuart v Kirkland-Veenstra* [2009] HCA 15 — High Court judgment summary,
  22 April 2009,
  `https://www.hcourt.gov.au/assets/publications/judgment-summaries/2009/hca15-2009-04-22.pdf`
  (full reasons quoted at [88] via *Ibrahimi* [207])

Government publications (primary):

- **National AI Plan**, Commonwealth of Australia, December 2025 —
  `https://www.industry.gov.au/sites/default/files/2025-12/national-ai-plan.pdf`
- **Voluntary AI Safety Standard**, National AI Centre, published 5 September
  2024, page updated 2 December 2025 —
  `https://www.industry.gov.au/publications/voluntary-ai-safety-standard`
  (and *Guidance for AI Adoption*, 21 October 2025)
- **Office of AI**, Department of the Prime Minister and Cabinet, established
  15 July 2026 — `https://www.pmc.gov.au/domestic-policy/office-ai`
