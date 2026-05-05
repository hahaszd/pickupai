#!/usr/bin/env node
/**
 * Source B smoke probe — fetches one metro per directory site per trade and
 * reports rows_found, with_mobile, with_website. Use this BEFORE any large
 * scrape to confirm parsers still match the live page structure (a single
 * site redesign would otherwise silently produce zero-row CSVs across the
 * whole national sweep).
 *
 * Usage:
 *   node scripts/smoke-source-b.mjs                       # all sources, all trades
 *   node scripts/smoke-source-b.mjs --trade plumber       # single trade
 *   node scripts/smoke-source-b.mjs --source hipages      # single source
 *   node scripts/smoke-source-b.mjs --metro vic/melbourne # override probe metro
 */

const TRADES = [
  { label: "plumber",     hipages: "plumbers",     oneflare: "plumber",     ss: "plumbers" },
  { label: "electrician", hipages: "electricians", oneflare: "electrician", ss: "electricians" },
  { label: "roofer",      hipages: "roofing",      oneflare: "roofing",     ss: "roofers" },
  { label: "handyman",    hipages: "handyman",     oneflare: "handyman",    ss: "handyman" },
];

const DEFAULT_PROBES = {
  hipages:        "nsw/sydney",
  oneflare:       "nsw/sydney",
  serviceseeking: "nsw/sydney",
};

const argIdx = (flag) => process.argv.indexOf(flag);
const strArg = (flag, dflt) => argIdx(flag) > -1 ? (process.argv[argIdx(flag) + 1] ?? dflt) : dflt;
const TRADE_FILTER  = strArg("--trade", null);
const SOURCE_FILTER = strArg("--source", null);
const METRO_OVERRIDE = strArg("--metro", null);

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "en-AU,en;q=0.9",
};

function toE164Au(raw) {
  if (!raw) return "";
  const s = String(raw).replace(/[\s\-()]+/g, "");
  if (!s) return "";
  if (s.startsWith("+61") && s.length === 12) return s;
  if (s.startsWith("61")  && s.length === 11) return "+" + s;
  if (s.startsWith("0")   && s.length === 10) return "+61" + s.slice(1);
  if (/^[2-9]\d{8}$/.test(s)) return "+61" + s;
  if (s.startsWith("+")) return s;
  return s;
}
const isAuMobile = (e164) => /^\+614\d{8}$/.test(e164);

async function fetchHtml(url) {
  const resp = await fetch(url, { headers: HEADERS });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

// Recursively walk an object/array and collect all leaf objects matching a
// predicate. Used for spelunking through __NEXT_DATA__ shapes that move
// between Next versions.
function findAll(node, pred, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) findAll(item, pred, out);
    return out;
  }
  if (pred(node)) out.push(node);
  for (const k of Object.keys(node)) findAll(node[k], pred, out);
  return out;
}

// ── Per-source probes ───────────────────────────────────────────────────────
async function probeOneflare(trade, metro) {
  const url = `https://www.oneflare.com.au/${trade.oneflare}/${metro}`;
  const html = await fetchHtml(url);
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { rows_found: 0, with_mobile: 0, with_website: 0, note: "no __NEXT_DATA__" };
  const data = JSON.parse(m[1]);
  const businesses = findAll(data, n =>
    typeof n.name === "string" &&
    (typeof n.phone === "string" || typeof n.mobile === "string" || typeof n.telephone === "string")
  );
  // Dedupe by name
  const seen = new Set();
  let withMobile = 0, withWebsite = 0;
  for (const b of businesses) {
    if (seen.has(b.name)) continue;
    seen.add(b.name);
    const phone = toE164Au(b.phone || b.mobile || b.telephone || "");
    if (phone && isAuMobile(phone)) withMobile++;
    if (b.website || b.url) withWebsite++;
  }
  return { rows_found: seen.size, with_mobile: withMobile, with_website: withWebsite };
}

