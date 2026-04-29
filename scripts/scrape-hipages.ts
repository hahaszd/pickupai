#!/usr/bin/env npx tsx
/**
 * Hipages directory scraper for Australian tradies.
 *
 * Listing pages (https://hipages.com.au/find/<trade>/<region>) expose ~10
 * `/connect/<slug>` profile URLs each but no per-business phone. The phone
 * (almost always a real AU mobile) is in plain text on the profile page,
 * along with the H1 business name and "Suburb STATE postcode" pattern.
 *
 * Strategy: list → collect slugs → fetch each profile concurrency-limited
 * with cookie persistence + Referer header (Hipages 403s naked profile
 * fetches without these). Mobile-only filter at profile-extraction stage.
 *
 * Output is per-trade per-metro CSV under data/leads/hipages/ for the
 * orchestrator to auto-import.
 *
 * Usage:
 *   npx tsx scripts/scrape-hipages.ts                                # all trades, all metros
 *   npx tsx scripts/scrape-hipages.ts --trade plumber                # single trade
 *   npx tsx scripts/scrape-hipages.ts --output leads-hipages.csv     # single-file legacy output
 *   npx tsx scripts/scrape-hipages.ts --include-non-mobile           # keep landlines
 *   npx tsx scripts/scrape-hipages.ts --max-profiles-per-region 50   # cap profile fetches
 *   npx tsx scripts/scrape-hipages.ts --concurrency 3                # tone down parallelism
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { config } from "dotenv";
config();

// ── Phone helpers ────────────────────────────────────────────────────────────
function toE164Au(raw: string): string {
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
const isAuMobile = (e164: string) => /^\+614\d{8}$/.test(e164);

const TRADES = [
  { slug: "plumbers",     label: "plumber" },
  { slug: "electricians", label: "electrician" },
  { slug: "roofing",      label: "roofer" },
  { slug: "handyman",     label: "handyman" },
];

interface Region {
  slug: string;
  metro: string;
  state: string;
}

const REGIONS: Region[] = [
  // NSW
  { slug: "nsw/sydney",            metro: "sydney",  state: "NSW" },
  { slug: "sydney_cbd_region",     metro: "sydney",  state: "NSW" },
  { slug: "inner_west",            metro: "sydney",  state: "NSW" },
  { slug: "eastern_suburbs",       metro: "sydney",  state: "NSW" },
  { slug: "north_shore_lower",     metro: "sydney",  state: "NSW" },
  { slug: "north_shore_upper",     metro: "sydney",  state: "NSW" },
  { slug: "northern_beaches",      metro: "sydney",  state: "NSW" },
  { slug: "hills_district",        metro: "sydney",  state: "NSW" },
  { slug: "parramatta",            metro: "sydney",  state: "NSW" },
  { slug: "blacktown",             metro: "sydney",  state: "NSW" },
  { slug: "penrith",               metro: "sydney",  state: "NSW" },
  { slug: "campbelltown",          metro: "sydney",  state: "NSW" },
  { slug: "liverpool",             metro: "sydney",  state: "NSW" },
  { slug: "sutherland_shire",      metro: "sydney",  state: "NSW" },
  { slug: "st_george",             metro: "sydney",  state: "NSW" },
  { slug: "canterbury_bankstown",  metro: "sydney",  state: "NSW" },
  { slug: "wollongong",            metro: "newcastle-central-coast", state: "NSW" },
  { slug: "newcastle",             metro: "newcastle-central-coast", state: "NSW" },
  { slug: "central_coast",         metro: "newcastle-central-coast", state: "NSW" },
  // VIC
  { slug: "vic/melbourne",         metro: "melbourne", state: "VIC" },
  { slug: "melbourne_cbd",         metro: "melbourne", state: "VIC" },
  { slug: "inner_east",            metro: "melbourne", state: "VIC" },
  { slug: "inner_south",           metro: "melbourne", state: "VIC" },
  { slug: "outer_east",            metro: "melbourne", state: "VIC" },
  { slug: "south_east",            metro: "melbourne", state: "VIC" },
  { slug: "western_suburbs_vic",   metro: "melbourne", state: "VIC" },
  { slug: "northern_suburbs_vic",  metro: "melbourne", state: "VIC" },
  { slug: "bayside",               metro: "melbourne", state: "VIC" },
  { slug: "frankston",             metro: "melbourne", state: "VIC" },
  { slug: "geelong",               metro: "melbourne", state: "VIC" },
  // QLD
  { slug: "qld/brisbane",          metro: "brisbane",  state: "QLD" },
  { slug: "brisbane_cbd",          metro: "brisbane",  state: "QLD" },
  { slug: "north_brisbane",        metro: "brisbane",  state: "QLD" },
  { slug: "south_brisbane",        metro: "brisbane",  state: "QLD" },
  { slug: "ipswich",               metro: "brisbane",  state: "QLD" },
  { slug: "logan",                 metro: "brisbane",  state: "QLD" },
  { slug: "gold_coast",            metro: "gold-coast", state: "QLD" },
  { slug: "sunshine_coast",        metro: "brisbane",  state: "QLD" },
  // WA
  { slug: "wa/perth",              metro: "perth",     state: "WA" },
  { slug: "perth_cbd",             metro: "perth",     state: "WA" },
  { slug: "perth_north",           metro: "perth",     state: "WA" },
  { slug: "perth_south",           metro: "perth",     state: "WA" },
  { slug: "fremantle",             metro: "perth",     state: "WA" },
  // SA
  { slug: "sa/adelaide",           metro: "adelaide",  state: "SA" },
  { slug: "adelaide_north",        metro: "adelaide",  state: "SA" },
  { slug: "adelaide_south",        metro: "adelaide",  state: "SA" },
  // ACT, TAS, NT
  { slug: "act/canberra",          metro: "canberra",  state: "ACT" },
  { slug: "tas/hobart",            metro: "hobart",    state: "TAS" },
  { slug: "tas/launceston",        metro: "hobart",    state: "TAS" },
  { slug: "nt/darwin",             metro: "darwin",    state: "NT" },
];

interface Lead {
  business_name: string;
  phone: string;
  email: string;
  website: string;
  trade_type: string;
  suburb: string;
  state: string;
  source: string;
  google_rating: number | null;
  review_count: number | null;
}

interface ParsedArgs {
  tradeFilter: string | null;
  output: string;
  outputDir: string;
  perMetroOutput: boolean;
  mobileOnly: boolean;
  maxProfilesPerRegion: number;
  concurrency: number;
  delayMs: number;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let tradeFilter: string | null = null;
  let output = "";
  let outputDir = "data/leads/hipages";
  let mobileOnly = true;
  let maxProfilesPerRegion = 200;
  let concurrency = 4;
  let delayMs = 1500;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--trade":                    tradeFilter = args[++i] ?? null; break;
      case "--output":                   output = args[++i] ?? ""; break;
      case "--output-dir":               outputDir = args[++i] ?? outputDir; break;
      case "--include-non-mobile":       mobileOnly = false; break;
      case "--max-profiles-per-region":  maxProfilesPerRegion = parseInt(args[++i] ?? "200"); break;
      case "--concurrency":              concurrency = parseInt(args[++i] ?? "4"); break;
      case "--delay":                    delayMs = parseInt(args[++i] ?? "1500"); break;
    }
  }
  return { tradeFilter, output, outputDir, perMetroOutput: !output, mobileOnly, maxProfilesPerRegion, concurrency, delayMs };
}

function csvEscape(val: string | number | null): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const HEADERS_BASE = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
  "Accept-Language": "en-AU,en;q=0.9",
};

// One cookie jar per scraper run (Hipages 403s subsequent profile requests
// without the cookies the listing page set).
let cookieJar = "";

function rememberCookies(resp: Response) {
  const sc = resp.headers.get("set-cookie");
  if (!sc) return;
  for (const part of sc.split(/,(?=[^;]+=)/)) {
    const m = part.match(/^\s*([^=;]+)=([^;]+)/);
    if (!m) continue;
    cookieJar = cookieJar
      .split("; ")
      .filter(c => c && !c.startsWith(`${m[1]}=`))
      .concat([`${m[1]}=${m[2]}`])
      .join("; ");
  }
}

async function httpGet(url: string, referer?: string): Promise<{ status: number; html: string }> {
  const headers: Record<string, string> = {
    ...HEADERS_BASE,
    ...(cookieJar ? { Cookie: cookieJar } : {}),
    ...(referer ? { Referer: referer } : {}),
  };
  const resp = await fetch(url, { headers });
  rememberCookies(resp);
  if (!resp.ok) return { status: resp.status, html: "" };
  return { status: resp.status, html: await resp.text() };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractSlugs(listingHtml: string): string[] {
  const slugs = new Set<string>();
  const re = /href="\/connect\/([^"?#/]+)"/g;
  let m;
  while ((m = re.exec(listingHtml)) !== null) slugs.add(m[1]);
  return [...slugs];
}

interface ProfileExtract {
  business_name: string;
  phone: string;
  suburb: string;
  state: string;
  website: string;
  google_rating: number | null;
  review_count: number | null;
}

function extractProfile(html: string): ProfileExtract | null {
  const h1m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const business_name = h1m
    ? decodeEntities(h1m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    : "";
  if (!business_name || /404|couldn'?t find/i.test(business_name)) return null;

  // AU mobile in plain text. We deliberately don't trust just any tel: link
  // because some pages embed Hipages' own 1300 customer service number.
  let phone = "";
  const mobileMatches = html.match(/(?<!\d)(0\s?4\d{2}[\s\-]?\d{3}[\s\-]?\d{3})(?!\d)/g);
  if (mobileMatches && mobileMatches.length > 0) {
    for (const raw of mobileMatches) {
      const e = toE164Au(raw);
      if (isAuMobile(e)) { phone = e; break; }
    }
  }

  // Suburb: capture 1-3 Title-Case tokens immediately before a state code +
  // 4-digit postcode. We deliberately don't grab arbitrary leading tokens
  // because the page often shows "<Business Name> - <Suburb> NSW 2000" and
  // a greedy regex would swallow the business name into the suburb cell.
  const subMatch = html.match(/([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,2})\s+(NSW|VIC|QLD|WA|SA|ACT|TAS|NT)\s+\d{4}/);
  const suburb = subMatch ? subMatch[1].trim() : "";
  const state = subMatch ? subMatch[2] : "";

  // Website: skip hipages-hosted asset CDN (mediacache/homeimprovementpages),
  // social media, ad/analytics CDNs, and any URL ending in an image
  // extension (Hipages embeds thumbnail.gif refs in business cards which
  // would otherwise be picked up as the "website").
  let website = "";
  const extLinks = [...html.matchAll(/href="(https?:\/\/[^"?#]+)"/g)].map(m => m[1]);
  for (const u of extLinks) {
    try {
      const host = new URL(u).hostname.toLowerCase();
      const path = new URL(u).pathname.toLowerCase();
      if (host.endsWith("hipages.com.au")) continue;
      if (/(homeimprovementpages\.com\.au|mediacache)/i.test(host)) continue;
      if (/(facebook\.com|fb\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com)$/i.test(host)) continue;
      if (/(googletagmanager|googleadservices|google-analytics|doubleclick|gstatic|googleapis|cloudflare|cloudfront|amazonaws|jsdelivr|unpkg|fontawesome|bootstrapcdn)/i.test(host)) continue;
      if (/\.(gif|jpe?g|png|webp|svg|ico|css|js|woff2?|ttf|eot|pdf)$/i.test(path)) continue;
      website = u; break;
    } catch { /* skip */ }
  }

  // Rating / review counts (best-effort)
  let google_rating: number | null = null;
  let review_count: number | null = null;
  const ratingM = html.match(/([3-5]\.\d)\s*(?:out of|\/|\s*stars)/i);
  if (ratingM) { const v = parseFloat(ratingM[1]); if (!isNaN(v)) google_rating = v; }
  const reviewM = html.match(/(\d{1,4})\s*reviews?/i);
  if (reviewM) { const v = parseInt(reviewM[1]); if (!isNaN(v)) review_count = v; }

  return { business_name, phone, suburb, state, website, google_rating, review_count };
}

