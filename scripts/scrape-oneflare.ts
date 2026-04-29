#!/usr/bin/env npx tsx
/**
 * Oneflare.com.au directory scraper for tradie leads.
 *
 * Oneflare is a Next.js app. The listing page embeds the full Apollo cache
 * inside `<script id="__NEXT_DATA__">` → `props.pageProps.__APOLLO_STATE__`.
 * That cache contains a `BusinessListing:<id>` entry per business with
 * name, phone, landline, website, suburb, state, ratings, etc.
 *
 * No HTML parsing or per-profile fetches required.
 *
 * Usage:
 *   npx tsx scripts/scrape-oneflare.ts                                # all trades, all metros
 *   npx tsx scripts/scrape-oneflare.ts --trade plumber                # single trade
 *   npx tsx scripts/scrape-oneflare.ts --output leads-oneflare.csv    # single-file legacy output
 *   npx tsx scripts/scrape-oneflare.ts --include-non-mobile           # keep landlines
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

const TRADES = [
  { slug: "plumber",     label: "plumber" },
  { slug: "electrician", label: "electrician" },
  { slug: "roofing",     label: "roofer" },
  { slug: "handyman",    label: "handyman" },
];

interface Region {
  /** URL path after the trade slug, e.g. "nsw/sydney". */
  slug: string;
  /** Display label for per-metro CSV bucketing. */
  metro: string;
  /** State code for the prospect row. */
  state: string;
}

