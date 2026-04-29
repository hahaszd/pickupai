#!/usr/bin/env npx tsx
/**
 * TrueLocal.com.au directory scraper for AU tradie leads.
 *
 * TrueLocal lists Australian businesses by trade + suburb. Listing pages
 * follow the pattern `https://www.truelocal.com.au/find/<trade>/<state>/<suburb>`
 * (with fallback `/find/<trade>/<suburb>` for ambiguous suburbs).
 *
 * Extraction strategy (defensive — site re-themes occasionally):
 *   1. JSON-LD `<script type="application/ld+json">` blocks. TrueLocal emits
 *      LocalBusiness entries with name/telephone/address. Most reliable.
 *   2. Embedded React/Next state in `<script>__INITIAL_STATE__ = ...</script>`
 *      or `__NEXT_DATA__`, parsed if present.
 *   3. Plain HTML regex over business "card" containers as a last resort.
 *
 * Mobile-only filter on by default (drops landlines/1300/1800). Output is
 * per-trade per-metro CSV under data/leads/truelocal/ for the orchestrator
 * to auto-import.
 *
 * Usage:
 *   npx tsx scripts/scrape-truelocal.ts                                # all trades, all regions
 *   npx tsx scripts/scrape-truelocal.ts --trade plumber                # single trade
 *   npx tsx scripts/scrape-truelocal.ts --output leads-truelocal.csv   # single-file legacy output
 *   npx tsx scripts/scrape-truelocal.ts --include-non-mobile           # keep landlines
 *   npx tsx scripts/scrape-truelocal.ts --max-pages 3                  # cap pagination per region
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { config } from "dotenv";
config();

// ── Phone helpers (in sync with src/utils/phone.ts) ──────────────────────────
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

// TrueLocal trade slugs. The site accepts singular/plural forms; we use the
// plural forms that show the most listings.
const TRADES = [
  { slug: "plumbers",     label: "plumber" },
  { slug: "electricians", label: "electrician" },
  { slug: "roofers",      label: "roofer" },
  { slug: "handyman",     label: "handyman" },
];

interface Region {
  /** URL path after the trade slug, e.g. "nsw/sydney". */
  slug: string;
  /** Display label for per-metro CSV bucketing. */
  metro: string;
  /** State code for the prospect row. */
  state: string;
  /** Suburb hint for fallback when the listing has no address. */
  suburb: string;
}

