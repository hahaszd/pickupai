# Cold email under the Spam Act 2003: is scraping 10,614 addresses legally available?

> **This is not legal advice.** It is research notes written for a solo founder
> deciding how to acquire customers, by an agent, not a lawyer. Nothing here is a
> substitute for advice from an Australian legal practitioner, and no one should
> rely on it in a dispute or before a regulator. Where the law is unsettled it
> says so; where no authority could be found it says that too.

**Researched:** 2026-08-09.

**Method.** Primary sources only for anything stated as fact. The **Spam Act 2003
(Cth), Compilation No. 10, compilation date 10 March 2016, registered 9 June
2016 (Authorised Version C2016C00614)** — this is the *current in-force*
compilation; the Federal Register of Legislation's version list for the Act
(queried via the register's own OData API) shows eight versions, of which
C2016C00614 is the only one flagged `isCurrent`/`isLatest`, with no end date and
no uncommenced amendments. **The Spam Act has not been amended since 10 March
2016.** Also read: **Spam Regulations 2021 (F2021L00285)**, as made, commenced
1 April 2021, still the only version; **Crimes Act 1914 (Cth) s 4AA**,
Compilation No. 166, compilation date 4 June 2026 (C2026C00219); and the
**Crimes (Amount of a Penalty Unit) Instrument 2026 (F2026N00424)**, made
15 June 2026, registered 16 June 2026, commenced 1 July 2026. All were read as
the authorised PDF served by legislation.gov.au, not as a summary.

From `acma.gov.au`: the guidance page **"Avoid sending spam"** (last updated
29 November 2024) and the **"Statement of Expectations — Use of consent in
telemarketing and e-marketing"** (linked from the July 2024 publication page
*Consumer consent: expectations for businesses conducting telemarketing and
e-marketing*, page last updated 17 February 2026), read as the DOCX ACMA
publishes; the guidance pages **"Dealing with spam"** and **"Telemarketing and
e-marketing — common issues and mistakes"**. For enforcement: ACMA's
**infringement-notice register** and its **spam and telemarketing investigations
register** (which also lists enforceable undertakings and formal warnings, 2015
to July 2026), plus the redacted infringement notices ACMA publishes in full —
**Ticketek** (7 Sept 2023), **Sportsbet** (23 Dec 2021) and **Latitude Finance**
(April 2026) were read as PDFs and their pleaded subsections extracted directly.
A background agent swept the remaining published notices, investigation reports
and quarterly reports; its findings on the pleaded provisions of Betfair,
PointsBet, Telstra, CBA, Pizza Hut, Luxottica, Outdoor Supacentre, Kmart, Uber,
DoorDash and mycar are relied on in §5.2 and are marked there as verified from
ACMA's own PDFs.

Refused automated access, explicitly: **`judgments.fedcourt.gov.au`** returns
HTTP 403 behind a JavaScript challenge, so no Federal Court judgment on the
Spam Act was read in the original. **ACMA's on-site search
(`acma.gov.au/search?keys=…`) returns an empty JavaScript shell** to a plain
HTTP client, so the site was navigated by direct URL and by domain-restricted
web search rather than by its own search box. The Explanatory Memorandum to the
Spam Bill 2003 lives on `aph.gov.au` (ParlInfo), which is outside the two
primary sources this research was scoped to, and was **not** read — so nothing
below rests on what Parliament said it was aiming at. No law-firm article,
marketing-vendor guide or SEO page is cited as a source for anything.

**Verified vs inferred.** Every statutory provision quoted below was read in the
compilation named. Every dollar figure is arithmetic on a penalty-unit value read
in F2026N00424. **The application of any of it to a scraping script, or to a
person typing addresses into a spreadsheet, is inference.** There is no
Australian judgment interpreting ss 20–22 that I could read, and — across every
enforcement action ACMA has published since 2015 — no matter about address
harvesting at all (§5.1). The line between the two paths is drawn below from the
words of the definition and nothing else.

---

## The short answers

1. **Path A is legally dangerous, and the danger is not where the brief expected
   it.** A purpose-built script that crawls 10,614 business websites extracting
   `mailto:` addresses falls squarely inside the ordinary meaning of
   **"address-harvesting software"** in s 4, and the resulting table is a
   **"harvested-address list"**. But ss 20–22 are **not** free-standing
   prohibitions — every one of them is hinged on s 16, the no-consent rule. So
   harvesting does not independently outlaw Path A; it **doubles the number of
   civil penalty provisions you contravene if the sends turn out to be
   non-consented, and destroys any story that you did not know what you were
   doing.** The thing that actually kills Path A is Schedule 2 clause 4(2)(d),
   in point 3.

2. **Path B is clean on the harvesting question.** A human reading 100 websites
   and typing addresses into a spreadsheet uses no "software … specifically
   designed or marketed for" searching the internet and harvesting addresses.
   Sections 20, 21 and 22 do not engage at all. The line between (a) and (b) is
   genuinely there in the text — but it is *not* the line the brief guessed at,
   because it is not what makes Path A fail.

3. **The real Path A killer is that inferred consent is address-by-address, and
   one of its conditions can only be checked by reading the page.** Schedule 2
   cl 4(2)(d) destroys inferred consent for any address published alongside a
   statement that the holder does not want unsolicited commercial messages. A
   human sees such a statement. **A scraper cannot.** At 10,614 addresses you
   cannot honestly assert cl 4(2)(d) for each one, and under s 16(5) **the
   burden of the consent exception is yours**. That is the fork resolving itself
   — just one clause further down than expected.

4. **A penalty unit is $364 from 1 July 2026.** For a body corporate with no
   prior record: **$36,400 per contravention of s 16(1), capped at $728,000 for
   all such contraventions on a single day**, and $18,200 / $364,000 for each of
   ss 17, 18, 20, 21 and 22. With a prior record those become $182,000 /
   $3,640,000 and $91,000 / $1,820,000. For an individual the same figures are
   one-fifth of the body-corporate numbers. The realistic instrument is not the
   Federal Court but an infringement notice: **$364,000 for a body corporate on
   50-or-more alleged s 16 contraventions, $72,800 for an individual.**

5. **No ACMA enforcement action has ever concerned address harvesting.** Across
   every published notice, enforceable undertaking and formal warning from 2015
   to July 2026, ss 20–22 appear nowhere; every Spam Act matter is consent (s 16),
   sender identification (s 17) or unsubscribe (s 18). That is not permission —
   it is a map of how you would actually be caught (§5.1). Two things in that
   record bear directly on this repo: **`Service Seeking Pty Ltd` ($50,400, 2018)
   and `Oneflare Pty Ltd` ($75,600 + undertaking, 2019) — two of the six
   directories in `LISTS.md` — were themselves penalised for spamming**; and ACMA
   acts against sole traders, not just companies (`Noah Rose trading as
   BetDeluxe`, $50,172).

6. **Three non-obvious findings worth more than the rest.** (a) **Paying
   somebody else to scrape is worse than scraping yourself** — building your own
   list is not "acquiring" anything, so s 21 does not bite, but buying or
   commissioning one engages s 21 against you *and* s 20 against the supplier
   (§1.5). (b) **Drip-feeding a campaign multiplies the penalty rather than
   reducing it** — ACMA's published arithmetic applies the Schedule 3 table day
   by day and sums the days, so ten days of 1,061 emails costs roughly ten times
   what one day of 10,614 costs (§5.5). (c) **The money is not in consent.** The
   third-largest Spam Act penalty on record — Latitude Finance, $3,960,000,
   April 2026 — was charged **entirely under s 17(1)**, sender
   identification, with no s 16 or s 18 count in the notice at all. And five
   enforcement actions in eighteen months have been about businesses treating a
   message with a marketing link in it as a "service" message. **Both of those
   traps apply to transactional SMS this product already sends to its own
   tenants, regardless of which outreach path is chosen** (§5.4).

---

## 1. Address harvesting: ss 20–22 and the s 4 definitions

### 1.1 The two definitions, verbatim (s 4)

> **address-harvesting software** means software that is specifically designed
> or marketed for use for:
> (a) searching the internet for electronic addresses; and
> (b) collecting, compiling, capturing or otherwise harvesting those electronic
> addresses.

> **harvested-address list** means:
> (a) a list of electronic addresses; or
> (b) a collection of electronic addresses; or
> (c) a compilation of electronic addresses;
> where the production of the list, collection or compilation is, to any extent,
> directly or indirectly attributable to the use of address-harvesting software.

Two supporting definitions in the same section matter:

> **software** includes a combination of software and associated data.

> **use** has a meaning affected by section 11.

and s 11:

> **11 Extended meaning of use**
> Unless the contrary intention appears, a reference in this Act to the use of a
> thing is a reference to the use of the thing either:
> (a) in isolation; or
> (b) in conjunction with one or more other things.

*(A correction to the brief: these definitions are in **section 4**, the
definitions section. Schedule 1 is "Designated commercial electronic messages"
and Schedule 2 is "Consent". Nothing about harvesting is in either Schedule.)*

Note what the definition of *address-harvesting software* does **not** contain:
no threshold of scale, no requirement that the software also send anything, no
requirement of bad intent, and no requirement that the software be a product
sold to anyone. "Designed **or** marketed" is disjunctive — designed alone is
enough. Limbs (a) and (b) are conjunctive — searching **and** collecting.

