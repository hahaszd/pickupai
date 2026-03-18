#!/usr/bin/env npx tsx
/**
 * Hipages directory scraper for Australian tradies.
 * Scrapes publicly accessible directory pages to collect business info.
 *
 * Usage: npx tsx scripts/scrape-hipages.ts --output leads-hipages.csv
 */

import { writeFileSync } from "fs";
import { config } from "dotenv";
config();

const TRADES = [
  { slug: "plumbers", label: "plumber" },
  { slug: "electricians", label: "electrician" },
  { slug: "roofing", label: "roofer" },
];

const REGIONS = [
  "nsw/sydney",
  "sydney_cbd_region",
  "inner_west",
  "eastern_suburbs",
  "north_shore_lower",
  "north_shore_upper",
  "northern_beaches",
  "hills_district",
  "parramatta",
  "blacktown",
  "penrith",
  "campbelltown",
  "liverpool",
  "sutherland_shire",
  "st_george",
  "canterbury_bankstown",
  "wollongong",
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

function extractListings(html: string, trade: string): Lead[] {
  const leads: Lead[] = [];

  // Extract business names and suburbs from listing cards
  // Hipages uses structured data and consistent HTML patterns
  const namePattern = /class="[^"]*business-name[^"]*"[^>]*>([^<]+)</gi;
  const suburbPattern = /class="[^"]*location[^"]*"[^>]*>([^<]+)</gi;
  const ratingPattern = /class="[^"]*rating[^"]*"[^>]*>([\d.]+)/gi;
  const websitePattern = /href="(https?:\/\/(?!hipages)[^"]+)"[^>]*class="[^"]*website/gi;

  // Try JSON-LD structured data first (more reliable)
  const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let jsonMatch;
  while ((jsonMatch = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
      for (const item of items) {
        if (item["@type"] === "LocalBusiness" || item["@type"] === "ProfessionalService" || item["@type"] === "Plumber" || item["@type"] === "Electrician") {
          const name = item.name;
          if (!name) continue;
          const phone = (item.telephone ?? "").replace(/[\s\-]/g, "");
          const suburb = item.address?.addressLocality ?? "";
          const website = item.url && !item.url.includes("hipages") ? item.url : "";
          const rating = item.aggregateRating?.ratingValue ? parseFloat(item.aggregateRating.ratingValue) : null;
          const reviewCount = item.aggregateRating?.reviewCount ? parseInt(item.aggregateRating.reviewCount) : null;

          leads.push({
            business_name: name,
            phone,
            email: "",
            website,
            trade_type: trade,
            suburb,
            state: "NSW",
            source: "hipages",
            google_rating: rating,
            review_count: reviewCount,
          });
        }
      }
    } catch {}
  }

  // Fallback: parse HTML patterns if JSON-LD didn't yield results
  if (leads.length === 0) {
    // Look for tradie profile links and names
    const profilePattern = /href="\/connect\/([^"]+)"[^>]*>[\s\S]*?<[^>]*>([^<]{3,60})<\//gi;
    let m;
    while ((m = profilePattern.exec(html)) !== null) {
      const name = m[2].trim();
      if (name && name.length > 2 && !name.includes("hipages") && !name.includes("Find") && !name.includes("Get")) {
        leads.push({
          business_name: name,
          phone: "",
          email: "",
          website: "",
          trade_type: trade,
          suburb: "",
          state: "NSW",
          source: "hipages",
          google_rating: null,
          review_count: null,
        });
      }
    }
  }

  return leads;
}

async function main() {
  const args = process.argv.slice(2);
  let output = "leads-hipages.csv";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output") output = args[++i] ?? output;
  }

  const allLeads: Lead[] = [];
  const seenNames = new Set<string>();

  for (const trade of TRADES) {
    for (const region of REGIONS) {
      const url = `https://hipages.com.au/find/${trade.slug}/${region}`;
      process.stdout.write(`${trade.label} / ${region}... `);

      try {
        const html = await fetchPage(url);
        const listings = extractListings(html, trade.label);
        let added = 0;
        for (const lead of listings) {
          const key = lead.business_name.toLowerCase();
          if (seenNames.has(key)) continue;
          seenNames.add(key);
          allLeads.push(lead);
          added++;
        }
        console.log(`${added} new (total: ${allLeads.length})`);
      } catch (err: any) {
        console.log(`SKIP (${err.message})`);
      }

      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log(`\nTotal: ${allLeads.length} leads`);

  if (allLeads.length === 0) {
    console.log("No results to write.");
    return;
  }

  const header = "business_name,phone,email,website,trade_type,suburb,state,source,google_rating,review_count";
  const csvRows = allLeads.map(r =>
    [r.business_name, r.phone, r.email, r.website, r.trade_type, r.suburb, r.state, r.source, r.google_rating, r.review_count]
      .map(csvEscape).join(",")
  );
  writeFileSync(output, [header, ...csvRows].join("\n") + "\n", "utf-8");
  console.log(`Written to ${output}`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
