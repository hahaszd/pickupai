#!/usr/bin/env npx tsx
/**
 * Hipages directory scraper for Australian tradies.
 *
 * National coverage across all metros, four trades. Mobile-only by default
 * (drops landlines / 1300 numbers at scrape time so they never enter the
 * import pipeline). Output is per-trade per-metro CSV under data/leads/hipages/
 * for the orchestrator to auto-import.
 *
 * Usage:
 *   npx tsx scripts/scrape-hipages.ts                              # all trades, all metros, default output
 *   npx tsx scripts/scrape-hipages.ts --trade plumber              # single trade
 *   npx tsx scripts/scrape-hipages.ts --output leads-hipages.csv   # single-file legacy output
 *   npx tsx scripts/scrape-hipages.ts --include-non-mobile         # keep landlines
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
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
  { slug: "roofing",      label: "roofer" },
  { slug: "handyman",     label: "handyman" },
];

interface Region {
  /** URL-path slug after `/find/<trade>/` (e.g. "nsw/sydney"). */
  slug: string;
  /** Display label and metro CSV name (e.g. "sydney"). */
  metro: string;
  /** State code stored on the prospect row. */
  state: string;
}

const REGIONS: Region[] = [
  // NSW (existing list, kept)
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
  // QLD — Brisbane + Gold Coast + Sunshine Coast
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
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let tradeFilter: string | null = null;
  let output = "";
  let outputDir = "data/leads/hipages";
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
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
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
          item["@type"] === "Plumber" ||
          item["@type"] === "Electrician" ||
          item["@type"] === "HomeAndConstructionBusiness"
        ) {
          const name = item.name;
          if (!name) continue;
          const rawPhone = (item.telephone ?? "").replace(/[\s\-]/g, "");
          const normPhone = toE164Au(rawPhone);
          if (mobileOnly && (!normPhone || !isAuMobile(normPhone))) continue;
          const suburb = item.address?.addressLocality ?? "";
          const website = item.url && !item.url.includes("hipages") ? item.url : "";
          const rating = item.aggregateRating?.ratingValue ? parseFloat(item.aggregateRating.ratingValue) : null;
          const reviewCount = item.aggregateRating?.reviewCount ? parseInt(item.aggregateRating.reviewCount) : null;

          leads.push({
            business_name: name,
            phone: normPhone,
            email: "",
            website,
            trade_type: trade,
            suburb,
            state: item.address?.addressRegion ?? region.state,
            source: "hipages",
            google_rating: rating,
            review_count: reviewCount,
          });
        }
      }
    } catch { /* malformed JSON-LD; skip */ }
  }

  return leads;
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
  // For per-metro mode: bucket per (trade, metro)
  const buckets: Map<string, Lead[]> = new Map();

  for (const trade of trades) {
    for (const region of REGIONS) {
      const url = `https://hipages.com.au/find/${trade.slug}/${region.slug}`;
      process.stdout.write(`${trade.label} / ${region.slug}... `);

      try {
        const html = await fetchPage(url);
        const listings = extractListings(html, trade.label, region, args.mobileOnly);
        let added = 0;
        for (const lead of listings) {
          const key = lead.phone || lead.business_name.toLowerCase();
          if (lead.phone) {
            if (seenPhones.has(lead.phone)) continue;
            seenPhones.add(lead.phone);
          } else {
            if (seenNames.has(key)) continue;
            seenNames.add(key);
          }
          allLeads.push(lead);
          if (args.perMetroOutput) {
            const bucketKey = `${trade.label}::${region.metro}`;
            if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
            buckets.get(bucketKey)!.push(lead);
          }
          added++;
        }
        console.log(`${added} new (run total: ${allLeads.length})`);
      } catch (err: any) {
        console.log(`SKIP (${err.message})`);
      }

      await new Promise(r => setTimeout(r, 1500));
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