const REGIONS: Region[] = [
  // NSW
  { slug: "nsw/sydney",         metro: "sydney",  state: "NSW", suburb: "Sydney" },
  { slug: "nsw/parramatta",     metro: "sydney",  state: "NSW", suburb: "Parramatta" },
  { slug: "nsw/penrith",        metro: "sydney",  state: "NSW", suburb: "Penrith" },
  { slug: "nsw/blacktown",      metro: "sydney",  state: "NSW", suburb: "Blacktown" },
  { slug: "nsw/liverpool",      metro: "sydney",  state: "NSW", suburb: "Liverpool" },
  { slug: "nsw/campbelltown",   metro: "sydney",  state: "NSW", suburb: "Campbelltown" },
  { slug: "nsw/hornsby",        metro: "sydney",  state: "NSW", suburb: "Hornsby" },
  { slug: "nsw/chatswood",      metro: "sydney",  state: "NSW", suburb: "Chatswood" },
  { slug: "nsw/manly",          metro: "sydney",  state: "NSW", suburb: "Manly" },
  { slug: "nsw/bondi",          metro: "sydney",  state: "NSW", suburb: "Bondi" },
  { slug: "nsw/cronulla",       metro: "sydney",  state: "NSW", suburb: "Cronulla" },
  { slug: "nsw/castle-hill",    metro: "sydney",  state: "NSW", suburb: "Castle Hill" },
  { slug: "nsw/hurstville",     metro: "sydney",  state: "NSW", suburb: "Hurstville" },
  { slug: "nsw/ryde",           metro: "sydney",  state: "NSW", suburb: "Ryde" },
  { slug: "nsw/fairfield",      metro: "sydney",  state: "NSW", suburb: "Fairfield" },
  { slug: "nsw/wollongong",     metro: "newcastle-central-coast", state: "NSW", suburb: "Wollongong" },
  { slug: "nsw/newcastle",      metro: "newcastle-central-coast", state: "NSW", suburb: "Newcastle" },
  { slug: "nsw/gosford",        metro: "newcastle-central-coast", state: "NSW", suburb: "Gosford" },
  // VIC
  { slug: "vic/melbourne",      metro: "melbourne", state: "VIC", suburb: "Melbourne" },
  { slug: "vic/richmond",       metro: "melbourne", state: "VIC", suburb: "Richmond" },
  { slug: "vic/st-kilda",       metro: "melbourne", state: "VIC", suburb: "St Kilda" },
  { slug: "vic/footscray",      metro: "melbourne", state: "VIC", suburb: "Footscray" },
  { slug: "vic/box-hill",       metro: "melbourne", state: "VIC", suburb: "Box Hill" },
  { slug: "vic/dandenong",      metro: "melbourne", state: "VIC", suburb: "Dandenong" },
  { slug: "vic/frankston",      metro: "melbourne", state: "VIC", suburb: "Frankston" },
  { slug: "vic/geelong",        metro: "melbourne", state: "VIC", suburb: "Geelong" },
  // QLD
  { slug: "qld/brisbane",       metro: "brisbane", state: "QLD", suburb: "Brisbane" },
  { slug: "qld/south-brisbane", metro: "brisbane", state: "QLD", suburb: "South Brisbane" },
  { slug: "qld/chermside",      metro: "brisbane", state: "QLD", suburb: "Chermside" },
  { slug: "qld/logan",          metro: "brisbane", state: "QLD", suburb: "Logan" },
  { slug: "qld/ipswich",        metro: "brisbane", state: "QLD", suburb: "Ipswich" },
  { slug: "qld/southport",      metro: "gold-coast", state: "QLD", suburb: "Southport" },
  { slug: "qld/surfers-paradise", metro: "gold-coast", state: "QLD", suburb: "Surfers Paradise" },
  { slug: "qld/robina",         metro: "gold-coast", state: "QLD", suburb: "Robina" },
  // WA
  { slug: "wa/perth",           metro: "perth", state: "WA", suburb: "Perth" },
  { slug: "wa/fremantle",       metro: "perth", state: "WA", suburb: "Fremantle" },
  { slug: "wa/joondalup",       metro: "perth", state: "WA", suburb: "Joondalup" },
  { slug: "wa/rockingham",      metro: "perth", state: "WA", suburb: "Rockingham" },
  // SA
  { slug: "sa/adelaide",        metro: "adelaide", state: "SA", suburb: "Adelaide" },
  { slug: "sa/glenelg",         metro: "adelaide", state: "SA", suburb: "Glenelg" },
  { slug: "sa/salisbury",       metro: "adelaide", state: "SA", suburb: "Salisbury" },
  // ACT
  { slug: "act/canberra",       metro: "canberra", state: "ACT", suburb: "Canberra" },
  // TAS
  { slug: "tas/hobart",         metro: "hobart", state: "TAS", suburb: "Hobart" },
  { slug: "tas/launceston",     metro: "hobart", state: "TAS", suburb: "Launceston" },
  // NT
  { slug: "nt/darwin",          metro: "darwin", state: "NT", suburb: "Darwin" },
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
  maxPages: number;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let tradeFilter: string | null = null;
  let output = "";
  let outputDir = "data/leads/truelocal";
  let mobileOnly = true;
  let maxPages = 3;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--trade":              tradeFilter = args[++i] ?? null; break;
      case "--output":             output = args[++i] ?? ""; break;
      case "--output-dir":         outputDir = args[++i] ?? outputDir; break;
      case "--include-non-mobile": mobileOnly = false; break;
      case "--max-pages":          maxPages = parseInt(args[++i] ?? "3"); break;
    }
  }
  return { tradeFilter, output, outputDir, perMetroOutput: !output, mobileOnly, maxPages };
}

