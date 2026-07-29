/**
 * Demo fixtures are written with Sydney suburbs — Parramatta, Chatswood,
 * Penrith. A Melbourne tenant whose personalised demo says "52 Smith Street,
 * Parramatta NSW 2150" reads it as "this was not built for me", and that is
 * exactly what the one real organic signup was shown. Rewrite the suburb to
 * whatever the tenant told us their service area is; leave the fixtures alone
 * when they have not told us anything — better a Sydney address than none.
 *
 * This lives in its own module for one reason: server.ts calls main() on
 * import, so anything declared inside it is unreachable from a test. The test
 * that covered this had a COPY of the function and asserted against the copy,
 * which meant server.ts's version could change freely and stay green. Extracted
 * 2026-07-29 so the test and production run the same code.
 */
export const DEMO_FIXTURE_SUBURBS = /\b(Parramatta|Chatswood|Penrith)(,?\s*(NSW\s*)?\d{4})?\b/g;

export function localiseDemo(text: string, serviceArea?: string | null): string {
  // service_area is a free-text box and tenants list several suburbs in it.
  const area = (serviceArea ?? "").split(/[,\n;]/)[0].trim();
  if (!area) return text;
  // The regex is /g and String.replace advances lastIndex on a global regex,
  // so reset it — a shared module-level regex would otherwise skip matches on
  // every second call.
  DEMO_FIXTURE_SUBURBS.lastIndex = 0;
  return text.replace(DEMO_FIXTURE_SUBURBS, area);
}
