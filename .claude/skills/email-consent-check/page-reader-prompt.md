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

For every email address on the page, decide whether it is **this business's own
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
  ]
}
```

**The quote is checked afterwards by literal string match against this exact
file.** Copy it, do not retype it, do not tidy it, do not translate it, do not
join two sentences with an ellipsis. If there is no such statement, return
`false` and `null` — that is a complete, correct and expected answer. A
fabricated quote invalidates the entire run, not just your page.
