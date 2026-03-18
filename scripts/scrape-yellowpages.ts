#!/usr/bin/env npx tsx
/**
 * Yellow Pages Australia scraper for tradie leads.
 * Scrapes publicly accessible directory pages.
 *
 * Usage: npx tsx scripts/scrape-yellowpages.ts --output leads-yellowpages.csv
 */

import { writeFileSync } from "fs";
import { config } from "dotenv";
config();

const TRADES = [
  { slug: "plumbers", label: "plumber" },
  { slug: "electricians", label: "electrician" },
  { slug: "roofing-services", label: "roofer" },
];

const LOCATIONS = [
  "sydney-nsw",
  "parramatta-nsw",
  "penrith-nsw",
  "blacktown-nsw",
  "liverpool-nsw",
  "campbelltown-nsw",
  "hornsby-nsw",
  "chatswood-nsw",
  "bondi-nsw",
  "manly-nsw",
  "cronulla-nsw",
  "castle-hill-nsw",
  "wollongong-nsw",
  "nowra-nsw",
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

  // Try JSON-LD structured data
  const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let jsonMatch;
  while ((jsonMatch = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@type"] === "LocalBusiness" || item["@type"] === "ProfessionalService" || item["@type"]?.includes?.("Service")) {
          const name = item.name;
          if (!name) continue;
          const phone = (item.telephone ?? "").replace(/[\s\-]/g, "");
          const suburb = item.address?.addressLocality ?? "";
          const website = item.url && !item.url.includes("yellowpages") ? item.url : "";

          leads.push({
            business_name: name,
            phone,
            email: "",
            website,
            trade_type: trade,
            suburb,
            state: "NSW",
            source: "yellowpages",
            google_rating: null,
            review_count: null,
          });
        }
      }
    } catch {}
  }

  // Fallback: phone number pattern + business name parsing
  if (leads.length === 0) {
    // Yellow Pages shows phone numbers in specific patterns
    const phonePattern = /(?:tel:|href="tel:)\+?(61\d{9,10}|0\d{9,10})"/gi;
    const namePattern = /class="[^"]*listing-name[^"]*"[^>]*>[\s]*(?:<[^>]+>)?\s*([^<]{3,80})/gi;
    const suburbPattern = /class="[^"]*listing-address[^"]*"[^>]*>([^<]+)/gi;

    const phones: string[] = [];
    const names: string[] = [];
    const suburbs: string[] = [];

    let m;
    while ((m = phonePattern.exec(html)) !== null) {
      let p = m[1];
      if (p.startsWith("0")) p = "+61" + p.slice(1);
      else if (p.startsWith("61")) p = "+" + p;
      phones.push(p);
    }
    while ((m = namePattern.exec(html)) !== null) names.push(m[1].trim());
    while ((m = suburbPattern.exec(html)) !== null) suburbs.push(m[1].trim());

    const count = Math.min(phones.length, names.length);
    for (let i = 0; i < count; i++) {
      leads.push({
        business_name: names[i],
        phone: phones[i],
        email: "",
        website: "",
        trade_type: trade,
        suburb: suburbs[i] ?? "",
        state: "NSW",
        source: "yellowpages",
        google_rating: null,
        review_count: null,
      });
    }
  }

  return leads;
}

async function scrapePaginated(trade: { slug: string; label: string }, location: string, seenPhones: Set<string>): Promise<Lead[]> {
  const collected: Lead[] = [];
  for (let page = 1; page <= 5; page++) {
    const pageParam = page === 1 ? "" : `/page-${page}`;
    const url = `https://www.yellowpages.com.au/find/${trade.slug}/${location}${pageParam}`;
    try {
      const html = await fetchPage(url);
      const listings = extractListings(html, trade.label);
      if (listings.length === 0) break;
      for (const lead of listings) {
        const key = lead.phone || lead.business_name.toLowerCase();
        if (seenPhones.has(key)) continue;
        seenPhones.add(key);
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
  let output = "leads-yellowpages.csv";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output") output = args[++i] ?? output;
  }

  const allLeads: Lead[] = [];
  const seenPhones = new Set<string>();

  for (const trade of TRADES) {
    for (const location of LOCATIONS) {
      process.stdout.write(`${trade.label} / ${location}... `);
      try {
        const results = await scrapePaginated(trade, location, seenPhones);
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