And note how wide *harvested-address list* is: **"to any extent, directly or
indirectly attributable"**. One harvested address contributed to a compilation
arguably makes the whole compilation a harvested-address list. That has an
operational consequence in §6.

### 1.2 Three sections, three different mental elements

This is the structural point the brief asked for, and it is the most useful thing
in this document. Each section has its own prohibition, its own exception, and
its own mental element — and they are not the same shape.

**Section 20 — supply. Objective, about someone else's intent.**

> **20(1)** A person (the *supplier*) must not supply or offer to supply:
> (a) address-harvesting software; or (b) a right to use address-harvesting
> software; or (c) a harvested-address list; or (d) a right to use a
> harvested-address list;
> to another person (the *customer*) if:
> (e) the supplier is: (i) an individual who is physically present in Australia
> at the time of the supply or offer; or (ii) a body corporate or partnership
> that carries on business or activities in Australia at the time of the supply
> or offer; or
> (f) the customer is: (i) an individual who is physically present in Australia
> at the time of the supply or offer; or (ii) a body corporate or partnership
> that carries on business or activities in Australia at the time of the supply
> or offer.

> **20(2)** Subsection (1) does not apply if the supplier had no reason to
> suspect that the customer, or another person, intended to use the
> address-harvesting software or the harvested-address list, as the case may be,
> in connection with sending commercial electronic messages in contravention of
> section 16.

**Section 21 — acquisition. Subjective, about your own intent.**

> **21(1)** A person must not acquire: (a) address-harvesting software; or
> (b) a right to use address-harvesting software; or (c) a harvested-address
> list; or (d) a right to use a harvested-address list;
> if the person is: (e) an individual who is physically present in Australia at
> the time of the acquisition; or (f) a body corporate or partnership that
> carries on business or activities in Australia at the time of the acquisition.

> **21(2)** Subsection (1) does not apply if the person did not intend to use
> the address-harvesting software or the harvested-address list, as the case may
> be, in connection with sending commercial electronic messages in contravention
> of section 16.

**Section 22 — use. Not a mental element at all; a characterisation of what the
use actually was.**

> **22(1)** A person must not use: (a) address-harvesting software; or (b) a
> harvested-address list;
> if the person is: (c) an individual who is physically present in Australia at
> the time of the use; or (d) a body corporate or partnership that carries on
> business or activities in Australia at the time of the use.

> **22(2)** Subsection (1) does not apply in relation to the use of
> address-harvesting software or a harvested-address list, if the use was not in
> connection with sending commercial electronic messages in contravention of
> section 16.

Each section also carries identical ancillary-liability subsections (aid, abet,
counsel or procure; induce; be knowingly concerned in; conspire), and in each
case both the primary subsection and the ancillary subsection are declared civil
penalty provisions — ss 20(6), 21(4), 22(4). Section 4's definition of *civil
penalty provision* lists "(d) subsections 20(1) and (5); (e) subsections 21(1)
and (3); (f) subsections 22(1) and (3)".

### 1.3 Does it require intent that the list be used for non-consensual sending?

**Yes — but the requirement is expressed as an exception, not as an element, and
its shape differs in each section.** Every one of ss 20(2), 21(2) and 22(2) is
keyed to the same phrase: *"in connection with sending commercial electronic
messages in contravention of section 16"*.

The consequence is worth stating flatly, because it is the opposite of the
common summary of these sections:

> **If the messages you send do not contravene s 16, you do not contravene
> ss 20–22 either, no matter how the list was built.** Section 22(2) is not
> about your state of mind; it says the use simply "was not in connection with"
> a s 16 contravention, and it is satisfied on the facts if the sends were
> consented to.

So harvesting is not an independent gate. It is a **multiplier on a s 16
breach**. Send 10,614 non-consented emails from a scraped list and you have
contravened s 16(1) *and* s 22(1); send 10,614 properly-consented emails from the
same list and you have contravened neither. This reframes the fork: the question
that decides Path A is **consent** (§2), not harvesting.

Two asymmetries are worth recording:

- **s 20 carries an evidential-burden provision for one exception and not the
  other.** Section 20(4) says "A person who wishes to rely on subsection (3)
  bears an evidential burden in relation to that matter" — subsection (3) being
  the "did not know the customer was in Australia" exception. There is **no**
  equivalent for s 20(2), and ss 21 and 22 contain no evidential-burden
  provision at all. Compare s 16(5), which expressly covers ss 16(2), (3) and
  (4). Whether that silence means the ordinary civil onus sits with ACMA on
  ss 21(2) and 22(2) is an open question and **I found no authority on it.** It
  is a live difference from the consent exception in s 16, where the burden is
  unambiguously the sender's.
- **s 22 has no "acquire a right to use" limb.** Sections 20 and 21 cover a
  *right to use*; s 22(1) covers only the software and the list themselves.

### 1.4 Applying it — this part is inference

**(a) A script that crawls 10,614 business websites extracting `mailto:`
addresses.**

**Inside the definition, on the ordinary meaning of the words.** Such a script
is software; it is specifically designed for exactly limb (a) and limb (b) and
for nothing else; the fact that it is bespoke and never sold is irrelevant
because "designed **or** marketed" is disjunctive. The output table is a
harvested-address list under every one of paragraphs (a), (b) and (c) of that
definition. Running it, and running a send off it, is "use" within s 22(1) as
extended by s 11.

**Where it is genuinely unclear — and both arguments are thin:**

- *"Searching the internet".* A script pointed at a fixed list of 10,614 known
  URLs is arguably fetching known pages rather than "searching the internet".
  I think this argument fails — crawling ten thousand third-party sites across
  the public internet to find addresses is the natural meaning of the phrase —
  but it has not been decided.
- *"Specifically designed".* A general-purpose HTTP client plus a regular
  expression written inline is not obviously software "specifically designed"
  for harvesting; a named module whose job is address extraction plainly is.
  The provision was enacted in 2003, when the visible target was commercial
  spamware products, and the words "or marketed" sit beside "designed" in a way
  that hints at a product rather than a one-off script. **That is an argument
  from context, not from text, and the text is against it.** Do not rely on it.

**No Australian authority.** I could not read a single judgment interpreting
"address-harvesting software" — see the Method note on `judgments.fedcourt.gov.au`
— and §5 records that I found no ACMA enforcement action under ss 20–22 either.
So the honest position is: **the words cover the script, nobody has tested it,
and there is no regulator statement narrowing it.**

**(b) A person opening 100 websites and typing addresses into a spreadsheet.**

**Outside ss 20–22 entirely, and not close to the line.** No software is
specifically designed or marketed for searching the internet and harvesting
addresses; a browser is designed to display pages and a spreadsheet to hold
cells, and neither satisfies the conjunctive test. The resulting list is not
"attributable to the use of address-harvesting software" to any extent. Sections
20, 21 and 22 have nothing to bite on.

**Three ways to lose that cleanliness, all avoidable:**

1. **A browser extension, a "scrape this page" bookmarklet, or an AI agent asked
   to visit the sites and return the addresses.** Any of these is software doing
   limbs (a) and (b), and delegating the reading to a model does not change the
   design purpose of the thing you built to do it. **If Path B is chosen, the
   collection must actually be manual.**
2. **Mixing.** "To any extent, directly or indirectly attributable" means one
   harvested address dropped into the same table arguably makes the whole
   compilation a harvested-address list. Keep the 100 in their own table with a
   `source` value that records "typed by hand from <URL> on <date>", and never
   union it with the 10,614.
3. **Buying a top-up.** See next.

### 1.5 The finding nobody asked for: outsourcing the scrape is the worst option

Section 21 uses "acquire", and s 4 says:

> **acquire**, when used in relation to goods or services, has the same meaning
> as in the *Competition and Consumer Act 2010*.

Producing a list yourself is not acquiring it from anyone, so **s 21 almost
certainly does not reach self-scraping** (inference — the definition is keyed to
goods and services and to acquisition *from* a person). But the moment the list
is bought from a data vendor, or a contractor is paid to build it, or an
off-the-shelf scraping service is subscribed to:

- **you** are acquiring a harvested-address list or a right to use one → s 21(1),
  with only your subjective non-intent under s 21(2) standing between you and a
  contravention, and a purchase order is exactly the document that evidences the
  intent;
- **the supplier** is exposed under s 20(1), with the "no reason to suspect"
  exception in s 20(2) turned against them by the fact that they knew what you
  wanted it for;
- and s 20(5), s 21(3) and s 22(3) each make it a contravention to "aid, abet,
  counsel or procure", "induce", or be "knowingly concerned in" the other side's
  contravention — so the two of you are each exposed on both sides.

ACMA's own guidance says the responsibility does not transfer:

> "Take care when you buy or use a marketing list. You are still responsible for
> making sure you have consent for any addresses you use."
> — ACMA, *Avoid sending spam*, last updated 29 November 2024

and, in its Statement of Expectations:

> "Importantly, businesses are responsible for their consent-related compliance
> obligations under the Rules, regardless of whether they outsource their
> telemarketing or e-marketing or consent gathering through third party or
> affiliate marketing arrangements."

*(That second quotation is the regulator's view of its own expectations, not the
statute. The statutory version of the same point is the ancillary-contravention
subsections above, which are enforceable.)*

---

## 2. Inferred consent for email — and exactly how it differs from `LISTS.md`

### 2.1 The consent hook is in s 16, and the burden is yours

