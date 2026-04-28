#!/usr/bin/env npx tsx
/**
 * Google Places API (New) lead scraper for Australian tradies.
 *
 * Modes:
 *   --region "Bondi"                                        single suburb
 *   --regions-file scripts/sydney-regions.txt              one suburb per line
 *   --regions-dir scripts/au-regions                       every *.txt = one metro;
 *                                                          writes <output-dir>/<trade>/<metro>.csv
 *
 * Also:
 *   - --mobile-only (default true): drop rows whose phone isn't a valid AU mobile
 *     (+614XXXXXXXX) at scrape time so we don't burn DB rows on landlines / 1300s.
 *   - --max-requests N (default 5000): hard cap on total Pro Text Search calls;
 *     aborts cleanly to prevent surprise billing.
 *
 * Requires GOOGLE_PLACES_API_KEY in .env. Enable "Places API (New)" in Google Cloud Console.
 *
 * Usage:
 *   Single:   npx tsx scripts/collect-leads.ts --trade plumber --region "Bondi" --output leads.csv
 *   Batch:    npx tsx scripts/collect-leads.ts --trade plumber --regions-file scripts/sydney-regions.txt --output leads.csv
 *   National: npx tsx scripts/collect-leads.ts --trade plumber --regions-dir scripts/au-regions --output-dir data/leads
 */

import { writeFileSync, readFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { basename, dirname, join } from "path";
import { config } from "dotenv";

config();

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE_URL = "https://places.googleapis.com/v1";

// ── Phone helpers (kept in sync with src/utils/phone.ts) ─────────────────────
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

interface PlaceResult {
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

interface RegionGroup {
  /** Output label, e.g. "sydney". Used to name the per-metro CSV. */
  metro: string;
  suburbs: string[];
}

interface ParsedArgs {
  trade: string;
  groups: RegionGroup[];
  /** Single-file output path (used in --region / --regions-file modes). */
  output: string;
  /** Output base directory for --regions-dir mode. CSVs go under <outputDir>/<trade>/<metro>.csv */
  outputDir: string;
  maxPerRegion: number;
  maxRequests: number;
  mobileOnly: boolean;
  /** Distinguishes which mode the caller chose so we know how to write outputs. */
  perMetroOutput: boolean;
}

function readSuburbsFile(path: string): string[] {
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let trade = "plumber";
  let regionsFile = "";
  let regionsDir = "";
  let singleRegion = "";
  let output = "leads.csv";
  let outputDir = "data/leads";
  let maxPerRegion = 60;
  let maxRequests = 5000;
  let mobileOnly = true;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--trade":          trade = args[++i] ?? trade; break;
      case "--region":         singleRegion = args[++i] ?? ""; break;
      case "--regions-file":   regionsFile = args[++i] ?? ""; break;
      case "--regions-dir":    regionsDir = args[++i] ?? ""; break;
      case "--output":         output = args[++i] ?? output; break;
      case "--output-dir":     outputDir = args[++i] ?? outputDir; break;
      case "--max":            maxPerRegion = parseInt(args[++i] ?? "60"); break;
      case "--max-requests":   maxRequests = parseInt(args[++i] ?? "5000"); break;
      case "--include-non-mobile": mobileOnly = false; break;
      case "--help":
        console.log(`
Usage: npx tsx scripts/collect-leads.ts [options]

Options:
  --trade <type>            Trade type to search (default: plumber)
  --region <name>           Single suburb to search
  --regions-file <path>     File with one suburb per line (single-output batch)
  --regions-dir <path>      Directory of *.txt files (one per metro). Writes
                            <output-dir>/<trade>/<metro>.csv per metro.
  --output <file>           Output CSV path (--region / --regions-file modes)
  --output-dir <dir>        Base output dir for --regions-dir (default: data/leads)
  --max <number>            Max results per suburb (default: 60)
  --max-requests <n>        Hard cap on total Text Search Pro requests (default: 5000)
  --include-non-mobile      Keep landlines / 1300 numbers (default: drop them)
  --help                    Show this help

Examples:
  npx tsx scripts/collect-leads.ts --trade plumber --region "Bondi" --max 50 --output leads-plumber.csv
  npx tsx scripts/collect-leads.ts --trade plumber --regions-file scripts/au-regions/sydney.txt --output leads-plumber-sydney.csv
  npx tsx scripts/collect-leads.ts --trade plumber --regions-dir scripts/au-regions --output-dir data/leads
        `);
        process.exit(0);
    }
  }

  const groups: RegionGroup[] = [];
  let perMetroOutput = false;

  if (regionsDir) {
    perMetroOutput = true;
    const files = readdirSync(regionsDir).filter(f => f.endsWith(".txt"));
    for (const f of files) {
      const metro = basename(f, ".txt");
      const suburbs = readSuburbsFile(join(regionsDir, f));
      if (suburbs.length > 0) groups.push({ metro, suburbs });
    }
  } else if (regionsFile) {
    groups.push({ metro: basename(regionsFile, ".txt"), suburbs: readSuburbsFile(regionsFile) });
  } else if (singleRegion) {
    groups.push({ metro: singleRegion.toLowerCase().replace(/\s+/g, "-"), suburbs: [singleRegion] });
  } else {
    groups.push({ metro: "default", suburbs: ["Greater Sydney NSW"] });
  }

  return { trade, groups, output, outputDir, maxPerRegion, maxRequests, mobileOnly, perMetroOutput };
}