function csvEscape(val: string | number | null): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function fetchPage(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-AU,en;q=0.9",
      "Cache-Control": "no-cache",
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

// ── Extractors ───────────────────────────────────────────────────────────────

/**
 * Walk a JSON-LD object/array and yield every node that looks like a
 * LocalBusiness (or one of its subclasses like Plumber, Electrician).
 */
function* walkBusinessNodes(data: any): IterableIterator<any> {
  if (!data) return;
  if (Array.isArray(data)) {
    for (const item of data) yield* walkBusinessNodes(item);
    return;
  }
  if (typeof data !== "object") return;

  const type = data["@type"];
  const types = Array.isArray(type) ? type : (type ? [type] : []);
  if (types.some((t: string) => /Business|Plumber|Electrician|Roof|Contractor|Service|Organization/i.test(String(t)))) {
    if (data.name || data.telephone) yield data;
  }

  // Common containers: itemListElement, mainEntity, hasPart, "@graph"
  for (const key of ["itemListElement", "mainEntity", "hasPart", "@graph", "item"]) {
    if (data[key]) yield* walkBusinessNodes(data[key]);
  }
}

function extractFromJsonLd(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1].trim());
      for (const node of walkBusinessNodes(data)) out.push(node);
    } catch {
      // Some sites embed multiple JSON objects in one tag; ignore parse fails.
    }
  }
  return out;
}

