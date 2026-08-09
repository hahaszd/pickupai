# Stage 2 — read ONE page and answer two questions

You are one of many readers. You get one page. Do not reason about the business,
the trade, the industry, or anything not written on the page in front of you.

Read the file you were given. Its first two lines are `SOURCE-URL:` and
`FETCHED-AT:`; everything after them is the page text as fetched.

## Question 1 — does this page refuse unsolicited commercial email?

The test is **Spam Act 2003 (Cth) Schedule 2 cl 4(2)(d)**: is the publication
accompanied by

> "a statement to the effect that the relevant electronic account-holder does
> not want to receive unsolicited commercial electronic messages at that
> electronic address; or a statement to similar effect"

**"Or a statement to similar effect" is deliberately broad.** Things that count:

- "No unsolicited approaches", "no cold calling", "no marketing enquiries"
- "This address is for customer enquiries only"
- "Marketing emails will be deleted / are not welcome"
- "We do not accept unsolicited offers of services, SEO or web design"
- A clause in a privacy policy or terms page saying they do not wish to receive
  marketing communications **at this address**

**Things that do NOT count, and this is where the mistake gets made:**

- A general privacy policy about how they handle **their customers'** data —
  collection, storage, disclosure, access rights. That is the ordinary content
  of every privacy policy and it is not a refusal.
- A promise about **their own** sending — "we will never spam you", "we do not
  sell your data", "you can unsubscribe from our newsletter". That is about
  messages they send, not messages they receive.
- A copyright notice, a terms-of-use restriction on scraping the website, or a
  robots/automated-access clause. Relevant to other questions, not this one.
- Anything about phone calls or the Do Not Call Register.

If it is genuinely borderline, say so in `why` and answer **true** — a false
positive costs one address, a false negative costs a contravention.

## Question 2 — whose address is each one?

**You will be handed a list of candidate addresses, extracted from this page by
a script. Classify only those. Do not add to the list.** If an address you
expected is missing from it, say so in `why` — do not supply it yourself.

This is not a formality. On 2026-08-10 a reader returned
`hello@sunnydayselectrical.com.au` and `info@sunnydayselectrical.com.au` with
the justification "domain matches SOURCE-URL; appears in privacy policy contact
section", for a file containing **no email address at all**. The same reader was
perfect on question 1 in the same run. Every returned address is now checked
against the page by literal match, and an address that is not there is dropped.

For each candidate you were given, decide whether it is **this business's own
contact address** or somebody else's. Addresses that are NOT theirs:

- The web developer or design agency who built the site
- A marketing/SEO agency
- An address embedded in a font or library licence comment (these appear in
  page text; they are not contact details)
- `donotreply@`, `noreply@`, `postmaster@`, `abuse@`
- A supplier, franchisor, or a different company entirely
- A generic platform address (`support@wix.com`, `help@squarespace.com`)

Compare the address's domain against the `SOURCE-URL:` domain. A match is strong
evidence it is theirs; a mismatch is not proof it is not (many small businesses
use gmail/bigpond/optusnet), so judge it on the surrounding words too.

## Question 3 — is this row even a real target?

**Do not trust the business name, trade, suburb or state we hand you.** That
data was scraped in April 2026 without quality control and has aged. An audit
found suppliers filed as tradies (`AGM Roofing Supplies` as `roofer`), a trade
union filed as an electrician, a painter filed as a roofer, booleans in the
website column, and duplicate rows. **Judge from the page, and say so when the
page contradicts what we gave you.**

Four things, each answerable from the page in front of you:

- **`trading`** — does this read as a business that is currently operating? A
  parked domain, a "site coming soon" placeholder, an expired-listing page, a
  "we have closed" notice, or a template with lorem-ipsum text and no real
  contact details is **not**.
- **`does_the_work`** — do they perform the trade themselves, or do they sell to
  people who do? A **supplier, wholesaler, trade counter, manufacturer, industry
  association, union, training college, or a directory** is not a target. A
  franchise's national head office is not a target; an individual franchisee who
  attends jobs is.
- **`actual_trade`** — what trade do they actually do, in your own words from the
  page (`plumber`, `electrician`, `roofer`, `painter`, `landscaper`, `mixed
  trades`, …). If it disagrees with the `trade_type` we gave you, say so.
- **`size_signal`** — the smallest business that fits the page: `sole_trader`,
  `small_team` (roughly 2–10, "our team", a few named staff), `larger_firm`
  (an office, a receptionist, a careers page, many branches, corporate/commercial
  clients), or `unclear`. This is a signal, not a verdict — give your reason.

Answer from evidence on the page, not from the business name. If the page does
not support a call, say `unclear` rather than guessing.

## Output

Return **JSON only** — no prose before or after, no code fence:

```
{
  "prospect_id": "<given to you>",
  "page_file": "<given to you>",
  "page_url": "<the SOURCE-URL line>",
  "refuses_marketing": true | false,
  "quote": "<the sentence, copied character for character, or null>",
  "why": "<one sentence>",
  "addresses": [
    {"email": "...", "belongs_to_business": true | false, "why": "<short>"}
  ],
  "trading": true | false | "unclear",
  "does_the_work": true | false | "unclear",
  "actual_trade": "<what they actually do, from the page>",
  "trade_matches_our_record": true | false,
  "size_signal": "sole_trader" | "small_team" | "larger_firm" | "unclear",
  "target_verdict": "target" | "not_a_target" | "unclear",
  "target_why": "<one sentence, citing what on the page decided it>"
}
```

**The quote is checked afterwards by literal string match against this exact
file.** Copy it, do not retype it, do not tidy it, do not translate it, do not
join two sentences with an ellipsis. If there is no such statement, return
`false` and `null` — that is a complete, correct and expected answer. A
fabricated quote invalidates the entire run, not just your page.

**Every address in `addresses` is checked the same way.** Return only addresses
from the candidate list you were given. An empty `addresses` array is a normal
answer for a page with no contact details on it.