// ── Request counter shared across the whole run ──────────────────────────────
let totalRequests = 0;
let aborted = false;

async function textSearchNew(
  query: string,
  pageToken: string | undefined,
  maxRequests: number
): Promise<{ places: any[]; nextPageToken?: string }> {
  if (totalRequests >= maxRequests) {
    aborted = true;
    return { places: [] };
  }
  totalRequests++;

  const body: any = {
    textQuery: query,
    languageCode: "en",
    regionCode: "AU",
    pageSize: 20
  };
  if (pageToken) body.pageToken = pageToken;

  const resp = await fetch(`${BASE_URL}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY!,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.internationalPhoneNumber",
        "places.nationalPhoneNumber",
        "places.websiteUri",
        "places.formattedAddress",
        "places.addressComponents",
        "places.rating",
        "places.userRatingCount",
        "places.shortFormattedAddress",
        "nextPageToken"
      ].join(",")
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Text Search API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json() as any;
  return {
    places: data.places ?? [],
    nextPageToken: data.nextPageToken
  };
}

function extractSuburb(addressComponents: any[]): string {
  if (!addressComponents || !Array.isArray(addressComponents)) return "";
  const locality = addressComponents.find((c: any) =>
    c.types?.includes("locality") || c.types?.includes("sublocality")
  );
  return locality?.longText ?? locality?.shortText ?? "";
}

function extractState(addressComponents: any[]): string {
  if (!addressComponents || !Array.isArray(addressComponents)) return "";
  const state = addressComponents.find((c: any) =>
    c.types?.includes("administrative_area_level_1")
  );
  return state?.shortText ?? "";
}

function csvEscape(val: string | number | null): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function scrapeSuburb(
  trade: string,
  suburb: string,
  maxResults: number,
  maxRequests: number,
  seenPhones: Set<string>,
  mobileOnly: boolean
): Promise<{ collected: PlaceResult[]; droppedNonMobile: number }> {
  const query = `${trade} in ${suburb} Australia`;
  const collected: PlaceResult[] = [];
  let pageToken: string | undefined;
  let droppedNonMobile = 0;

  while (collected.length < maxResults) {
    if (aborted) break;
    const { places, nextPageToken } = await textSearchNew(query, pageToken, maxRequests);
    if (places.length === 0) break;

    for (const place of places) {
      if (collected.length >= maxResults) break;

      const name = place.displayName?.text ?? "";
      const rawPhone = (place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? "").replace(/[\s\-]/g, "");
      const normPhone = toE164Au(rawPhone);
      const website = place.websiteUri ?? "";
      const placeSuburb = extractSuburb(place.addressComponents) || suburb;
      const state = extractState(place.addressComponents);
      const rating = place.rating ?? null;
      const reviewCount = place.userRatingCount ?? null;

      if (mobileOnly && (!normPhone || !isAuMobile(normPhone))) {
        droppedNonMobile++;
        continue;
      }

      if (normPhone && seenPhones.has(normPhone)) continue;
      if (normPhone) seenPhones.add(normPhone);

      collected.push({
        business_name: name,
        phone: normPhone,
        email: "",
        website,
        trade_type: trade,
        suburb: placeSuburb,
        state,
        source: "google_places",
        google_rating: rating,
        review_count: reviewCount
      });
    }

    if (!nextPageToken) break;
    pageToken = nextPageToken;
    await new Promise(r => setTimeout(r, 500));
  }

  return { collected, droppedNonMobile };
}

function writeCsv(path: string, rows: PlaceResult[]) {
  mkdirSync(dirname(path), { recursive: true });
  const header = "business_name,phone,email,website,trade_type,suburb,state,source,google_rating,review_count";
  const csvRows = rows.map(r =>
    [r.business_name, r.phone, r.email, r.website, r.trade_type, r.suburb, r.state, r.source, r.google_rating, r.review_count]
      .map(csvEscape)
      .join(",")
  );
  writeFileSync(path, [header, ...csvRows].join("\n") + "\n", "utf-8");
}

async function main() {
  const args = parseArgs();

  if (!API_KEY) {
    console.error("Error: GOOGLE_PLACES_API_KEY is required.");
    console.error("Set it in .env or as an environment variable.");
    process.exit(1);
  }

  const totalSuburbs = args.groups.reduce((sum, g) => sum + g.suburbs.length, 0);
  console.log(`Trade: ${args.trade}`);
  console.log(`Metros: ${args.groups.length} (${totalSuburbs} suburbs)`);
  console.log(`Max per suburb: ${args.maxPerRegion}`);
  console.log(`Max total Pro requests: ${args.maxRequests}`);
  console.log(`Mobile-only: ${args.mobileOnly ? "yes (drop landlines/1300)" : "no"}`);
  console.log(`Output: ${args.perMetroOutput ? `${args.outputDir}/${args.trade}/<metro>.csv` : args.output}\n`);

  const allResults: PlaceResult[] = [];
  const seenPhones = new Set<string>();
  let totalDroppedNonMobile = 0;
  const perMetroResults: Map<string, PlaceResult[]> = new Map();

  outer: for (const group of args.groups) {
    const metroResults: PlaceResult[] = [];
    let suburbIdx = 0;
    for (const suburb of group.suburbs) {
      suburbIdx++;
      process.stdout.write(`[${group.metro}] (${suburbIdx}/${group.suburbs.length}) ${suburb}... `);

      try {
        const { collected, droppedNonMobile } = await scrapeSuburb(
          args.trade, suburb, args.maxPerRegion, args.maxRequests, seenPhones, args.mobileOnly
        );
        metroResults.push(...collected);
        totalDroppedNonMobile += droppedNonMobile;
        console.log(`${collected.length} kept, ${droppedNonMobile} non-mobile dropped (run total: ${allResults.length + metroResults.length}, requests: ${totalRequests})`);
      } catch (err: any) {
        console.log(`ERROR: ${err.message}`);
      }

      if (aborted) {
        console.log(`\n⚠ Hit --max-requests cap (${args.maxRequests}). Stopping cleanly.`);
        allResults.push(...metroResults);
        perMetroResults.set(group.metro, metroResults);
        break outer;
      }

      if (suburbIdx < group.suburbs.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
    allResults.push(...metroResults);
    perMetroResults.set(group.metro, metroResults);
  }

  console.log(`\n=== DONE ===`);
  console.log(`Total Pro requests used: ${totalRequests} / ${args.maxRequests}`);
  console.log(`Total unique kept: ${allResults.length}`);
  console.log(`Total non-mobile dropped: ${totalDroppedNonMobile}`);

  if (allResults.length === 0) {
    console.log("No results to write.");
    return;
  }

  if (args.perMetroOutput) {
    const tradeDir = join(args.outputDir, args.trade);
    if (!existsSync(tradeDir)) mkdirSync(tradeDir, { recursive: true });
    for (const [metro, rows] of perMetroResults.entries()) {
      if (rows.length === 0) continue;
      const path = join(tradeDir, `${metro}.csv`);
      writeCsv(path, rows);
      console.log(`  → ${path} (${rows.length} rows)`);
    }
  } else {
    writeCsv(args.output, allResults);
    console.log(`Written to ${args.output}`);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