> **16(1)** A person must not send, or cause to be sent, a commercial electronic
> message that: (a) has an Australian link; and (b) is not a designated
> commercial electronic message.

> **16(2)** Subsection (1) does not apply if the relevant electronic
> account-holder consented to the sending of the message.

> **16(5)** A person who wishes to rely on subsection (2), (3) or (4) bears an
> evidential burden in relation to that matter.

Schedule 2 clause 2:

> For the purposes of this Act, **consent** means:
> (a) express consent; or
> (b) consent that can reasonably be inferred from: (i) the conduct; and (ii)
> the business and other relationships; of the individual or organisation
> concerned.

### 2.2 Schedule 2 clause 4, verbatim

> **4 When consent may be inferred from publication of an electronic address**
>
> **(1)** For the purposes of this Act, the consent of the relevant electronic
> account-holder may not be inferred from the mere fact that the relevant
> electronic address has been published.
>
> *Exception—conspicuous publication*
>
> **(2)** However, if:
> (a) a particular electronic address enables the public, or a section of the
> public, to send electronic messages to:
> (i) a particular employee; or
> (ii) a particular director or officer of an organisation; or
> (iii) a particular partner in a partnership; or
> (iv) a particular holder of a statutory or other office; or
> (v) a particular self-employed individual; or
> (vi) an individual from time to time holding, occupying or performing the
> duties of, a particular office or position within the operations of an
> organisation; or
> (vii) an individual, or a group of individuals, from time to time performing a
> particular function, or fulfilling a particular role, within the operations of
> an organisation; and
> (b) the electronic address has been **conspicuously published**; and
> (c) it would be reasonable to assume that the publication occurred **with the
> agreement of**:
> (i) if subparagraph (a)(i), (ii), (iii), (iv) or (v) applies—the employee,
> director, officer, partner, office-holder or self-employed individual
> concerned; or
> (ii) if subparagraph (a)(vi) or (vii) applies—the organisation concerned; and
> (d) the publication is **not accompanied by**:
> (i) a statement to the effect that the relevant electronic account-holder does
> not want to receive unsolicited commercial electronic messages at that
> electronic address; or
> (ii) a statement to similar effect;
>
> the relevant electronic account-holder is taken, for the purposes of this Act,
> to have consented to the sending of commercial electronic messages to that
> address, **so long as the messages are relevant to**:
> (e) if subparagraph (a)(i), (ii), (iii), (iv) or (v) applies—the work-related
> business, functions or duties of the employee, director, officer, partner,
> office-holder or self-employed individual concerned; or
> (f) if subparagraph (a)(vi) applies—the office or position concerned; or
> (g) if subparagraph (a)(vii) applies—the function or role concerned.

That is **four conditions plus a relevance proviso** — (a) role, (b)
conspicuous publication, (c) reasonable to assume the holder agreed to the
publication, (d) no contrary statement, and relevance to the work function.

### 2.3 Does Schedule 2 distinguish email from phone? **No. Not once.**

This is the direct answer to the brief's question, and it matters because it
means the phone reasoning in `LISTS.md` transfers to email one-for-one — along
with every one of its gaps.

- Clause 4(2) says "**a particular electronic address**" throughout. No type.
- "Electronic address" is **not defined** in s 4 at all. The only guidance is a
  note to s 5(1): *"Email addresses and telephone numbers are examples of
  electronic addresses."*
- The only place the Act splits by address type is the s 4 definition of
  *relevant electronic account-holder* — "(a) if the electronic address is an
  email address—the individual or organisation who is responsible for the
  relevant email account … (c) if the electronic address is a telephone
  number—the individual or organisation who is responsible for the relevant
  telephone account" — and that split exists only to identify *whose* consent is
  in issue, not to change the test.
