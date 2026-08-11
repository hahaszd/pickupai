import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  renderOutreachEmail,
  parseTemplate,
  tradePlural,
  type OutreachRecipient,
} from "../src/outreach/render-outreach-email.js";

// The real approved templates, not fixtures — if the copy and the renderer's
// fallback rules drift apart, these tests are where it surfaces.
const OPENER = readFileSync("scripts/email-variants/1-opener.txt", "utf8");
const BUMP = readFileSync("scripts/email-variants/2-bump.txt", "utf8");
const PAIN = readFileSync("scripts/email-variants/3-pain.txt", "utf8");
const CLOSER = readFileSync("scripts/email-variants/4-closer.txt", "utf8");

const SOLE: OutreachRecipient = {
  prospect_id: "p1",
  displayName: "Kema Electrical and Data",
  firstName: "Adam",
  trade: "electrician",
  area: "the Central Coast",
  size: "sole_trader",
};

const NAMELESS_UNCLEAR: OutreachRecipient = {
  prospect_id: "p2",
  displayName: "Ansteys Electrical & Solar",
  firstName: null,
  trade: "electrician",
  area: "Tweed Heads",
  size: "unclear",
};

const HANDYMAN: OutreachRecipient = {
  prospect_id: "p3",
  displayName: "Prime Handyman Solutions",
  firstName: "Justin",
  trade: "handyman",
  area: "North Balgowlah",
  size: "sole_trader",
};

describe("parseTemplate", () => {
  it("splits subject and strips annotation lines", () => {
    const t = parseTemplate(BUMP);
    expect(t.subject).toBe("Re: who answers your phone when you're on the tools?");
    expect(t.body.startsWith("Tried your phone")).toBe(true);
    expect(t.body).not.toContain("same thread");
  });

  it("refuses a template with no subject line", () => {
    expect(() => parseTemplate("just a body")).toThrow(/Subject/);
  });
});

describe("renderOutreachEmail — the approved copy renders correctly", () => {
  it("full personalisation: named sole trader", () => {
    const { subject, body } = renderOutreachEmail(OPENER, SOLE, "Simon");
    expect(subject).toBe("who answers your phone when you're on the tools?");
    expect(body).toContain("G'day Adam,");
    expect(body).toContain(
      "Came across Kema Electrical and Data while looking at electricians around the Central Coast — looks like it's you doing the work."
    );
    expect(body).toContain("the next electrician on Google");
    expect(body).toContain("Worth a listen?");
    expect(body.trim().endsWith("Simon\nSydney")).toBe(true);
  });

  it("no name + unclear size: greeting collapses, size clause disappears", () => {
    const { body } = renderOutreachEmail(OPENER, NAMELESS_UNCLEAR, "Simon");
    expect(body).toContain("G'day,");
    expect(body).not.toContain("G'day ,");
    // The clause AND its dash are gone; the sentence still ends cleanly.
    expect(body).toContain(
      "Came across Ansteys Electrical & Solar while looking at electricians around Tweed Heads."
    );
    expect(body).not.toContain("—  ");
    expect(body).not.toContain("looks like");
  });

  it("handyman pluralises to handymen, never handymans", () => {
    const { body } = renderOutreachEmail(OPENER, HANDYMAN, "Simon");
    expect(body).toContain("looking at handymen around North Balgowlah");
    expect(body).not.toContain("handymans");
    expect(body).toContain("the next handyman on Google");
  });

  it("pain variant maps the on-the-job scene from the verified trade", () => {
    const plumber: OutreachRecipient = { ...SOLE, trade: "plumber", displayName: "Highlander Plumbing", firstName: "Kevin", area: "Gladesville", size: "small_team" };
    const { body } = renderOutreachEmail(PAIN, plumber, "Simon");
    expect(body).toContain("You're under a house and the phone goes.");
    expect(body).toContain("NSW plumbers");
  });

  it("closer with no first name still reads as a sentence", () => {
    const { body } = renderOutreachEmail(CLOSER, NAMELESS_UNCLEAR, "Simon");
    expect(body).toContain("Last one from me.");
    expect(body).not.toContain("me, .");
    expect(body).toContain("Ansteys Electrical & Solar");
  });

  it("small team gets the crew line, not the solo line", () => {
    const team: OutreachRecipient = { ...SOLE, size: "small_team" };
    const { body } = renderOutreachEmail(OPENER, team, "Simon");
    expect(body).toContain("looks like a tight crew");
    expect(body).not.toContain("you doing the work");
  });

  // The guard is the last line of defence: a token this renderer does not know
  // must throw, never pass through into a sent email.
  it("throws on any unreplaced token instead of sending it", () => {
    expect(() => renderOutreachEmail("Subject: x\n\nhello {mystery}", SOLE, "Simon")).toThrow(/mystery/);
  });

  it("every approved template renders clean for every field combination", () => {
    const recipients: OutreachRecipient[] = [SOLE, NAMELESS_UNCLEAR, HANDYMAN];
    for (const tpl of [OPENER, BUMP, PAIN, CLOSER]) {
      for (const r of recipients) {
        const { subject, body } = renderOutreachEmail(tpl, r, "Simon");
        expect(subject).not.toMatch(/\{|\}/);
        expect(body).not.toMatch(/\{|\}/);
        // No double spaces or dangling punctuation from clause removal.
        expect(body).not.toMatch(/ {2}|\s,|\s\./);
      }
    }
  });
});

describe("tradePlural", () => {
  it("covers the irregular and the regular", () => {
    expect(tradePlural("handyman")).toBe("handymen");
    expect(tradePlural("electrician")).toBe("electricians");
    expect(tradePlural("roofer")).toBe("roofers");
  });
});