async function runWithLimit<T, R>(items: T[], limit: number, worker: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function pull() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, pull));
  return results;
}

function writeCsv(path: string, rows: Lead[]) {
  mkdirSync(dirname(path), { recursive: true });
  const header = "business_name,phone,email,website,trade_type,suburb,state,source,google_rating,review_count";
  const csvRows = rows.map(r =>
    [r.business_name, r.phone, r.email, r.website, r.trade_type, r.suburb, r.state, r.source, r.google_rating, r.review_count]
      .map(csvEscape).join(",")
  );
  writeFileSync(path, [header, ...csvRows].join("\n") + "\n", "utf-8");
}

async function main() {
  const args = parseArgs();
  const trades = args.tradeFilter
    ? TRADES.filter(t => t.label === args.tradeFilter)
    : TRADES;

  console.log(`Trades: ${trades.map(t => t.label).join(", ")}`);
  console.log(`Regions: ${REGIONS.length}`);
  console.log(`Mobile-only: ${args.mobileOnly ? "yes" : "no"}`);
  console.log(`Profile cap/region: ${args.maxProfilesPerRegion}`);
  console.log(`Concurrency: ${args.concurrency}, delay/req: ${args.delayMs}ms`);
  console.log(`Output: ${args.perMetroOutput ? `${args.outputDir}/<trade>/<metro>.csv` : args.output}\n`);

  const allLeads: Lead[] = [];
  const seenSlugs = new Set<string>();
  const seenPhones = new Set<string>();
  const buckets: Map<string, Lead[]> = new Map();

  for (const trade of trades) {
    for (const region of REGIONS) {
      const listingUrl = `https://hipages.com.au/find/${trade.slug}/${region.slug}`;
      process.stdout.write(`${trade.label} / ${region.slug}... `);

      let listingResp: { status: number; html: string };
      try {
        listingResp = await httpGet(listingUrl);
      } catch (err: any) {
        console.log(`SKIP listing (${err.message})`);
        continue;
      }
      if (listingResp.status !== 200) {
        console.log(`SKIP listing (HTTP ${listingResp.status})`);
        continue;
      }

      // Pagination: try page 1..3 for slug discovery (Hipages typically
      // shows 10-22 slugs per page). Cap region's profile fetches.
      const slugs = new Set<string>(extractSlugs(listingResp.html));
      for (let page = 2; page <= 3 && slugs.size < args.maxProfilesPerRegion; page++) {
        try {
          const r = await httpGet(`${listingUrl}?page=${page}`, listingUrl);
          if (r.status !== 200) break;
          const before = slugs.size;
          for (const s of extractSlugs(r.html)) slugs.add(s);
          if (slugs.size === before) break;
          await new Promise(r => setTimeout(r, 800));
        } catch { break; }
      }

      // Dedupe slugs already seen across the whole run
      const fresh = [...slugs].filter(s => !seenSlugs.has(s)).slice(0, args.maxProfilesPerRegion);
      for (const s of fresh) seenSlugs.add(s);

      if (fresh.length === 0) { console.log("0 fresh slugs"); continue; }

      let regionAdded = 0;
      let regionSkipped = 0;
      // Concurrency-limited profile fetch with per-worker stagger
      await runWithLimit(fresh, args.concurrency, async (slug) => {
        const profileUrl = `https://hipages.com.au/connect/${slug}`;
        try {
          const r = await httpGet(profileUrl, listingUrl);
          if (r.status !== 200) { regionSkipped++; return; }
          const p = extractProfile(r.html);
          if (!p) { regionSkipped++; return; }
          if (args.mobileOnly && (!p.phone || !isAuMobile(p.phone))) { regionSkipped++; return; }
          if (p.phone) {
            if (seenPhones.has(p.phone)) { regionSkipped++; return; }
            seenPhones.add(p.phone);
          }
          const lead: Lead = {
            business_name: p.business_name,
            phone: p.phone,
            email: "",
            website: p.website,
            trade_type: trade.label,
            suburb: p.suburb,
            state: p.state || region.state,
            source: "hipages",
            google_rating: p.google_rating,
            review_count: p.review_count,
          };
          allLeads.push(lead);
          if (args.perMetroOutput) {
            const bucketKey = `${trade.label}::${region.metro}`;
            if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
            buckets.get(bucketKey)!.push(lead);
          }
          regionAdded++;
        } catch {
          regionSkipped++;
        }
        // Per-worker politeness stagger (avoids burst patterns)
        await new Promise(r => setTimeout(r, args.delayMs));
      });
      console.log(`slugs=${fresh.length} mobile=${regionAdded} skip=${regionSkipped} (run total: ${allLeads.length})`);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Total: ${allLeads.length} leads`);
  if (allLeads.length === 0) { console.log("No results to write."); return; }

  if (args.perMetroOutput) {
    for (const [key, rows] of buckets.entries()) {
      const [tradeLabel, metro] = key.split("::");
      const path = join(args.outputDir, tradeLabel, `${metro}.csv`);
      writeCsv(path, rows);
      console.log(`  → ${path} (${rows.length} rows)`);
    }
  } else {
    writeCsv(args.output, allLeads);
    console.log(`Written to ${args.output}`);
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