async function probeHipages(trade, metro) {
  const url = `https://hipages.com.au/find/${trade.hipages}/${metro}`;
  const html = await fetchHtml(url);
  const slugs = [...new Set([...html.matchAll(/href="\/connect\/([^"?#]+)"/g)].map(m => m[1]))];
  if (slugs.length === 0) return { rows_found: 0, with_mobile: 0, with_website: 0, note: "no /connect/ links" };

  // Probe up to 3 profile pages to estimate yield. Mobile is in plain text
  // on Hipages profile pages (no `tel:` links), so use the same regex as
  // the real scraper rather than `href="tel:"`.
  const probeSlugs = slugs.slice(0, 3);
  let withMobile = 0, withWebsite = 0;
  for (const slug of probeSlugs) {
    try {
      const phtml = await fetchHtml(`https://hipages.com.au/connect/${slug}`);
      const mobileMatches = phtml.match(/(?<!\d)(0\s?4\d{2}[\s\-]?\d{3}[\s\-]?\d{3})(?!\d)/g) || [];
      const phone = mobileMatches.map(toE164Au).find(isAuMobile) || "";
      if (phone) withMobile++;
      // Cheap website probe: any non-Hipages, non-social external link
      const ext = [...phtml.matchAll(/href="(https?:\/\/[^"?#]+)"/g)].map(m => m[1]);
      const hasExt = ext.some(u => {
        try {
          const h = new URL(u).hostname;
          if (h.endsWith("hipages.com.au")) return false;
          if (/(facebook|instagram|linkedin|twitter|x\.com|youtube|tiktok|googletagmanager|googleadservices|doubleclick|cloudflare|gstatic|googleapis)/i.test(h)) return false;
          return true;
        } catch { return false; }
      });
      if (hasExt) withWebsite++;
      await new Promise(r => setTimeout(r, 800));
    } catch { /* skip failed profile */ }
  }
  return {
    rows_found: slugs.length,
    with_mobile: withMobile,
    with_website: withWebsite,
    note: `(profile sample n=${probeSlugs.length})`
  };
}

async function probeServiceSeeking(trade, metro) {
  const url = `https://www.serviceseeking.com.au/${trade.ss}/${metro}`;
  const html = await fetchHtml(url);
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  const names = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const d = JSON.parse(m[1]);
      const items = Array.isArray(d) ? d : d["@graph"] ? d["@graph"] : [d];
      for (const it of items) {
        if ((it["@type"] === "LocalBusiness" || it["@type"] === "ProfessionalService") && it.name) {
          names.add(it.name);
        }
      }
    } catch { /* skip malformed */ }
  }
  return { rows_found: names.size, with_mobile: 0, with_website: 0, note: "phones gated; enrichment-only" };
}

const PROBES = {
  hipages:        probeHipages,
  oneflare:       probeOneflare,
  serviceseeking: probeServiceSeeking,
};

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const trades  = TRADE_FILTER  ? TRADES.filter(t => t.label === TRADE_FILTER) : TRADES;
  const sources = SOURCE_FILTER ? [SOURCE_FILTER] : Object.keys(PROBES);

  console.log(`Source B smoke probe`);
  console.log(`Sources: ${sources.join(", ")}`);
  console.log(`Trades:  ${trades.map(t => t.label).join(", ")}`);
  console.log("");
  console.log("source          | trade        | metro              | rows | mobile | website | note");
  console.log("----------------+--------------+--------------------+------+--------+---------+------");

  let healthy = true;
  for (const source of sources) {
    const fn = PROBES[source];
    if (!fn) { console.log(`unknown source: ${source}`); continue; }
    const metro = METRO_OVERRIDE ?? DEFAULT_PROBES[source];
    for (const trade of trades) {
      let r;
      try {
        r = await fn(trade, metro);
      } catch (err) {
        r = { rows_found: 0, with_mobile: 0, with_website: 0, note: `ERROR: ${err.message}` };
      }
      console.log(
        `${source.padEnd(15)} | ${trade.label.padEnd(12)} | ${metro.padEnd(18)} | ` +
        `${String(r.rows_found).padStart(4)} | ${String(r.with_mobile).padStart(6)} | ` +
        `${String(r.with_website).padStart(7)} | ${r.note ?? ""}`
      );
      // Health rule: hipages and oneflare must yield rows. ServiceSeeking
      // is informational only.
      if ((source === "hipages" || source === "oneflare") && r.rows_found === 0) healthy = false;
      await new Promise(r => setTimeout(r, 600));
    }
  }

  console.log("");
  console.log(healthy
    ? "OK — Source B parsers are matching the live pages."
    : "WARNING — at least one of hipages/oneflare returned 0 rows. Re-check parser.");
  process.exit(healthy ? 0 : 1);
}

main().catch(err => { console.error("Fatal:", err); process.exit(2); });
