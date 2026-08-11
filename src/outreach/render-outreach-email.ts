/**
 * Renders an approved email template against one recipient's page-verified
 * merge fields. Pure, so the failure modes live under tests instead of in a
 * stranger's inbox — a rendered "G'day ," or a literal "{size_line}" in a real
 * cold email cannot be recalled.
 *
 * Templates are the owner-approved files in `scripts/email-variants/`. This
 * module deliberately does not add template syntax: the fallback rules
 * (no first name → collapse the greeting; unclear size → drop the clause) are
 * code, matched to the approved copy, and each has a test asserting the exact
 * output string.
 *
 * Merge-field provenance is the rule that matters most: every field must come
 * from the page-read verdicts / consent register, never from the `prospects`
 * table — 57% of read rows had at least one wrong field (BACKLOG, 2026-08-10),
 * and a wrong personal claim is worse than no personalisation.
 */

export type OutreachRecipient = {
  prospect_id: string;
  /** The business as ITS OWN PAGE names it — not as the prospects row does. */
  displayName: string;
  /** Only when confidently identified on the page. Absent → greeting collapses. */
  firstName?: string | null;
  /** The trade the page shows, singular ("electrician"), not prospects.trade_type. */
  trade: string;
  /** The area as stated on their site ("the Central Coast", "Prestons"). */
  area: string;
  size: "sole_trader" | "small_team" | "unclear";
};

const SIZE_LINE: Record<OutreachRecipient["size"], string | null> = {
  sole_trader: "looks like it's you doing the work",
  small_team: "looks like a tight crew",
  unclear: null,
};

/** Irregular plurals first; everything else takes an s. */
const TRADE_PLURAL: Record<string, string> = {
  handyman: "handymen",
};

const ON_THE_JOB: Record<string, string> = {
  electrician: "elbow-deep in a switchboard",
  plumber: "under a house",
  roofer: "two storeys up",
  handyman: "mid-job",
};

export function tradePlural(trade: string): string {
  return TRADE_PLURAL[trade] ?? `${trade}s`;
}

/**
 * Split a variant file into subject and body. Line 1 must be `Subject: …`;
 * a following parenthesised annotation line (operator notes in the approved
 * files) is stripped; the rest is the body.
 */
export function parseTemplate(raw: string): { subject: string; body: string } {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const first = lines.shift() ?? "";
  const m = first.match(/^Subject:\s*(.+)$/);
  if (!m) throw new Error(`template must start with "Subject: …", got: ${first.slice(0, 60)}`);
  while (lines.length && (lines[0].trim() === "" || /^\(.*\)$/.test(lines[0].trim()))) lines.shift();
  return { subject: m[1].trim(), body: lines.join("\n").trim() };
}

export function renderOutreachEmail(
  templateRaw: string,
  r: OutreachRecipient,
  signatureName: string
): { subject: string; body: string } {
  const { subject, body } = parseTemplate(templateRaw);

  const apply = (text: string): string => {
    let out = text;

    // First name: replace when known; otherwise collapse the whole clause so
    // "G'day {firstName}," → "G'day," and "Last one from me, {firstName}." →
    // "Last one from me." — order matters: the comma-led form goes first.
    if (r.firstName?.trim()) {
      out = out.replaceAll("{firstName}", r.firstName.trim());
    } else {
      out = out.replaceAll(", {firstName}", "").replaceAll(" {firstName}", "");
    }

    // Size clause: " — {size_line}" is dropped entirely when the page did not
    // support a size call. A guessed size is the backfire case.
    const size = SIZE_LINE[r.size];
    out = size
      ? out.replaceAll("{size_line}", size)
      : out.replaceAll(" — {size_line}", "").replaceAll("{size_line}", "");

    // Plural before singular, or "{trade}s" renders as "handymans".
    out = out.replaceAll("{trade}s", tradePlural(r.trade)).replaceAll("{trade}", r.trade);

    out = out
      .replaceAll("{onTheJob}", ON_THE_JOB[r.trade] ?? "mid-job")
      .replaceAll("{area}", r.area)
      .replaceAll("{businessName}", r.displayName)
      .replaceAll("{yourName}", signatureName);

    // A leftover token means the template and this renderer disagree. Refuse —
    // a literal "{anything}" in a sent email is the one unrecoverable outcome.
    const leftover = out.match(/\{[a-zA-Z_]+\}/);
    if (leftover) throw new Error(`unreplaced merge token ${leftover[0]} for ${r.prospect_id}`);
    return out;
  };

  return { subject: apply(subject), body: apply(body) };
}
