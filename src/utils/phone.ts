/** Format an E.164 Australian number (+61...) into local readable style. */
export function formatAuPhone(e164: string): string {
  if (!e164.startsWith("+61")) return e164;
  const local = "0" + e164.slice(3);
  if (/^04\d{8}$/.test(local)) {
    return local.replace(/^(04\d{2})(\d{3})(\d{3})$/, "$1 $2 $3");
  }
  return local.replace(/^(0\d)(\d{4})(\d{4})$/, "$1 $2 $3");
}
