/**
 * Keep outbound SMS inside the GSM-7 alphabet.
 *
 * A single character outside GSM-7 forces the whole message to UCS-2, where a
 * concatenated segment holds **67 characters instead of 153**. Measured on a
 * real owner notification: 285 ASCII characters cost 2 segments; the same
 * message containing one em dash cost **5** — A$0.103 against A$0.258.
 *
 * The risk is not theoretical. `issue_summary` and `next_action` are written by
 * a language model, and models reach for em dashes and curly quotes constantly.
 * Substituting them costs nothing a reader would notice and is the largest
 * single lever on SMS spend.
 */

/** Characters GSM-7 encodes directly. */
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/** Encodable, but each costs two characters of the budget. */
const GSM7_EXTENDED = "^{}\\[~]|€";

const SUBSTITUTIONS: Record<string, string> = {
  // Dashes — the most common offender by far.
  "\u2014": "-", "\u2013": "-", "\u2012": "-", "\u2015": "-", "\u2212": "-",
  // Quotes and apostrophes.
  "\u2018": "'", "\u2019": "'", "\u201A": "'", "\u201B": "'",
  "\u201C": '"', "\u201D": '"', "\u201E": '"', "\u201F": '"',
  "\u00AB": '"', "\u00BB": '"', "\u2032": "'", "\u2033": '"',
  // Spaces that look ordinary and are not. Escaped rather than written
  // literally: several are indistinguishable in an editor and silently
  // collapse into a duplicate key.
  "\u00A0": " ", "\u2009": " ", "\u200A": " ", "\u2002": " ",
  "\u2003": " ", "\u202F": " ", "\u3000": " ",
  // Invisible characters that cost budget and render as nothing.
  "\u200B": "", "\u200C": "", "\u200D": "", "\uFEFF": "",
  // Punctuation a model reaches for.
  "\u2026": "...", "\u2022": "-", "\u00B7": "-", "\u2043": "-",
  "\u00BD": "1/2", "\u00BC": "1/4", "\u00BE": "3/4",
  "\u2103": "C", "\u00B0": " deg", "\u2122": "(TM)", "\u00AE": "(R)", "\u00A9": "(C)",
  "\u2192": "->", "\u2190": "<-", "\u2264": "<=", "\u2265": ">=", "\u00D7": "x"
};

export function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (!GSM7_BASIC.includes(ch) && !GSM7_EXTENDED.includes(ch)) return false;
  }
  return true;
}

/**
 * Replace characters that would force UCS-2 with GSM-7 equivalents.
 *
 * Anything with no sensible substitute is dropped rather than left in: one
 * stray glyph costing 56% of the message's capacity is a worse outcome than
 * losing the glyph. Accented Latin characters in the GSM-7 set are kept.
 */
export function toGsm7(text: string): string {
  let out = "";
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch) || GSM7_EXTENDED.includes(ch)) {
      out += ch;
      continue;
    }
    const sub = SUBSTITUTIONS[ch];
    if (sub !== undefined) {
      out += sub;
      continue;
    }
    // Strip diacritics GSM-7 cannot carry (é is fine, ć is not) before giving up.
    const stripped = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    out += [...stripped].every((c) => GSM7_BASIC.includes(c)) ? stripped : "";
  }
  return out;
}

export type SmsCost = { encoding: "GSM-7" | "UCS-2"; characters: number; segments: number };

/** What a message will actually cost to send. */
export function smsCost(text: string): SmsCost {
  const gsm = isGsm7(text);
  const characters = gsm
    ? [...text].reduce((n, c) => n + (GSM7_EXTENDED.includes(c) ? 2 : 1), 0)
    : [...text].length;
  const [single, concatenated] = gsm ? [160, 153] : [70, 67];
  return {
    encoding: gsm ? "GSM-7" : "UCS-2",
    characters,
    segments: characters === 0 ? 0 : characters <= single ? 1 : Math.ceil(characters / concatenated)
  };
}
