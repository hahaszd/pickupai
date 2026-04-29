#!/usr/bin/env npx tsx
/**
 * ServiceSeeking.com.au directory scraper for tradie leads.
 *
 * National coverage across all metros, four trades. Mobile-only by default
 * (drops landlines / 1300 numbers at scrape time). Output is per-trade
 * per-metro CSV under data/leads/serviceseeking/ for the orchestrator to
 * import.
 *
 * Usage:
 *   npx tsx scripts/scrape-serviceseeking.ts                                # all trades, all metros
 *   npx tsx scripts/scrape-serviceseeking.ts --trade plumber                # single trade
 *   npx tsx scripts/scrape-serviceseeking.ts --output leads-serviceseeking.csv  # single-file legacy
 *   npx tsx scripts/scrape-serviceseeking.ts --include-non-mobile           # keep landlines
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
  { slug: "plumbers",     label: "plumber" },
  { slug: "electricians", label: "electrician" },
  { slug: "roofers",      label: "roofer" },
  { slug: "handyman",     label: "handyman" },
];

interface Region {
  slug: string;
  metro: string;
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
  { slug: "nsw/dee-why",       metro: "sydney", state: "NSW" },
  { slug: "nsw/wollongong",    metro: "newcastle-central-coast", state: "NSW" },
  { slug: "nsw/newcastle",     metro: "newcastle-central-coast", state: "NSW" },
  { slug: "nsw/nowra",         metro: "newcastle-central-coast", state: "NSW" },
  // VIC
  { slug: "vic/melbourne",     metro: "melbourne", state: "VIC" },
  { slug: "vic/richmond",      metro: "melbourne", state: "VIC" },
  { slug: "vic/footscray",     metro: "melbourne", state: "VIC" },
  { slug: "vic/box-hill",      metro: "melbourne", state: "VIC" },
  { slug: "vic/dandenong",     metro: "melbourne", state: "VIC" },
  { slug: "vic/frankston",     metro: "melbourne", state: "VIC" },
  { slug: "vic/geelong",       metro: "melbourne", state: "VIC" },
  { slug: "vic/brunswick",     metro: "melbourne", state: "VIC" },
  // QLD
  { slug: "qld/brisbane",      metro: "brisbane",  state: "QLD" },
  { slug: "qld/chermside",     metro: "brisbane",  state: "QLD" },
  { slug: "qld/logan",         metro: "brisbane",  state: "QLD" },
  { slug: "qld/ipswich",       metro: "brisbane",  state: "QLD" },
  { slug: "qld/southport",     metro: "gold-coast", state: "QLD" },
  { slug: "qld/surfers-paradise", metro: "gold-coast", state: "QLD" },
  // WA
  { slug: "wa/perth",          metro: "perth", state: "WA" },
  { slug: "wa/fremantle",      metro: "perth", state: "WA" },
  { slug: "wa/joondalup",      metro: "perth", state: "WA" },
  { slug: "wa/mandurah",       metro: "perth", state: "WA" },
  // SA
  { slug: "sa/adelaide",       metro: "adelaide", state: "SA" },
  { slug: "sa/glenelg",        metro: "adelaide", state: "SA" },
  // ACT
  { slug: "act/canberra",      metro: "canberra", state: "ACT" },
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
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let tradeFilter: string | null = null;
  let output = "";
  let outputDir = "data/leads/serviceseeking";
  let mobileOnly = true;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--trade":              tradeFilter = args[++i] ?? null; break;
      case "--output":             output = args[++i] ?? ""; break;
      case "--output-dir":         outputDir = args[++i] ?? outputDir; break;
      case "--include-non-mobile": mobileOnly = false; break;
    }
  }
  return { tradeFilter, output, outputDir, perMetroOutput: !output, mobileOnly };
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

function extractListings(html: string, trade: string, region: Region, mobileOnly: boolean): Lead[] {
  const leads: Lead[] = [];

  const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let jsonMatch;
  while ((jsonMatch = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
      for (const item of items) {
        if (
          item["@type"] === "LocalBusiness" ||
          item["@type"] === "ProfessionalService" ||
          item["@type"] === "Service" ||
          item["@type"] === "HomeAndConstructionBusiness"
        ) {
          const name = item.name;
          if (!name || name.includes("ServiceSeeking")) continue;
          const rawPhone = (item.telephone ?? "").replace(/[\s\-]/g, "");
          const normPhone = toE164Au(rawPhone);
          if (mobileOnly && (!normPhone || !isAuMobile(normPhone))) continue;
          leads.push({
            business_name: name,
            phone: normPhone,
            email: "",
            website: item.url && !item.url.includes("serviceseeking") ? item.url : "",
            trade_type: trade,
            suburb: item.address?.addressLocality ?? "",
            state: item.address?.addressRegion ?? region.state,
            source: "serviceseeking",
            google_rating: item.aggregateRating?.ratingValue ? parseFloat(item.aggregateRating.ratingValue) : null,
            review_count: item.aggregateRating?.reviewCount ? parseInt(item.aggregateRating.reviewCount) : null,
          });
        }
      }
    } catch { /* malformed; skip */ }
  }

  return leads;
}

async function scrapePaginated(
  trade: { slug: string; label: string },
  region: Region,
  seenPhones: Set<string>,
  seenNames: Set<string>,
  mobileOnly: boolean
): Promise<Lead[]> {
  const collected: Lead[] = [];
  for (let page = 1; page <= 5; page++) {
    const pageParam = page === 1 ? "" : `?page=${page}`;
    const url = `https://www.serviceseeking.com.au/${trade.slug}/${region.slug}${pageParam}`;
    try {
      const html = await fetchPage(url);
      const listings = extractListings(html, trade.label, region, mobileOnly);
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
    } catch {
      break;
    }
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
        const results = await scrapePaginated(trade, region, seenPhones, seenNames, args.mobileOnly);
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
