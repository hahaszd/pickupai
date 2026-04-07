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
