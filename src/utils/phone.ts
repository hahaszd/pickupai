/**
 * Values that turn up in a phone field and cannot be rung.
 *
 * Twilio documents only the alpha forms: since 2023-05-17 a withheld caller ID
 * arrives as the string `anonymous`, and it persists whatever alpha string the
 * carrier sent (`ANONYMOUS`, `RESTRICTED`).
 * https://www.twilio.com/en-us/changelog/changes-to-withheld-caller-id-behavior
 *
 * The NUMERIC forms below are what carriers hand over and Twilio does not
 * document them anywhere, so they are listed by the word each one spells on a
 * phone keypad rather than as magic numbers — otherwise the next person reads
 * them as a typo and deletes them. Only `266696687` was caught before; a
 * withheld caller arriving as `+7378742833` was printed to the owner as a
 * number to ring back.
 *
 * Matching is on the EXACT digit string, so a real number that merely contains
 * one of these runs (+61266696687) is unaffected.
 */
const PLACEHOLDER_DIGITS = new Set([
  "266696687",  // ANONYMOUS
  "7378742833", // RESTRICTED
  "8656696",    // UNKNOWN
  "862825",     // UNAVAIL
  "7748433"     // PRIVATE
]);
const PLACEHOLDER_WORDS = new Set([
  "anonymous", "restricted", "unavailable", "unknown", "private", "withheld", "blocked",
  // Multi-word and abbreviated carrier strings, letters-only after stripping.
  // Kept even though the no-digits rule above already catches them: a value
  // like "Caller ID 2 withheld" has a digit and still is not a number.
  "unavail", "nocallerid", "outofarea", "unknowncaller", "blockedcall", "callerunknown"
]);

/**
 * True for anything the owner could not ring back. Deliberately narrow: it only
 * rejects the exact known placeholders, because a false positive here silently
 * drops a real customer's number, which is the worse of the two failures.
 */
export function isUnreachableNumber(value?: string | null): boolean {
  const raw = (value ?? "").trim();
  if (!raw) return false;

  // The general rule, which the word list was a poor proxy for: a value with no
  // digits in it is not a number and can never be rung. Matching an exact
  // concatenated word missed every multi-word and abbreviated carrier string —
  // "Unknown Caller", "No Caller ID", "Out of Area", "Blocked Call", and
  // "UNAVAIL", which is doubly damning because the DIGIT list already carries
  // 862825 precisely because it spells UNAVAIL.
  //
  // Every one of those was printed to the owner as a callback number, and
  // buildSystemPrompt read it out: "The caller's number on file is Unknown
  // Caller — use this only if they confirm it as their best contact number."
  if (!/\d/.test(raw)) return true;

  const letters = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (letters && PLACEHOLDER_WORDS.has(letters)) return true;
  return PLACEHOLDER_DIGITS.has(raw.replace(/\D/g, ""));
}

/** Format an E.164 Australian number (+61...) into local readable style. */
export function formatAuPhone(e164: string): string {
  if (!e164.startsWith("+61")) return e164;
  const local = "0" + e164.slice(3);
  if (/^04\d{8}$/.test(local)) {
    return local.replace(/^(04\d{2})(\d{3})(\d{3})$/, "$1 $2 $3");
  }
  return local.replace(/^(0\d)(\d{4})(\d{4})$/, "$1 $2 $3");
}

/**
 * Normalise any reasonable AU phone input to E.164 (+61…).
 * Handles: +61420955412, 61420955412, 0420955412, 420955412
 */
export function toE164Au(phone: string): string {
  const stripped = phone.replace(/[\s\-()]+/g, "");
  if (stripped.startsWith("+61") && stripped.length === 12) return stripped;
  if (stripped.startsWith("61") && stripped.length === 11) return "+" + stripped;
  if (stripped.startsWith("0") && stripped.length === 10) return "+61" + stripped.slice(1);
  if (/^[2-9]\d{8}$/.test(stripped)) return "+61" + stripped;
  if (stripped.startsWith("+")) return stripped;
  return stripped;
}

/**
 * Validate that a string looks like a plausible AU phone number.
 * Accepts: +61412345678, 61412345678, 0412345678, 412345678 (with optional spaces/dashes).
 */
export function isValidAuPhone(phone: string): boolean {
  const stripped = phone.replace(/[\s\-()]+/g, "");
  return /^(\+?61[2-9]\d{8}|0[2-9]\d{8}|[2-9]\d{8})$/.test(stripped);
}

/** True for Australian mobile (04) numbers only, after E.164 normalisation (required for A2P SMS; landlines cannot receive). */
export function isAuMobile(raw: string): boolean {
  if (!raw || !String(raw).trim()) return false;
  return /^\+614\d{8}$/.test(toE164Au(raw));
}

/**
 * The one rule for a tenant's own phone number: it must be able to receive an
 * SMS, because the owner SMS *is* the product — a lead the tradie never gets is
 * a lead that did not happen.
 *
 * Split from `isValidAuPhone` deliberately. That predicate accepts `0[2-9]…`,
 * which includes every geographic landline, and it was what guarded signup: on
 * 2026-09-01 a carpenter signed up with an Adelaide landline, the form told him
 * "✓ Valid Australian number", and the welcome SMS, the demo, the forwarding
 * activation code and nine lead notifications were all sent somewhere that
 * cannot receive them. Nothing failed loudly; the account simply did nothing.
 *
 * The two rejections are distinguished on purpose. A caller who typed a
 * landline has not made a typo, so "invalid number" reads as nonsense and they
 * retype the same thing — they need to be told what SMS requires and why.
 */
export type OwnerPhoneCheck =
  | { ok: true; e164: string }
  | { ok: false; reason: "not_a_number" | "not_mobile"; message: string };

export const OWNER_PHONE_NOT_A_NUMBER =
  "Please enter a valid Australian mobile number (e.g. 0412 345 678 or +61412345678).";
export const OWNER_PHONE_NOT_MOBILE =
  "That looks like a landline. PickupAI texts every job straight to you, so it has to be an Australian mobile — one starting 04.";

export function validateOwnerPhone(raw?: string | null): OwnerPhoneCheck {
  const value = (raw ?? "").trim();
  if (!value || !isValidAuPhone(value)) {
    return { ok: false, reason: "not_a_number", message: OWNER_PHONE_NOT_A_NUMBER };
  }
  if (!isAuMobile(value)) {
    return { ok: false, reason: "not_mobile", message: OWNER_PHONE_NOT_MOBILE };
  }
  return { ok: true, e164: toE164Au(value) };
}