function extractFromInitialState(html: string): any[] {
  // Try Next.js __NEXT_DATA__ first.
  const nextMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (nextMatch) {
    try {
      const data = JSON.parse(nextMatch[1]);
      const out: any[] = [];
      // Search recursively for arrays of objects with name+telephone shape.
      const visit = (node: any) => {
        if (!node) return;
        if (Array.isArray(node)) {
          for (const x of node) visit(x);
          return;
        }
        if (typeof node !== "object") return;
        if ((node.name || node.businessName) && (node.phone || node.telephone || node.phoneNumber)) {
          out.push(node);
        }
        for (const v of Object.values(node)) visit(v);
      };
      visit(data);
      return out;
    } catch { /* fall through */ }
  }

  // Inline state assignments e.g. `window.__INITIAL_STATE__ = {...};`
  const stateMatch = html.match(/window\.__(?:INITIAL_STATE|PRELOADED_STATE|APP_STATE)__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (stateMatch) {
    try {
      const data = JSON.parse(stateMatch[1]);
      const out: any[] = [];
      const visit = (node: any) => {
        if (!node) return;
        if (Array.isArray(node)) { for (const x of node) visit(x); return; }
        if (typeof node !== "object") return;
        if ((node.name || node.businessName) && (node.phone || node.telephone || node.phoneNumber)) {
          out.push(node);
        }
        for (const v of Object.values(node)) visit(v);
      };
      visit(data);
      return out;
    } catch { /* ignore */ }
  }

  return [];
}

function nodeToLead(node: any, trade: string, region: Region, mobileOnly: boolean): Lead | null {
  const name = String(node.name || node.businessName || node.legalName || "").trim();
  if (!name) return null;

  // Phone field varies: telephone (JSON-LD), phone, phoneNumber (state)
  const rawPhone = String(node.telephone || node.phone || node.phoneNumber || "").trim();
  const norm = toE164Au(rawPhone);
  if (mobileOnly && (!norm || !isAuMobile(norm))) return null;

  // Address: JSON-LD usually has a PostalAddress object
  let suburb = region.suburb;
  let state = region.state;
  const addr = node.address;
  if (addr && typeof addr === "object") {
    if (addr.addressLocality) suburb = String(addr.addressLocality).trim() || suburb;
    if (addr.addressRegion)   state  = String(addr.addressRegion).trim().toUpperCase() || state;
  }

  // Website may live on `url` (JSON-LD) or `website` (state). Filter out
  // truelocal's own URLs (these are listing pages, not the business website).
  const rawSite = String(node.url || node.website || node.sameAs || "").trim();
  const website = rawSite && !rawSite.includes("truelocal.com.au") ? rawSite : "";

  // Ratings
  let rating: number | null = null;
  let reviewCount: number | null = null;
  const agg = node.aggregateRating;
  if (agg && typeof agg === "object") {
    const r = parseFloat(agg.ratingValue);
    if (!isNaN(r)) rating = r;
    const c = parseInt(agg.reviewCount ?? agg.ratingCount, 10);
    if (!isNaN(c)) reviewCount = c;
  }

  return {
    business_name: name,
    phone: norm,
    email: "",
    website,
    trade_type: trade,
    suburb,
    state,
    source: "truelocal",
    google_rating: rating,
    review_count: reviewCount,
  };
}

function extractListings(html: string, trade: string, region: Region, mobileOnly: boolean): Lead[] {
  const leads: Lead[] = [];
  const nodes = [...extractFromJsonLd(html), ...extractFromInitialState(html)];

  // De-dup nodes by name+phone within the page so JSON-LD + state overlap
  // doesn't double-count.
  const seen = new Set<string>();
  for (const node of nodes) {
    const lead = nodeToLead(node, trade, region, mobileOnly);
    if (!lead) continue;
    const key = `${lead.business_name.toLowerCase()}|${lead.phone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    leads.push(lead);
  }
  return leads;
}

async function scrapePaginated(
  trade: { slug: string; label: string },
  region: Region,
  seenPhones: Set<string>,
  seenNames: Set<string>,
  args: ParsedArgs
): Promise<Lead[]> {
  const collected: Lead[] = [];
  for (let page = 1; page <= args.maxPages; page++) {
    const pageParam = page === 1 ? "" : `?page=${page}`;
    const url = `https://www.truelocal.com.au/find/${trade.slug}/${region.slug}${pageParam}`;
    let html: string;
    try {
      html = await fetchPage(url);
    } catch {
      break;
    }

    const listings = extractListings(html, trade.label, region, args.mobileOnly);
    if (listings.length === 0) break;

    let pageAdded = 0;
    for (const lead of listings) {
      if (lead.phone) {
        if (seenPhones.has(lead.phone)) continue;
        seenPhones.add(lead.phone);
      } else {
        const key = lead.business_name.toLowerCase();
        if (seenNames.has(key)) continue;
        seenNames.add(key);
      }
      collected.push(lead);
      pageAdded++;
    }
    if (pageAdded === 0 && page > 1) break;
    // Be polite — TrueLocal isn't rate-limited aggressively but small delay helps.
    await new Promise(r => setTimeout(r, 2000));
  }
  return collected;
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
  console.log(`Output: ${args.perMetroOutput ? `${args.outputDir}/<trade>/<metro>.csv` : args.output}\n`);

  const allLeads: Lead[] = [];
  const seenPhones = new Set<string>();
  const seenNames = new Set<string>();
  const buckets: Map<string, Lead[]> = new Map();

  for (const trade of trades) {
    for (const region of REGIONS) {
      process.stdout.write(`${trade.label} / ${region.slug}... `);
      try {
        const results = await scrapePaginated(trade, region, seenPhones, seenNames, args);
        allLeads.push(...results);
        if (args.perMetroOutput) {
          const bucketKey = `${trade.label}::${region.metro}`;
          if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
          buckets.get(bucketKey)!.push(...results);
        }
        console.log(`${results.length} new (run total: ${allLeads.length})`);
      } catch (err: any) {
        console.log(`SKIP (${err.message})`);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Total: ${allLeads.length} leads`);
  if (allLeads.length === 0) { console.log("No results."); return; }

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
