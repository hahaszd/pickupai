#!/usr/bin/env npx tsx
/**
 * Oneflare.com.au directory scraper for tradie leads.
 *
 * Usage: npx tsx scripts/scrape-oneflare.ts --output leads-oneflare.csv
 */

import { writeFileSync } from "fs";
import { config } from "dotenv";
config();

const TRADES = [
  { slug: "plumber", label: "plumber" },
  { slug: "electrician", label: "electrician" },
  { slug: "roofing", label: "roofer" },
];

const LOCATIONS = [
  "nsw/sydney",
  "nsw/parramatta",
  "nsw/penrith",
  "nsw/blacktown",
  "nsw/liverpool",
  "nsw/campbelltown",
  "nsw/hornsby",
  "nsw/chatswood",
  "nsw/bondi",
  "nsw/manly",
  "nsw/cronulla",
  "nsw/castle-hill",
  "nsw/wollongong",
  "nsw/nowra",
  "nsw/hurstville",
  "nsw/newtown",
  "nsw/dee-why",
  "nsw/marrickville",
  "nsw/randwick",
  "nsw/ashfield",
  "nsw/ryde",
  "nsw/epping",
  "nsw/miranda",
  "nsw/fairfield",
  "nsw/burwood",
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
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

function extractListings(html: string, trade: string): Lead[] {
  const leads: Lead[] = [];

  // Try JSON-LD
  const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let jsonMatch;
  while ((jsonMatch = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
      for (const item of items) {
        if (item["@type"] === "LocalBusiness" || item["@type"] === "ProfessionalService" || item["@type"] === "HomeAndConstructionBusiness") {
          const name = item.name;
          if (!name || name.includes("Oneflare")) continue;
          leads.push({
            business_name: name,
            phone: (item.telephone ?? "").replace(/[\s\-]/g, ""),
            email: "",
            website: item.url && !item.url.includes("oneflare") ? item.url : "",
            trade_type: trade,
            suburb: item.address?.addressLocality ?? "",
            state: item.address?.addressRegion ?? "NSW",
            source: "oneflare",
            google_rating: item.aggregateRating?.ratingValue ? parseFloat(item.aggregateRating.ratingValue) : null,
            review_count: item.aggregateRating?.reviewCount ? parseInt(item.aggregateRating.reviewCount) : null,
          });
        }
      }
    } catch {}
  }

  // Fallback: HTML patterns
  if (leads.length === 0) {
    const namePattern = /class="[^"]*business[_-]?name[^"]*"[^>]*>[\s]*([^<]{3,80})/gi;
    const suburbPattern = /class="[^"]*location[^"]*"[^>]*>[\s]*([^<]+)/gi;

    const names: string[] = [];
    const suburbs: string[] = [];
    let m;

    while ((m = namePattern.exec(html)) !== null) {
      const n = m[1].trim();
      if (n && !n.includes("Oneflare")) names.push(n);
    }
    while ((m = suburbPattern.exec(html)) !== null) suburbs.push(m[1].trim());

    for (let i = 0; i < names.length; i++) {
      leads.push({
        business_name: names[i],
        phone: "",
        email: "",
        website: "",
        trade_type: trade,
        suburb: suburbs[i] ?? "",
        state: "NSW",
        source: "oneflare",
        google_rating: null,
        review_count: null,
      });
    }
  }

  return leads;
}

async function scrapePaginated(trade: { slug: string; label: string }, location: string, seenNames: Set<string>): Promise<Lead[]> {
  const collected: Lead[] = [];
  for (let page = 1; page <= 5; page++) {
    const pageParam = page === 1 ? "" : `?page=${page}`;
    const url = `https://www.oneflare.com.au/${trade.slug}/${location}${pageParam}`;
    try {
      const html = await fetchPage(url);
      const listings = extractListings(html, trade.label);
      if (listings.length === 0) break;
      for (const lead of listings) {
        const key = lead.phone || lead.business_name.toLowerCase();
        if (seenNames.has(key)) continue;
        seenNames.add(key);
        collected.push(lead);
      }
      await new Promise(r => setTimeout(r, 2000));
    } catch {
      break;
    }
  }
  return collected;
}

async function main() {
  const args = process.argv.slice(2);
  let output = "leads-oneflare.csv";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output") output = args[++i] ?? output;
  }

  const allLeads: Lead[] = [];
  const seenNames = new Set<string>();

  for (const trade of TRADES) {
    for (const location of LOCATIONS) {
      process.stdout.write(`${trade.label} / ${location}... `);
      try {
        const results = await scrapePaginated(trade, location, seenNames);
        allLeads.push(...results);
        console.log(`${results.length} new (total: ${allLeads.length})`);
      } catch (err: any) {
        console.log(`SKIP (${err.message})`);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\nTotal: ${allLeads.length} leads`);
  if (allLeads.length === 0) { console.log("No results."); return; }

  const header = "business_name,phone,email,website,trade_type,suburb,state,source,google_rating,review_count";
  const csvRows = allLeads.map(r =>
    [r.business_name, r.phone, r.email, r.website, r.trade_type, r.suburb, r.state, r.source, r.google_rating, r.review_count]
      .map(csvEscape).join(",")
  );
  writeFileSync(output, [header, ...csvRows].join("\n") + "\n", "utf-8");
  console.log(`Written to ${output}`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