- Section 5(5) removes voice calls from the Act entirely ("If a message is sent
  by way of a voice call made using a standard telephone service, the message is
  not an electronic message for the purposes of this Act"), which is why
  telemarketing lives under the Do Not Call Register Act and SMS lives here. It
  does not touch email.

**So "the email analysis" and "the phone analysis" are the same analysis.** Any
answer that says email is treated more permissively than SMS, or less, is wrong
on the text.

### 2.4 How this differs from `LISTS.md` in practice — four real differences

`LISTS.md` states the inferred-consent test as three conditions: conspicuously
published, no "no commercial messages" notice, and message directly related to
the business function. That is a fair summary of cl 4(2)(b), (d) and the
relevance proviso. What it leaves out is what changes the answer for email.

**(i) It omits cl 4(2)(c) — "reasonable to assume the publication occurred with
the agreement of" the person.** This is the condition that decides source
quality, and it cuts *for* business-website email and *against* directory data.
`LISTS.md` reaches the right conclusion about `truelocal`/`hipages`/etc. by a
different route (their terms of service), and that route is a contractual and
ACL argument, not a Spam Act one. **Clause 4(2)(c) is the Spam Act route to the
same answer, and it is stronger**: a listing published by a directory, possibly
scraped by the directory itself, is not obviously published with the tradie's
agreement, so inferred consent never forms in the first place.

**(ii) The licence-register basis that carries `LISTS.md` does not exist for
email.** The NSW Fair Trading, QBCC and VBA public registers are the sources
`LISTS.md` rates "inferred consent — defensible", and they publish **phone
numbers**. They are not a source of email addresses. Whatever else Path A does,
it cannot inherit that assessment. It would be collecting from business
websites — a *better* cl 4(2)(c) source, because the business published its own
address — and that is a genuine improvement over the SMS list.

**(iii) But business websites are a much worse cl 4(2)(d) source, and this is
what closes Path A.** Clause 4(2)(d) is destroyed by a statement "to the effect
that" the holder does not want unsolicited commercial messages, **or a statement
to similar effect** — deliberately loose wording. Website privacy policies,
terms of use, and contact-page notes routinely carry exactly that. A person
collecting 100 addresses reads the page and sees it. **A `mailto:` scraper
cannot see it, will not look for it, and produces a list in which you cannot say
which rows are affected.** Under s 16(5) the burden of establishing consent is
yours, address by address. At n=100 you can discharge it. At n=10,614 you
cannot, and the fact that the collection was automated is the reason.

**(iv) The unsubscribe problem inverts.** `LISTS.md` documents a real headache:
Australian alphanumeric SMS sender IDs are one-way, so s 18 compliance needed a
hosted opt-out shortlink and a third party (Mobile Message) holding the
suppression list — with a known gap where `prospects.unsubscribed_at` is not
updated. **Email has none of that.** A reply-to address satisfies s 18(1)(c)–(g)
natively, the suppression record stays in our own database, and Spam Regulations
2021 s 7 is easy to satisfy. On s 18, email is the easier channel by a wide
margin. See §3.

That headache is not hypothetical, and `LISTS.md` was right to treat it
seriously: it is precisely the failure ACMA names on its *Common issues and
mistakes* page ("people generally can't reply to an SMS with a Sender ID, which
means that these unsubscribe processes don't work, and will therefore break the
law") and precisely the fact pattern behind the $3,960,000 Latitude Finance
notice of April 2026. See §5.4.

**One thing that does *not* differ, contrary to a plausible guess:** the Do Not
Call Register is not an email-vs-phone distinction here. It governs voice calls,
and ACMA states "The Do Not Call Register does not apply to business phone
numbers — numbers that are primarily for business use are ineligible to be
registered." Marketing SMS and marketing email are both governed by the Spam Act
alone.

### 2.5 What ACMA says — the regulator's view, which is narrower than the statute

ACMA's **business-facing** guidance describes inferred consent without mentioning
the conspicuous-publication route at all, and frames it instead as
relationship-based:

> "In some circumstances, you may infer that you have consent to send marketing
> messages if the recipient has knowingly and directly given their address and
> it is reasonable to believe they would expect to receive marketing from your
> business. This is usually when a person has a provable, ongoing relationship
> with your business, and the marketing is directly related to that
> relationship."
> — ACMA, *Avoid sending spam*, last updated 29 November 2024

and in the Statement of Expectations:

> "The less common type is inferred consent – this consent is inferred by a
> business based on an existing relationship and the type of product being
> marketed."

> "Do not send messages based solely on the fact that the email address or phone
> number has been published (publication does not mean consent has been given -
> there are multiple other conditions that must be met as set out in the Rules)"

> "Do not place contact details on marketing lists or marketing databases
> without consent (for example, if a consumer visits a website or sends an email
> to a business it is unlikely to constitute consent to inclusion on a marketing
> list or in a marketing database)"

> "for e-marketing, consent must be obtained before messages can be sent,
> **including to businesses**"

**But ACMA does acknowledge the cl 4(2) route — on the page it writes for
recipients rather than senders.** This is the fairest single statement of the
regulator's position and it is the one worth relying on, from *Dealing with
spam*:

> "You may also be sent marketing messages **relevant to your role or position**
> if you make your email address or phone number public. **If you don't want to
> receive marketing messages, you should write that clearly where your email or
> number is published.**"

That is Schedule 2 cl 4(2) in plain English: the role limb, the publication
limb, and — in the second sentence — cl 4(2)(d), told to consumers as the way to
switch inferred consent off. **ACMA accepts that a business-role address, made
public without a contrary statement, can be messaged about that role.** Path B
lives in that sentence.

So the honest summary is **not** "ACMA denies cl 4(2) exists"; it is:

- The statute creates a publication-based route to consent that needs no prior
  relationship, and ACMA states it to consumers in those terms.
- ACMA's guidance **to senders** never mentions that route, presents inferred
  consent as relationship-based, and says in terms: "**Do not send messages based
  solely on the fact that the email address or phone number has been published**
  (publication does not mean consent has been given — there are multiple other
  conditions that must be met as set out in the Rules)."
- The Statement of Expectations describes itself as *"not legal advice nor … a
  definitive compliance guide to the Rules … an outcome-focused guide to better
  practice"*, so it is expectations, not law.
- **The gap between those two is the risk.** A cl 4(2) argument is available and
  correct on the text, but you would be making it to a regulator whose
  sender-facing guidance tells you not to, and under s 16(5) you carry the
  burden. That is survivable at 100 hand-checked addresses with written
  provenance. It is not survivable at 10,614.

And ACMA's express statement that consent is required "including to businesses"
removes the most common folk belief about B2B email in Australia. There is no
B2B carve-out, no exemption for role addresses, and no ACMA guidance page on
business-to-business email at all.

---

## 3. What a compliant message must contain

These obligations apply **whether or not you have consent**. Section 17 in
particular has no consent exception and applies even to designated commercial
electronic messages.

### 3.1 Sender identification — s 17

> **17(1)** A person must not send, or cause to be sent, a commercial electronic
> message that has an Australian link unless:
> (a) the message clearly and accurately identifies the individual or
> organisation who authorised the sending of the message; and
> (b) the message includes accurate information about how the recipient can
> readily contact that individual or organisation; and
> (c) that information complies with the condition or conditions (if any)
> specified in the regulations; and
> (d) that information is reasonably likely to be valid for at least 30 days
> after the message is sent.

No condition is currently specified in the regulations for s 17(1)(c) — Spam
Regulations 2021 contains only s 6 (faxes are not commercial electronic
messages) and s 7 (conditions for the s 18 unsubscribe address). So (c) is
presently inert.

ACMA's gloss, which goes slightly beyond the text and should be treated as its
view:

> "accurately identify your name or business name … include correct contact
> details for you or your business … If someone else sends messages on your
> behalf, the message must still identify you as the business that authorised
> the message. Use the correct legal name of your business, or your name and
> Australian Business Number (ABN). This information must remain correct for at
> least 30 days after you send the message."

Note the statute says "the individual **or organisation** who **authorised** the
sending". Section 8(1) attributes an individual's authorisation to the
organisation they act for. If PickupAI is not incorporated, the identified
person is the individual.

### 3.2 Functional unsubscribe — s 18

> **18(1)** A person must not send, or cause to be sent, a commercial electronic
> message that: (a) has an Australian link; and (b) is not a designated
> commercial electronic message; unless:
> (c) the message includes: (i) a statement to the effect that the recipient may
> use an electronic address set out in the message to send an unsubscribe
> message to the individual or organisation who authorised the sending of the
> first-mentioned message; or (ii) a statement to similar effect; and
> (d) the statement is presented in a clear and conspicuous manner; and
> (e) the electronic address is reasonably likely to be capable of receiving:
> (i) the recipient's unsubscribe message (if any); and (ii) a reasonable number
> of similar unsubscribe messages sent by other recipients (if any) of the same
> message; **at all times during a period of at least 30 days after the message
> is sent**; and
> (f) the electronic address is **legitimately obtained**; and
> (g) the electronic address complies with the condition or conditions (if any)
> specified in the regulations.

> **18(9)** For the purposes of the application of this section to a commercial
> electronic message, where the sending of the message is authorised by an
> individual or organisation, an **unsubscribe message** is: (a) an electronic
> message to the effect that the relevant electronic account-holder does not
> want to receive any further commercial electronic messages from or authorised
> by that individual or organisation; or (b) an electronic message to similar
> effect.

**So the "how long must the facility remain functional" answer is 30 days from
the date of each message** — s 18(1)(e). It is not indefinite, and it runs per
message, so a rolling campaign means a rolling obligation. Section 17(1)(d)
imposes a separate, parallel 30 days on the *sender contact information*.

### 3.3 The cost and friction conditions — Spam Regulations 2021 s 7

This is where "must not cost more than usual" actually lives.

> **7 Conditions for electronic address for receiving unsubscribe message**
> **(1)** For the purposes of paragraph 18(1)(g) of the Act, this section
> specifies the conditions to be complied with by an electronic address set out
> in a commercial electronic message as the electronic address to be used to
> send an unsubscribe message.
>
> *Premium service*
> **(2)** The use of the electronic address must not require the recipient of
> the commercial electronic message to use a premium service.
>
> *Usual cost*
> **(3)** The electronic address must not cost more to use than the usual cost
> of using that kind of electronic address, using the same kind of technology as
> was used to receive the commercial electronic message.
>
> *Fees and charges*
> **(4)** Subject to subsection (5), the use of the electronic address must not
> require the recipient of the commercial electronic message to pay a fee or
> other charge to the sender of the message or a related person.
>
> *Personal information and accounts*
> **(6)** The use of the electronic address must not require the recipient of
> the commercial electronic message to:
> (a) provide personal information (within the meaning of the *Privacy Act
> 1988*) other than the electronic address to which the commercial electronic
> message was sent; or
> (b) log in to an existing account, or create a new account, with:
> (i) the person who sent the commercial electronic message or caused the
> message to be sent; or (ii) the individual or organisation who authorised the
> sending of the commercial electronic message.

Regulation 7(6) is the one that has produced the largest single Australian spam
penalty (§5). **An unsubscribe page that asks for a name, a reason, or a login
is a contravention**, and so is one that asks the recipient to type an address
other than the one the message went to.

### 3.4 The 5-day period — and it is **not** in s 18

The brief asked about "the 5-working-day period". It is not in s 18, and the Act
does not use the phrase "working days" anywhere. It is in Schedule 2:

> **6 When withdrawal of consent takes effect**
> **(1)** For the purposes of this Act, if: (a) one or more electronic messages
> have been sent to the relevant electronic account-holder's electronic address;
> and (b) the relevant electronic account-holder has consented to the sending of
> those commercial electronic messages to that electronic address; and (c) an
> individual or organisation authorised the sending of those commercial
> electronic messages to that electronic address; and (d) the relevant
> electronic account-holder, or a user of the relevant account, sends the
> individual or organisation: (i) a message to the effect that the account-holder
> does not want to receive any further commercial electronic messages at that
> electronic address from or authorised by that individual or organisation; or
> (ii) a message to similar effect;
> **the withdrawal of consent takes effect at the end of the period of 5
> business days beginning on**: (e) if the message referred to in paragraph (d)
> is an electronic message—the day on which the message was sent; …
>
> **(2)** For the purposes of subclause (1), a **business day** is a day that is
> not a Saturday, a Sunday or a public holiday in: (a) if the message referred
> to in paragraph (1)(d) is an electronic message—the place to which the message
> was sent; …

Three consequences worth having straight:

1. **"Business days", not "working days".** ACMA's *Avoid sending spam* page says
   "honours a request to unsubscribe within 5 **working** days" — that is the
   regulator's paraphrase, and it is the only place ACMA uses that word. Its
   Statement of Expectations uses the statutory term ("Action unsubscribe
   requests as quickly as practicable, and always within a maximum of 5
   **business** days"), as does *Dealing with spam* ("Businesses must generally
   stop sending you marketing within 5 **business** days of your request").
2. The clock is defined by **public holidays at the recipient's location**,
   which for a national tradie list means eight different calendars. Honouring
   instantly is the only sane implementation, and it is what the product already
   does for SMS.
3. Clause 6 governs **withdrawal of consent** — i.e. it protects you from
   contravening s 16 with a message already in flight. It does not license
   continuing to send. Section 18's own obligation is about the facility, not
   the timing.

### 3.5 The designated-message escape hatch, and why it does not help

Schedule 1 cl 2 exempts a message that "consists of no more than factual
information (with or without directly-related comment)" plus identified
housekeeping items, **but only if** "assuming that none of that additional
information had been included in the message, the message would not have been a
commercial electronic message". A message whose purpose is to promote PickupAI
is a commercial electronic message by definition (s 6(1)(d)–(f)) and cannot pass
that test. Schedule 1 cl 3's government/political-party/registered-charity
exemption and cl 4's educational-institution exemption are equally unavailable.
**There is no version of a cold sales email that is a designated commercial
electronic message.** And even if there were, Schedule 1's own note records that
designated messages still have to comply with s 17.

---

## 4. Penalties: the arithmetic, current as at today

### 4.1 The penalty unit is $364, from 1 July 2026

Crimes Act 1914 s 4AA, as it stood in Compilation No. 166 (compilation date
4 June 2026):

> **4AA(1)** In a law of the Commonwealth or a Territory Ordinance, unless the
> contrary intention appears: **penalty unit** means the amount of $330 (subject
> to indexation under subsection (3)).
>
> **(1A)** If the amount of a penalty unit is indexed under subsection (3), the
> Minister must, by notifiable instrument, publish the amount of a penalty unit…
>
> **(3)** On 1 July 2026 and each third 1 July following that day (an
> **indexation day**), the dollar amount mentioned in subsection (1) is replaced
> by the amount worked out using the following formula: [indexation factor ×
> dollar amount immediately before the indexation day]

That indexation happened. **Crimes (Amount of a Penalty Unit) Instrument 2026**
(F2026N00424), made by the Attorney-General on 15 June 2026, registered 16 June
2026, commencing 1 July 2026:

> **5 Amount of a penalty unit**
> For the purposes of subsection 4AA(1A) of the Act, the amount of a penalty
> unit is **$364**.
> Note: The amount of a penalty unit in this section: (a) is the result of
> indexation under subsection 4AA(3) of the Act; and (b) only applies to
> offences committed on or after 1 July 2026 (see subsection 4AA(8) of the Act).

**So: $364 from 1 July 2026; $330 for anything before that date.** The next
indexation day is 1 July 2029.

**One wrinkle I could not resolve.** Section 4AA(8) and the note above both say
the increased amount "only applies to **offences** committed on or after the
indexation day". Spam Act contraventions are **not offences** — s 27 says
"Criminal proceedings not to be brought for contravention of civil penalty
provisions". Whether s 4AA(8)'s transitional rule reaches civil penalty
provisions at all, and if not what date fixes the unit value for a civil
contravention, **I found no authority on.** ACMA's own practice resolves it the
sensible way — its published Ticketek notice applies "the amount of a penalty
unit … at the time of the alleged contraventions" (§5.5) — so for anything sent
now, $364. That is the regulator's construction, not a decided point.

### 4.2 Maximum penalties the Federal Court may impose — s 25

Section 25 sets four grids, on two axes: body corporate or not, prior record or
not. A "prior record" arises under s 25(2) once the Federal Court has previously
made an order against you in respect of **that same civil penalty provision**.
Section 16(1), (6) and (9) attract double the units of everything else.

| Who / record | Provision | Per contravention | Cap on all contraventions of that provision on one day |
|---|---|---|---|
| Body corporate, no prior record | s 16(1),(6),(9) | 100 PU = **$36,400** | 2,000 PU = **$728,000** |
| Body corporate, no prior record | ss 17, 18, 20, 21, 22 (and ancillaries) | 50 PU = **$18,200** | 1,000 PU = **$364,000** |
| Body corporate, prior record | s 16(1),(6),(9) | 500 PU = **$182,000** | 10,000 PU = **$3,640,000** |
| Body corporate, prior record | other CPPs | 250 PU = **$91,000** | 5,000 PU = **$1,820,000** |
| Individual, no prior record | s 16(1),(6),(9) | 20 PU = **$7,280** | 400 PU = **$145,600** |
| Individual, no prior record | other CPPs | 10 PU = **$3,640** | 200 PU = **$72,800** |
| Individual, prior record | s 16(1),(6),(9) | 100 PU = **$36,400** | 2,000 PU = **$728,000** |
| Individual, prior record | other CPPs | 50 PU = **$18,200** | 1,000 PU = **$364,000** |

The repeat-contravention multiplier the brief asked about is **5×** on the
per-contravention figure and **5×** on the daily cap, and it is
provision-specific: a prior order about s 16 does not give you a prior record on
s 18.

Section 24(2) is the discretion that sits above all of this — the Court "must
have regard to all relevant matters, including … (d) whether the person has
previously been found by the Court in proceedings under this Act to have engaged
in any similar conduct".

**Worked example, because it is the number that matters here.** One day's send
of 10,614 non-consented emails is 10,614 contraventions of s 16(1). The
per-contravention maximum is meaningless at that volume; the daily cap governs.
For a body corporate with no prior record that is **$728,000** for the s 16
contraventions, plus **$364,000** for the s 22(1) use of a harvested-address
list, plus **$364,000** each if s 17 or s 18 were also breached. For an
individual: **$145,600 + $72,800 + $72,800 each**. These are maxima, not
predictions.

### 4.3 Infringement notices — the instrument that actually gets used

Schedule 3 cl 5 fixes the amounts; ACMA does not have discretion over them.

| Notice covers | Body corporate | Individual |
|---|---|---|
| A single alleged s 16(1),(6),(9) contravention | 20 PU = **$7,280** | 4 PU = **$1,456** |
| 2–49 alleged s 16 contraventions | 20 PU × number | 4 PU × number |
| **50 or more** alleged s 16 contraventions | 1,000 PU = **$364,000** | 200 PU = **$72,800** |
| A single alleged contravention of any other CPP | 10 PU = **$3,640** | 2 PU = **$728** |
| 2–49 of any other CPP | 10 PU × number | 2 PU × number |
| **50 or more** of any other CPP | 500 PU = **$182,000** | 100 PU = **$36,400** |

**The ceiling is reached at fifty messages.** A body-corporate notice for 49
alleged s 16 contraventions is 49 × 20 PU = $356,720; for 50 it is a flat
$364,000; for 10,614 sent **on one day** it is still $364,000. **Fifty
non-consented emails in a day and 10,614 in a day attract the same amount.**
For an individual the equivalent flat figure is $72,800, reached at the same
fifty messages.

But read §5.5 before concluding that the flat rate caps your exposure: **ACMA's
published arithmetic applies this table separately to each day of contravention
and adds the days together**, which is how a 170-message campaign produced a
$515,040 notice. Spreading a send across days multiplies it.

---

## 5. ACMA enforcement in practice

Sources for this section: ACMA's consolidated **infringement-notice register**
(`/infringement-notices`), its **spam and telemarketing investigations register**
(`/investigations-spam-and-telemarketing`, which covers 2017 to July 2026 and
also lists enforceable undertakings and formal warnings), and the individual
infringement-notice PDFs ACMA publishes redacted. All read 2026-08-09.

### 5.1 The headline: no harvesting enforcement exists

**Across every ACMA enforcement action published on `acma.gov.au` — infringement
notices, enforceable undertakings and formal warnings, from 2015 to July 2026 —
not one concerns address-harvesting software, a harvested-address list, ss 20,
21 or 22, or scraping addresses from websites.** Every single Spam Act matter is
characterised as one or more of: "without consent" (s 16), "without adequate
sender contact information" / "without clearly identifying who authorised them"
(s 17), or "without a functional unsubscribe facility" (s 18).

I could also find **no Federal Court penalty under the Spam Act** on any ACMA
register for 2015–2026. The only Federal Court entry anywhere in ACMA's spam
archive is *JER Pty Ltd*, August 2012, and that was proceedings for **breach of
an enforceable undertaking**, not for a contravention. The one recent Federal
Court penalty ACMA publicises ($1.5m, April 2025) is a **telemarketing / Do Not
Call Register Act** matter, not a Spam Act one. *(`judgments.fedcourt.gov.au`
refused access, so I cannot exclude the existence of a case ACMA does not
publicise.)*

That absence cuts two ways, and both matter.

- **It is not evidence that harvesting is tolerated.** It is evidence about what
  ACMA can see. Consent, sender ID and unsubscribe failures are visible in the
  message itself and in the complainant's account history. How a list was built
  is invisible until ACMA uses its compulsory information-gathering powers —
  which it has, and which its Statement of Expectations warns about in terms:
  "If these records are required by the ACMA using its compulsory information
  gathering powers, they must be produced."
- **It does tell you the enforcement path.** Nobody gets caught for harvesting.
  You get caught because somebody complains, ACMA asks you to demonstrate
  consent for that address, and you cannot. The harvesting surfaces in your
  answer to that question, not before it.

**The one place ACMA touches automated collection at all** is a heading on its
*Telemarketing and e-marketing — common issues and mistakes* page:

> **Unsubscribe issues and automated gathering of addresses**
> The 'unsubscribe' function is a common cause of non-compliance, as are consent
> issues around **automated gathering of addresses**.

That is the entire published position. It flags automated collection as a known
consent problem and says nothing further — no definition, no examples, no
enforcement behind it. And note where it locates the problem: **in consent, not
in ss 20–22.** Which is exactly the reading of the statute in §1.3.

On buying lists and outsourcing, from the same page:

> **Outsourced marketing**
> Businesses often outsource their telemarketing and e-marketing to third
> parties or purchase marketing lists from external providers. Businesses must
> be aware however, that they cannot outsource their obligations under the spam
> and telemarketing laws through these arrangements. **Ultimately, the business
> is responsible.**

### 5.2 The register — every Spam Act action, with names, dates and amounts

Amounts and descriptions are ACMA's own. "EU" = court-enforceable undertaking,
which ACMA attaches to most of the larger notices and which imposes a multi-year
compliance-program obligation on top of the money. Where I extracted the pleaded
subsections from ACMA's published notice PDF I mark it **[verified]**; otherwise
the provisions are inferred from ACMA's description and marked *(described)*.

| Entity | Published | Instrument | Amount | Provisions |
|---|---|---|---|---|
| Tabcorp Holdings Ltd (TAB) | Jul 2026 | Infringement notice | $1,254,000 | s 16 *(described)* — "emails and SMS without consent" |
| Latitude Finance Australia | Apr 2026 | Notice + EU | **$3,960,000** | **s 17(1) only [verified]** |
| Lululemon Athletica Australia Pty Ltd | Mar 2026 | Notice + EU | $702,900 | **s 18(1) only [verified]** |
| Betfair Pty Limited | Jul 2025 | Notice + EU | $871,660 | **s 16(1) + s 18(1) [verified]** |
| Tabcorp Holdings Ltd (TAB) | Jun 2025 | Notice + EU | $4,003,270 | ss 16, 17, 18 *(described; notice PDF is an image scan)* |
| PointsBet Australia Pty Ltd | May 2025 | Notice + EU | $500,800 | **s 16(1) + s 17(1)(b) + s 18(1) [verified]** |
| Telstra Limited | Mar 2025 | Notice + EU | $626,000 | **s 18(1) only [verified]** |
| Commonwealth Bank of Australia | Oct 2024 | Notice + EU | **$7,502,610** | **s 16(1) + s 18(1) [verified]** |
| Pizza Pan Group Pty Ltd t/a Pizza Hut Australia | May 2024 | Notice + EU | $2,502,500 | **s 16(1) only [verified]** |
| Luxottica Retail Australia Pty Ltd | Apr 2024 | Notice + EU | $1,512,500 | **s 16(1) + s 18(1) [verified]** |
| Outdoor Supacentre Pty Ltd (4WD Supacentre) | Jan 2024 | Notice + EU | $302,500 | **s 16(1) only [verified]** |
| Ticketek Pty Ltd | Oct 2023 | Notice + EU | $515,040 | **s 16(1) only [verified]** |
| Kmart Australia | Oct 2023 | Notice + EU | $1,303,500 | **s 16(1) only [verified]** |
| Uber Australia Pty Ltd | Oct 2023 | Notice (no EU) | $412,500 | **s 16(1) + s 18(1) [verified]** |
| DoorDash Technologies Australia Pty Ltd | Aug 2023 | Notice + EU | $2,011,320 | **s 16(1) + s 18(1) [verified]** |
| Tyre and Auto Pty Ltd t/a mycar Tyre & Auto | Jun 2023 | Notice + EU | $1,047,840 | **s 16(1) + s 18(1) [verified]** |
| Commonwealth Bank of Australia | Jun 2023 | Notice + EU | $3,552,000 | ss 16 and/or 18 *(described; image scan)* |
| **Noah Rose trading as BetDeluxe** | Feb 2023 | Notice | **$50,172** | ss 16, 17, 18 *(described)* |
| Investbybit Pty Ltd t/a Binance Australia | Dec 2022 | Notice + EU | $2,000,220 | ss 16 / 18 *(described)* |
| Victorian Institute of Technology Pty Ltd | Sep 2022 | **EU only** | — | s 16 *(described)* |
| Latitude Finance Australia | Sep 2022 | Notice + EU | $1,549,560 | ss 16 / 18 *(described)* |
| The Wine Group | May 2022 | Notice + EU | amount not stated on register | s 16 *(described)* |
| Sportsbet Pty Ltd | Feb 2022 | Notice + EU | $2,508,600 | **s 16(1) + s 18(1) [verified]** |
| Pineapple Funding Pty Ltd | Feb 2022 | **EU only** | — | s 16 *(described)* |
| Phoenix Securities Pty Ltd | Feb 2022 | Notice + EU | $26,640 | s 16 *(described)* |
| Cigno Pty Ltd | Jan 2022 | **EU only** | — | s 16 *(described)* |
| IPF Digital Australia Pty Ltd t/a Credit24 | Jul 2021 | **Formal warning** | — | s 16 *(described)* |
| Lastminuteloan.com.au Pty Ltd | Jul 2021 | **Formal warning** | — | s 16 *(described)* |
| Kalkine Media Pty Ltd | Jun 2021 | Notice + EU | $100,800 | s 16 *(described)* |
| Telco First Pty Ltd | Mar 2021 | Notice + EU | $79,800 | ss 16, 17, 18 *(described)* |
| Kogan Australia Pty Ltd | Jan 2021 | Notice + EU | $310,800 | s 18 *(described)* |
| Tyro Payments Limited | Nov 2020 | **EU only** | — | s 18 *(described)* |
| Ooh Aah Productions Pty Ltd (Rainbow Flag Australia) | Sep 2020 | **Formal warning** | — | s 16 *(described)* |
| Woolworths Group Limited | Jun 2020 | Notice + EU | $1,003,800 | ss 16, 18 *(described)* |
| Singtel Optus Pty Limited | Jan 2020 | Notice + EU | $504,000 | ss 16, 18 *(described)* |
| **Oneflare Pty Ltd** | Nov 2019 | Notice + EU | **$75,600** | s 16 *(described)* |
| Mill Estate Holdings Pty Ltd | May 2019 | **Formal warning** | — | ss 16, 18 *(described)* |
| Brand Link Media Pty Ltd | Apr 2019 | Notice + EU | **$12,600** | s 16 *(described)* |
| Ticketek Pty Ltd | Feb 2019 | **Formal warning** | — | s 16 *(described)* |
| Gardener Consultants Pty Ltd (Promotional USB) | Nov 2018 | **Formal warning** | — | s 16 *(described)* |
| Force Industries Pty Ltd | Sep 2018 | **Formal warning** | — | s 16 *(described)* |
| **Service Seeking Pty Ltd** | Jul 2018 | Notice | **$50,400** | ss 16, 17, 18 *(described)* |
| **Helen Woods trading as the Australian College of Administration** | Jul 2018 | **Formal warning** | — | s 16 *(described)* |
| We Fix Credit | May 2018 | **Formal warning** | — | s 16 *(described)* |
| TPG Internet Pty Limited | Nov 2017 | Notice | $360,000 | s 16 *(described)* |
| ValueAd Marketing Pty Ltd | Oct 2017 | **Formal warning** | — | s 17 *(described)* |
| Careers Australia Group Limited | Jul 2017 | **Formal warning** | — | ss 17, 18 *(described)* |
| Upside.Digital Pty Ltd | Jul 2017 | Notice + EU | $39,600 | s 17 *(described)* |
| J & L Mainwaring (oneofthebest.com.au) Pty Ltd | May 2016 | Notice | $21,600 | *(unspecified)* |
| Darren James traded as Web 1000 | Dec 2015 | **Formal warning** | — | s 16 *(described)* |
| Club Retail Pty Ltd | May 2015 | **EU only** | — | s 16 *(described)* |
| Vadkho Pty Ltd | Apr 2015 | **Formal warning** | — | s 18 *(described)* |

### 5.3 Four rows that bear directly on this project

**(i) `Service Seeking Pty Ltd`, $50,400, July 2018 — and `Oneflare Pty Ltd`,
$75,600 + enforceable undertaking, November 2019.** Both are directory sources
named in `LISTS.md` (`serviceseeking`, `oneflare`). **Two of the six directories
whose listings supplied our 10,614-row prospect table have themselves been
penalised by ACMA for sending marketing SMS without consent.** That is not a
legal argument about our position, but it is the strongest available evidence
that `LISTS.md`'s "grey to red — DO NOT USE" rating of directory-scraped data is
correctly rated, and it says something about where those directories' contact
data came from in the first place.

**(ii) `Noah Rose trading as BetDeluxe`, $50,172, February 2023, and
`Helen Woods trading as the Australian College of Administration`, formal
warning, July 2018.** Natural persons trading under business names. **ACMA does
act against individuals, not only companies.** Nothing about being a sole
founder is protective — it changes the multiplier in §4, not the exposure.

**(iii) The small notices are real: `Brand Link Media Pty Ltd` $12,600 (2019),
`J & L Mainwaring` $21,600 (2016), `Phoenix Securities` $26,640 (2022),
`Upside.Digital` $39,600 (2017), `Service Seeking` $50,400 (2018), `BetDeluxe`
$50,172 (2023).** So the §4.3 flat rate is not the only outcome — a small,
short, quickly-corrected campaign has produced five-figure notices. And ACMA's
first response to a small operator is frequently a **formal warning** with no
money attached at all: thirteen of the fifty-odd matters above are warnings. That
is genuine mitigation, and it is worth knowing that ACMA also sends **compliance
alerts** before opening an investigation — its Outdoor Supacentre release
records that ACMA "sent 5 spam compliance alerts" over eleven months before
formally investigating. **An operator who stops when contacted is in a very
different position from one who does not.**

**(iv) `Latitude Finance Australia`, $3,960,000, April 2026 — charged entirely
under s 17(1).** I read the published notice: it cites "subsection 17(1)" three
times and "section 17" four times, and **contains no reference to s 16 or s 18
anywhere**. ACMA's own register nevertheless describes the conduct as "Sending
marketing SMS without adequate sender contact information **and without a
functional unsubscribe facility**".

That gap matters for two reasons. First, **ACMA's register descriptions are not
a reliable guide to the provisions actually pleaded** — treat them as summaries
of conduct, not of law. (The same divergence appears at Telstra 2025 — described
as consent + unsubscribe, pleaded as s 18(1) alone — and Pizza Hut 2024 —
described as all three, pleaded as s 16(1) alone.) Second, and more usefully: **the third-largest Spam Act
penalty in Australian history was for sender-identification, not consent.**
Section 17 is the provision this project is least likely to think about and
carries no consent defence at all.

### 5.4 The unsubscribe cases, and why they are the ones to fear

The three largest penalties in the table — CBA $7.5m, TAB $4m, Latitude $3.96m —
and the two most recent — Lululemon $702,900 and Telstra $626,000 — are all
about the unsubscribe mechanism or the sender information, not about where the
list came from. Two are worth spelling out because they map exactly onto
Spam Regulations 2021 s 7 (§3.3) and onto arrangements this repo already has.

**`Telstra Limited`, $626,000, s 18(1) only.** ACMA: *"Telstra sent 10,433,812
texts with unsubscribe arrangements in breach of the law over a 21-month period
from 2022 to 2024, including over 10.3 million that required recipients to
provide personal information to opt out. Under Australian law, businesses cannot
require consumers to log in to accounts or provide personal information to
unsubscribe from receiving further commercial messages except where the
consumers have agreed to such arrangements."* That is reg 7(6), enforced.

**The alphanumeric-sender trap, which `LISTS.md` already navigates.** ACMA, on
*Common issues and mistakes*:

> **SMS unsubscribe and alpha tags**
> We are seeing instances where businesses are requesting that people reply to
> an SMS Sender ID (a message header that is usually a shortened business name)
> to unsubscribe. The problem is people generally can't reply to an SMS with a
> Sender ID, which means that these unsubscribe processes **don't work, and will
> therefore break the law**.

The Latitude $3.96m notice is that paragraph enforced: ACMA's release records
that *"While recipients were told they could reply 'STOP' to unsubscribe, many
messages were not capable of being used in this way."* **`LISTS.md`'s hosted
opt-out shortlink is the mitigation for exactly this failure mode, and it is
load-bearing, not a nicety.** If `MOBILE_MSG_OPT_OUT_LINK` were ever unset in
production while an alphanumeric sender ID was in use, the remaining "email
hello@getpickupai.com.au" fallback is what stands between the product and the
Latitude fact pattern. It is an electronic address capable of receiving an
unsubscribe message, so it should hold — but it is the whole defence.

**`Lululemon`, $702,900, and the "service message" trap.** ACMA: *"Lululemon
mischaracterised service messages, including delivery and order confirmation
emails, that also had a clear marketing purpose… This is the fifth enforcement
action the ACMA has undertaken in the last 18 months against businesses that
have incorrectly treated messages as non-commercial even though they contained
or had links to clearly commercial material."* The Statement of Expectations
gives the rule: *"A link to a web page with commercial content is likely to mean
the message is also commercial."*

**This is the trap nearest to this product's existing behaviour.** PickupAI
sends transactional SMS to tenants — welcome messages, onboarding nudges,
trial-expiry warnings, lead notifications. Any of those that promotes an upgrade,
or links to a page that does, becomes a commercial electronic message and needs
s 17 and s 18 compliance. Five enforcement actions in eighteen months say ACMA
is looking at precisely this.

### 5.5 How ACMA actually calculates the number

ACMA publishes some of its infringement notices in full. **Ticketek Pty Ltd**
(notice dated 7 September 2023) sets out the arithmetic:

| Date of contravention | Contraventions of s 16(1) | Penalty units | Penalty |
|---|---|---|---|
| 2/10/2022 | 27 | 20 | $119,880 |
| 3/10/2022 | 18 | 20 | $79,920 |
| 9/10/2022 | 4 | 20 | $17,760 |
| 10/10/2022 | 17 | 20 | $75,480 |
| 18/10/2022 | 104 | 1000 | $222,000 |
| **Total** | **170** | | **$515,040** |

with the footnote: *"At the time of the alleged contraventions, the amount of a
penalty unit was $222, as set by section 4AA of the Crimes Act 1914."*

Three things fall out, and they are the most practically useful facts here:

1. **ACMA applies the penalty-unit value in force at the time of the
   contravention.** That resolves the §4.1 wrinkle in practice, at least as
   ACMA's own construction: for anything sent today, $364.
2. **ACMA computes the Schedule 3 cl 5 table separately for each day, then adds
   the days.** 104 messages on 18 October crossed the "50 or more" line and drew
   the flat 1,000 penalty units; the four smaller days were priced by
   multiplication. **170 messages cost $515,040.** *(Whether cl 5, which speaks
   of "the notice", compels a day-by-day computation rather than one across the
   whole notice, is ACMA's construction. It is the one it has published and used,
   and it produces totals far above the single-notice cap.)*
3. **Therefore drip-feeding a campaign multiplies the exposure.** 10,614 emails
   on one day is one day at the flat rate. 1,061 a day for ten days is ten days
   at the flat rate — an order of magnitude worse. Any instinct to "start small
   and spread it out" is, on ACMA's published method, the most expensive way to
   run a non-consented campaign.

The **Sportsbet Pty Ltd** notice (23 December 2021) totals $2,508,600 over
15 December 2020 – 29 March 2021, consistent with the same day-by-day method
across a longer window. It is also the one place I found ACMA engaging with
Schedule 2 cl 4(2) in an enforcement instrument rather than in guidance:

> "3.4. Subclause 4(1) of Schedule 2 provides that, for the purposes of the Spam
> Act, the consent of the relevant electronic account-holder may not be inferred
> from the mere fact that the relevant electronic address has been published.
> 3.5. Subclause 4(2) of Schedule 2 to the Spam Act sets out an exception to the
> rule in subclause 4(1) where the electronic address to which the commercial
> electronic message was sent was conspicuously published. **The requirements to
> be satisfied, in order to demonstrate this exception, are set out in that
> subclause.**"

and, on burden:

> "2.5. Sportsbet has not demonstrated it had the consent of the relevant
> account-holders to cause the CEMs to be sent."

**"Has not demonstrated" is the operative standard in practice.** ACMA does not
prove absence of consent; it asks you to demonstrate it, and s 16(5) puts that
burden on you. That is precisely why a hand-collected list with written
provenance is worth more than a scraped one of any size.

*(Minor observation, flagged as mine: the Ticketek notice tells the recipient
that Federal Court penalties are "potentially significantly higher … (see
section 570 of the Telecommunications Act 1997)". Spam Act civil penalties are
set by ss 24–25 of the Spam Act. It reads like a template carry-over; nothing
turns on it, but do not take the cross-reference at face value.)*

---

## 6. What this means for the two paths

**Path A (≈10,614 scraped tradie addresses) — do not do it.** Not primarily
because of ss 20–22, and it is worth being precise about why, because the wrong
reason leads to the wrong workaround:

- ss 20–22 do not independently prohibit it. They attach only if the sends
  contravene s 16 (§1.3). "Just don't call it harvesting software" is therefore
  not the fix, and neither is hand-writing the scraper differently.
- The reason it fails is s 16 plus Schedule 2 cl 4(2)(d) plus s 16(5): consent
  is per-address, one of its conditions can only be verified by reading the
  page the address was on, and **the burden of proving it is yours**. A scraper
  cannot discharge that burden for 10,614 addresses, and neither can you
  afterwards.
- Having harvested makes the failure worse rather than causing it: every
  non-consented send becomes a contravention of both s 16(1) and s 22(1), and
  ACMA has two provisions to serve notices on rather than one.
- The channel evidence in `docs/channel-evidence.md` says the last 560-message
  cold campaign produced zero genuine human clicks. **Path A is a large legal
  exposure attached to a channel already measured at zero.** That is the
  cheapest argument against it and it does not require any of the above.
- And the two directories that supplied part of that list — `serviceseeking` and
  `oneflare` — have themselves been penalised by ACMA for sending marketing SMS
  without consent (§5.3). Whatever the tradies on that list agreed to, it was not
  this.

**Path B (≈100 hand-collected amplifier addresses) — available, with four
conditions.** Sections 20–22 do not engage (§1.4(b)). What remains is ordinary
s 16 / s 17 / s 18 compliance at a volume where each address can actually be
assessed:

1. **Collect by hand, and mean it.** No extension, no bookmarklet, no agent
   asked to "go get the emails". Record for each address: the URL it was read
   from, the date, the role it serves (cl 4(2)(a)), and — explicitly — that the
   page carried no statement of the cl 4(2)(d) kind. That record is the
   evidential burden under s 16(5), written down in advance.
2. **Take addresses only from the organisation's own website**, never from a
   directory. That is what makes cl 4(2)(c) — "reasonable to assume the
   publication occurred with the agreement of" the organisation — assertable.
3. **Keep the list physically separate from `prospects`.** "To any extent,
   directly or indirectly attributable" (§1.1) means one scraped row in the same
   table arguably taints the compilation. A distinct table, or at minimum a
   `source` value that is never mixed into a send query.
4. **Relevance is a real limit, not a formality.** Clause 4(2) only deems
   consent "so long as the messages are relevant to … the work-related business,
   functions or duties" of the role. A message to an accountant about a tool
   their *tradie clients* might use is a step removed from the accountant's own
   work-related functions. It is defensible — the accountant's function includes
   advising those clients — but it is thinner than the equivalent argument for
   messaging a tradie about the tradie's own missed calls. **Write the message so
   that it is about the recipient's practice, not about their clients' phones.**

**Message construction, either path** (§3): identify the authorising person or
organisation by legal name (plus ABN if there is one) with contact details good
for 30 days; a clear and conspicuous unsubscribe statement; a reply-to address
that will receive unsubscribe messages for at least 30 days after each send;
no login, no extra personal information, no fee. Honour opt-outs immediately and
record them permanently, on the same never-reset basis as
`prospects.unsubscribed_at`.

**Two things worth fixing regardless of which path is chosen, because they are
where the enforcement actually is** (§5.4):

- **s 17 is the provision this project is least likely to think about, and it
  produced a $3.96m penalty in April 2026.** It has no consent defence, applies
  to every commercial message including designated ones, and requires the
  *authorising* entity's legal name plus contact details good for 30 days. Check
  what `renderMarketingSms()` and any future email template actually put in the
  message against s 17(1)(a)–(b), not against a summary.
- **A "service" message with a marketing link in it is a commercial electronic
  message.** ACMA has taken five enforcement actions in eighteen months on
  exactly this — Lululemon's order-confirmation emails, Luxottica's password
  resets, CBA's 170 million messages, PointsBet's "non-commercial" emails
  containing betting links. PickupAI already sends welcome SMS, onboarding
  nudges, trial-expiry warnings and lead notifications to tenants. **Any of those
  that promotes an upgrade, or links to a page that does, needs s 17 and s 18
  compliance today**, independently of any outreach decision. That is the
  highest-value item in this document that does not depend on the fork at all.

**A cheaper option that is outside the Act entirely.** Section 5(5): "If a
message is sent by way of a voice call made using a standard telephone service,
the message is not an electronic message for the purposes of this Act."
The 10,614 rows are phone numbers. A human ringing a business number is governed
by the Do Not Call Register Act, and ACMA states the Register "does not apply to
business phone numbers — numbers that are primarily for business use are
ineligible to be registered". **That is not a recommendation** — the DNCR Act,
the Telecommunications (Telemarketing and Research Calls) Industry Standard 2017
and the ACL all have their own requirements and none of them were researched
here. It is recorded because the fork as posed assumed the only two options were
scraping emails or not using the list, and that assumption is not correct.

---

## 7. What I could not verify

- **Any judicial interpretation of ss 20–22, or of "address-harvesting
  software".** `judgments.fedcourt.gov.au` returns HTTP 403 behind a JavaScript
  challenge to every client I tried, including the rendering fetcher. I read no
  Federal Court judgment in the original for this document.
- **What Parliament said address-harvesting software was aimed at.** The
  Explanatory Memorandum to the Spam Bill 2003 is on ParlInfo (`aph.gov.au`),
  outside the sources this research was scoped to. It was not read, so §1.4's
  observation that the 2003 target "was probably commercial spamware products"
  is my inference from the words "or marketed", not a sourced fact.
- **Whether s 4AA(8) fixes the penalty-unit value for civil penalty
  contraventions**, given that it speaks of "offences" and Spam Act
  contraventions are expressly not offences (s 27). No authority found.
- **Whether the evidential burden on ss 21(2) and 22(2) sits with the
  respondent.** The Act allocates one expressly for ss 16(2)–(4) and 20(3) and
  is silent for the rest. No authority found.
- **Whether ACMA has ever obtained a Federal Court penalty under the Spam Act.**
  No such outcome appears on any ACMA register for 2015–2026; the only Federal
  Court entry in ACMA's spam archive is *JER Pty Ltd* (August 2012), which was
  proceedings for **breach of an enforceable undertaking**. `judgments.fedcourt.gov.au`
  refused access, so **that is an absence of evidence, not evidence of absence.**
  (Enforceable undertakings and formal warnings I can speak to — ACMA publishes
  them on the investigations register and they are in the §5.2 table.)
- **Exact pleaded provisions for six matters.** The Tabcorp 2026, Tabcorp 2025,
  CBA 2023 and BetDeluxe notices are either image-only scans or sit behind
  publication pages that render empty (`/node/5919`, `/node/4052`). Their rows in
  §5.2 are marked *(described)* and rest on ACMA's register wording.
- **Whether the eMarketing Code of Practice referenced in `LISTS.md` is still a
  registered industry code**, and whether it says anything about email hours. Not
  checked — it was outside the four questions and `LISTS.md` already treats it as
  advisory.
- **Anything about the Privacy Act 1988.** Scraping 10,614 email addresses is
  a collection of personal information and APP 3, APP 5 and APP 7 are engaged
  independently of the Spam Act. ACMA itself points this out: "In circumstances
  where the Spam Act and Do Not Call Register Act do not apply, entities may need
  to comply with APP 7 of the Privacy Act 1988 to direct market to an
  individual." **This document does not cover the Privacy Act, and the small-
  business exemption in that Act is not something to assume applies.** If Path A
  were ever revisited, that is the second half of the research.

---

## What would change these conclusions

- **An amendment to the Spam Act.** It has been untouched since March 2016; the
  register shows no uncommenced amendments as at 2026-08-09. If that changes,
  every figure and every quotation above needs re-reading, not adjusting.
- **The first judgment on ss 20–22.** There appears to be none. The first one
  will settle whether a bespoke script is "specifically designed" software, which
  is the single largest uncertainty in §1.
- **ACMA narrowing or widening its published position on cl 4(2).** Its current
  guidance (§2.5) is narrower than the statute; if it publishes a document that
  engages with the conspicuous-publication route directly, that changes how much
  a cl 4(2) argument is worth.
- **The penalty unit on 1 July 2029**, the next indexation day.
- **Getting express consent instead.** Every difficulty in this document
  disappears the moment the address arrives through a form the person filled in.
  `docs/channel-evidence.md` records that the only real user in the product's
  history arrived organically. That is also the only acquisition path with no
  Spam Act exposure at all.

---

## Sources

Legislation (primary, Federal Register of Legislation):

- **Spam Act 2003 (Cth)**, Compilation No. 10, compilation date 10 March 2016,
  registered 9 June 2016 — Authorised Version **C2016C00614**. Series page:
  `https://www.legislation.gov.au/C2004A01214/latest`. Authorised PDF read at
  `https://www.legislation.gov.au/C2004A01214/latest/2016-03-10/text/original/pdf`
- **Spam Regulations 2021 (Cth)**, F2021L00285, made 18 March 2021, registered
  22 March 2021, commenced 1 April 2021, as made (only version) —
  `https://www.legislation.gov.au/F2021L00285/asmade/2021-03-22/text/original/pdf`
- **Crimes Act 1914 (Cth)** s 4AA, Compilation No. 166, compilation date
  4 June 2026, registered 10 June 2026 — Authorised Version **C2026C00219**,
  volume 1 —
  `https://www.legislation.gov.au/C1914A00012/latest/2026-06-04/text/original/pdf/1`
- **Crimes (Amount of a Penalty Unit) Instrument 2026**, F2026N00424, made
  15 June 2026, registered 16 June 2026, commenced 1 July 2026 —
  `https://www.legislation.gov.au/F2026N00424/asmade/2026-06-16/text/original/pdf`

ACMA (primary for ACMA's own position; flagged in text where it goes beyond the
statute):

- **Avoid sending spam**, last updated 29 November 2024 —
  `https://www.acma.gov.au/avoid-sending-spam`
- **Statement of Expectations — Use of consent in telemarketing and
  e-marketing**, published under *Consumer consent: expectations for businesses
  conducting telemarketing and e-marketing* (July 2024; page last updated
  17 February 2026) —
  `https://www.acma.gov.au/publications/2024-07/guide/consumer-consent-expectations-businesses-conducting-telemarketing-and-e-marketing`
- **Dealing with spam** (the consumer-facing page; the only ACMA page that states
  the conspicuous-publication route in plain language) —
  `https://www.acma.gov.au/dealing-with-spam`
- **Telemarketing and e-marketing — common issues and mistakes** (the "automated
  gathering of addresses", "SMS unsubscribe and alpha tags" and "outsourced
  marketing" passages) —
  `https://www.acma.gov.au/telemarketing-and-e-marketing-common-issues-and-mistakes`
- **Infringement notices** (the consolidated register, read 2026-08-09; entries
  from October 2019 to May 2026) — `https://www.acma.gov.au/infringement-notices`
- **Investigations into spam and telemarketing** (the register that also lists
  enforceable undertakings and formal warnings, 2017 – July 2026) —
  `https://www.acma.gov.au/investigations-spam-and-telemarketing`
- **Investigations into spam 2010–2016** (archive register) —
  `https://www.acma.gov.au/investigations-spam-2010-2016`
- **Infringement Notice — Latitude Finance Australia**, April 2026, published
  redacted (the s 17(1)-only notice; $3,960,000) —
  `https://www.acma.gov.au/sites/default/files/2026-04/Latitude%20-%20Spam%20Infringement%20Notice%20-Redacted.pdf`
- **Infringement Notice — Ticketek Pty Ltd**, dated 7 September 2023, published
  redacted —
  `https://www.acma.gov.au/sites/default/files/2023-10/Ticketek%20-%20spam%20investigation%20-%20Infringement%20notice%20-%20For%20Publication_Redacted.pdf`
- **Infringement Notice — Sportsbet Pty Ltd**, dated 23 December 2021, published
  redacted —
  `https://www.acma.gov.au/sites/default/files/2022-03/Sportsbet%20Pty%20Ltd%20-%20Spam%20Act%20investigation%20-%20Infringement%20Notice%2023122021_Redacted.pdf`
  (page 5, which carries the penalty table, is a scanned image and could not be
  read as text; the total is taken from the body of the notice)

Refused, or unreadable:

- `judgments.fedcourt.gov.au` — HTTP 403, JavaScript challenge. No Federal Court
  judgment was read.
- `acma.gov.au/search` — returns an empty JavaScript shell to a plain client; the
  registers were crawled directly instead.
- `acma.gov.au/news-speeches-and-publications` with a topic filter — HTTP 403.
- `acma.gov.au/node/5919` (Tabcorp July 2026 spam documents), `/node/4052`
  (BetDeluxe February 2023) and `/node/4502` (Outdoor Supacentre notice) return
  HTTP 200 with an empty body.
- The Commonwealth Bank (June 2023), Tabcorp (June 2025) and Sportsbet page-5
  penalty-table PDFs are image-only scans with no extractable text.
