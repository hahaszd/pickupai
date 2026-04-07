/** Format an E.164 Australian number (+61...) into local readable style. */
export function formatAuPhone(e164: string): string {
  if (!e164.startsWith("+61")) return e164;
  const local = "0" + e164.slice(3);
  if (/^04\d{8}$/.test(local)) {
    return local.replace(/^(04\d{2})(\d{3})(\d{3})$/, "$1 $2 $3");
  }
  return local.replace(/^(0\d)(\d{4})(\d{4})$/, "$1 $2 $3");
}

/** Convert a local AU number (0420...) to E.164 (+61420...). Already E.164 numbers pass through unchanged. */
export function toE164Au(phone: string): string {
  const digits = phone.replace(/[\s\-()]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+61" + digits.slice(1);
  return "+" + digits;
}