const REGIONS: Region[] = [
  // NSW
  { slug: "nsw/sydney",        metro: "sydney", state: "NSW" },
  { slug: "nsw/parramatta",    metro: "sydney", state: "NSW" },
  { slug: "nsw/penrith",       metro: "sydney", state: "NSW" },
  { slug: "nsw/blacktown",     metro: "sydney", state: "NSW" },
  { slug: "nsw/liverpool",     metro: "sydney", state: "NSW" },
  { slug: "nsw/campbelltown",  metro: "sydney", state: "NSW" },
  { slug: "nsw/hornsby",       metro: "sydney", state: "NSW" },
  { slug: "nsw/chatswood",     metro: "sydney", state: "NSW" },
  { slug: "nsw/bondi",         metro: "sydney", state: "NSW" },
  { slug: "nsw/manly",         metro: "sydney", state: "NSW" },
  { slug: "nsw/cronulla",      metro: "sydney", state: "NSW" },
  { slug: "nsw/castle-hill",   metro: "sydney", state: "NSW" },
  { slug: "nsw/hurstville",    metro: "sydney", state: "NSW" },
  { slug: "nsw/newtown",       metro: "sydney", state: "NSW" },
  { slug: "nsw/dee-why",       metro: "sydney", state: "NSW" },
  { slug: "nsw/marrickville",  metro: "sydney", state: "NSW" },
  { slug: "nsw/randwick",      metro: "sydney", state: "NSW" },
  { slug: "nsw/ashfield",      metro: "sydney", state: "NSW" },
  { slug: "nsw/ryde",          metro: "sydney", state: "NSW" },
  { slug: "nsw/epping",        metro: "sydney", state: "NSW" },
  { slug: "nsw/miranda",       metro: "sydney", state: "NSW" },
  { slug: "nsw/fairfield",     metro: "sydney", state: "NSW" },
  { slug: "nsw/burwood",       metro: "sydney", state: "NSW" },
  { slug: "nsw/wollongong",    metro: "newcastle-central-coast", state: "NSW" },
  { slug: "nsw/newcastle",     metro: "newcastle-central-coast", state: "NSW" },
  { slug: "nsw/gosford",       metro: "newcastle-central-coast", state: "NSW" },
  { slug: "nsw/nowra",         metro: "newcastle-central-coast", state: "NSW" },
  // VIC
  { slug: "vic/melbourne",     metro: "melbourne", state: "VIC" },
  { slug: "vic/richmond",      metro: "melbourne", state: "VIC" },
  { slug: "vic/st-kilda",      metro: "melbourne", state: "VIC" },
  { slug: "vic/footscray",     metro: "melbourne", state: "VIC" },
  { slug: "vic/box-hill",      metro: "melbourne", state: "VIC" },
  { slug: "vic/dandenong",     metro: "melbourne", state: "VIC" },
  { slug: "vic/frankston",     metro: "melbourne", state: "VIC" },
  { slug: "vic/geelong",       metro: "melbourne", state: "VIC" },
  { slug: "vic/ringwood",      metro: "melbourne", state: "VIC" },
  { slug: "vic/brunswick",     metro: "melbourne", state: "VIC" },
  { slug: "vic/preston",       metro: "melbourne", state: "VIC" },
  // QLD
  { slug: "qld/brisbane",      metro: "brisbane",  state: "QLD" },
  { slug: "qld/south-brisbane", metro: "brisbane", state: "QLD" },
  { slug: "qld/chermside",     metro: "brisbane",  state: "QLD" },
  { slug: "qld/indooroopilly", metro: "brisbane",  state: "QLD" },
  { slug: "qld/logan",         metro: "brisbane",  state: "QLD" },
  { slug: "qld/ipswich",       metro: "brisbane",  state: "QLD" },
  { slug: "qld/redcliffe",     metro: "brisbane",  state: "QLD" },
  { slug: "qld/surfers-paradise", metro: "gold-coast", state: "QLD" },
  { slug: "qld/southport",     metro: "gold-coast", state: "QLD" },
  { slug: "qld/robina",        metro: "gold-coast", state: "QLD" },
  // WA
  { slug: "wa/perth",          metro: "perth", state: "WA" },
  { slug: "wa/fremantle",      metro: "perth", state: "WA" },
  { slug: "wa/joondalup",      metro: "perth", state: "WA" },
  { slug: "wa/rockingham",     metro: "perth", state: "WA" },
  { slug: "wa/mandurah",       metro: "perth", state: "WA" },
  // SA
  { slug: "sa/adelaide",       metro: "adelaide", state: "SA" },
  { slug: "sa/glenelg",        metro: "adelaide", state: "SA" },
  { slug: "sa/salisbury",      metro: "adelaide", state: "SA" },
  // ACT
  { slug: "act/canberra",      metro: "canberra", state: "ACT" },
  { slug: "act/belconnen",     metro: "canberra", state: "ACT" },
  // TAS
  { slug: "tas/hobart",        metro: "hobart", state: "TAS" },
  { slug: "tas/launceston",    metro: "hobart", state: "TAS" },
  // NT
  { slug: "nt/darwin",         metro: "darwin", state: "NT" },
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
  let outputDir = "data/leads/oneflare";
  let mobileOnly = true;
  let maxPages = 5;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--trade":              tradeFilter = args[++i] ?? null; break;
      case "--output":             output = args[++i] ?? ""; break;
      case "--output-dir":         outputDir = args[++i] ?? outputDir; break;
      case "--include-non-mobile": mobileOnly = false; break;
      case "--max-pages":          maxPages = parseInt(args[++i] ?? "5"); break;
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
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-AU,en;q=0.9",
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

/**
 * Parse the listing page and pull every Apollo-cached BusinessListing.
 *
 * Each entry looks like:
 *   {
 *     __typename: "BusinessListing",
 *     id, name, abn, phone, landline, website, external,
 *     suburb, state, feedbackAvg, feedbackCount, ...
 *   }
 *
 * `phone` is usually a 10-digit AU mobile (e.g. "0423709115"). `landline`
 * is sometimes a separate landline number that the business also lists.
 */
function extractListings(html: string, trade: string, region: Region, mobileOnly: boolean): Lead[] {
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];

  let data: any;
  try { data = JSON.parse(m[1]); } catch { return []; }

  const apollo = data?.props?.pageProps?.__APOLLO_STATE__;
  if (!apollo || typeof apollo !== "object") return [];

  const leads: Lead[] = [];
  for (const key of Object.keys(apollo)) {
    if (!key.startsWith("BusinessListing:")) continue;
    const b = apollo[key];
    if (!b?.name) continue;

    const normPhone = toE164Au(b.phone || "");
    const normLandline = toE164Au(b.landline || "");
    const chosen = (normPhone && isAuMobile(normPhone))
      ? normPhone
      : (normLandline && isAuMobile(normLandline))
      ? normLandline
      : normPhone || normLandline;

    if (mobileOnly && (!chosen || !isAuMobile(chosen))) continue;

    const websiteRaw = b.website || b.external || "";
    const website = (websiteRaw && !String(websiteRaw).includes("oneflare")) ? String(websiteRaw) : "";

    leads.push({
      business_name: String(b.name).trim(),
      phone: chosen,
      email: "",
      website,
      trade_type: trade,
      suburb: b.suburb ?? "",
      state: b.state ?? region.state,
      source: "oneflare",
      google_rating: typeof b.feedbackAvg === "number" ? b.feedbackAvg : (b.feedbackAvg ? parseFloat(b.feedbackAvg) : null),
      review_count: typeof b.feedbackCount === "number" ? b.feedbackCount : (b.feedbackCount ? parseInt(b.feedbackCount) : null),
    });
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
    const url = `https://www.oneflare.com.au/${trade.slug}/${region.slug}${pageParam}`;
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
