#!/usr/bin/env npx tsx
/**
 * Google Places API (New) lead scraper for Australian tradies.
 *
 * Supports single-region and batch mode (--regions-file).
 *
 * Usage:
 *   Single:  npx tsx scripts/collect-leads.ts --trade plumber --region "Bondi" --output leads.csv
 *   Batch:   npx tsx scripts/collect-leads.ts --trade plumber --regions-file scripts/sydney-regions.txt --output leads.csv
 *
 * Requires GOOGLE_PLACES_API_KEY in .env. Enable "Places API (New)" in Google Cloud Console.
 */

import { writeFileSync, readFileSync } from "fs";
import { config } from "dotenv";

config();

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE_URL = "https://places.googleapis.com/v1";

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

interface ParsedArgs {
  trade: string;
  regions: string[];
  output: string;
  maxPerRegion: number;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let trade = "plumber";
  let regions: string[] = [];
  let regionsFile = "";
  let singleRegion = "";
  let output = "leads.csv";
  let maxPerRegion = 60;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--trade": trade = args[++i] ?? trade; break;
      case "--region": singleRegion = args[++i] ?? ""; break;
      case "--regions-file": regionsFile = args[++i] ?? ""; break;
      case "--output": output = args[++i] ?? output; break;
      case "--max": maxPerRegion = parseInt(args[++i] ?? "60"); break;
      case "--help":
        console.log(`
Usage: npx tsx scripts/collect-leads.ts [options]

Options:
  --trade <type>            Trade type to search (default: plumber)
  --region <region>         Single region to search
  --regions-file <path>     File with one region per line (batch mode)
  --output <file>           Output CSV file (default: leads.csv)
  --max <number>            Max results per region (default: 60)
  --help                    Show this help

Examples:
  npx tsx scripts/collect-leads.ts --trade plumber --region "Bondi" --max 50 --output leads-plumber.csv
  npx tsx scripts/collect-leads.ts --trade plumber --regions-file scripts/sydney-regions.txt --output leads-plumber-batch.csv
        `);
        process.exit(0);
    }
  }

  if (regionsFile) {
    const content = readFileSync(regionsFile, "utf-8");
    regions = content.split("\n").map(l => l.trim()).filter(Boolean);
  } else if (singleRegion) {
    regions = [singleRegion];
  } else {
    regions = ["Greater Sydney NSW"];
  }

  return { trade, regions, output, maxPerRegion };
}

async function textSearchNew(
  query: string,
  pageToken?: string
): Promise<{ places: any[]; nextPageToken?: string }> {
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
  if (!addressComponents || !Array.isArray(addressComponents)) return "NSW";
  const state = addressComponents.find((c: any) =>
    c.types?.includes("administrative_area_level_1")
  );
  return state?.shortText ?? "NSW";
}

function csvEscape(val: string | number | null): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function scrapeRegion(
  trade: string,
  region: string,
  maxResults: number,
  seenPhones: Set<string>
): Promise<PlaceResult[]> {
  const query = `${trade} in ${region} NSW Australia`;
  const collected: PlaceResult[] = [];
  let pageToken: string | undefined;
  let page = 0;

  while (collected.length < maxResults) {
    page++;
    const { places, nextPageToken } = await textSearchNew(query, pageToken);
    if (places.length === 0) break;

    for (const place of places) {
      if (collected.length >= maxResults) break;

      const name = place.displayName?.text ?? "";
      const phone = (place.internationalPhoneNumber ?? "").replace(/[\s\-]/g, "");
      const website = place.websiteUri ?? "";
      const suburb = extractSuburb(place.addressComponents);
      const state = extractState(place.addressComponents);
      const rating = place.rating ?? null;
      const reviewCount = place.userRatingCount ?? null;

      if (phone && seenPhones.has(phone)) continue;
      if (phone) seenPhones.add(phone);

      collected.push({
        business_name: name,
        phone,
        email: "",
        website,
        trade_type: trade,
        suburb,
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

  return collected;
}

async function main() {
  const { trade, regions, output, maxPerRegion } = parseArgs();

  if (!API_KEY) {
    console.error("Error: GOOGLE_PLACES_API_KEY is required.");
    console.error("Set it in .env or as an environment variable.");
    process.exit(1);
  }

  console.log(`Trade: ${trade}`);
  console.log(`Regions: ${regions.length}`);
  console.log(`Max per region: ${maxPerRegion}`);
  console.log(`Output: ${output}\n`);

  const allResults: PlaceResult[] = [];
  const seenPhones = new Set<string>();
  let regionIdx = 0;

  for (const region of regions) {
    regionIdx++;
    process.stdout.write(`[${regionIdx}/${regions.length}] ${region}... `);

    try {
      const results = await scrapeRegion(trade, region, maxPerRegion, seenPhones);
      allResults.push(...results);
      console.log(`${results.length} new (total: ${allResults.length})`);
    } catch (err: any) {
      console.log(`ERROR: ${err.message}`);
    }

    // Small delay between regions
    if (regionIdx < regions.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Total unique results: ${allResults.length}`);

  if (allResults.length === 0) {
    console.log("No results to write.");
    return;
  }

  const withPhone = allResults.filter(r => r.phone).length;
  const noPhone = allResults.length - withPhone;
  console.log(`  With phone: ${withPhone}`);
  if (noPhone > 0) console.log(`  Without phone: ${noPhone}`);

  const header = "business_name,phone,email,website,trade_type,suburb,state,source,google_rating,review_count";
  const csvRows = allResults.map(r =>
    [r.business_name, r.phone, r.email, r.website, r.trade_type, r.suburb, r.state, r.source, r.google_rating, r.review_count]
      .map(csvEscape)
      .join(",")
  );

  const csvContent = [header, ...csvRows].join("\n") + "\n";
  writeFileSync(output, csvContent, "utf-8");
  console.log(`\nWritten to ${output}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
