#!/usr/bin/env node
/**
 * Industry-association member-directory scraper (AU tradies).
 *
 * Pulls members from publicly listed "find a member" / "find a tradie" pages
 * of the major Australian trade associations. Members pay annual fees, so the
 * data is curated and current — much higher quality than directory dumps,
 * but lower volume.
 *
 * Sources covered:
 *   plumber:     Master Plumbers Australia (state member finders)
 *   electrician: NECA (National Electrical & Communications Association)
 *   builder:     Master Builders Australia / HIA member finders
 *   roofer:      Master Plumbers (covers roof plumbing) + Master Builders
 *
 * The script uses a pluggable per-association parser. Each association has
 * its own listing URL pattern and HTML structure; we keep them in one file
 * so it's easy to add/remove sources without churning the orchestrator.
 *
 * Extraction is defensive: tries JSON-LD first (LocalBusiness or
 * ItemList → ListItem), then falls back to plain HTML "card" parsing for
 * name + phone + suburb + website.
 *
 * Mobile-only filter on by default. Output is per-trade CSV under
 * data/leads/associations/ for the orchestrator to auto-import.
 *
 * Usage:
 *   node scripts/scrape-industry-associations.mjs                     # all sources, all trades
 *   node scripts/scrape-industry-associations.mjs --trade plumber     # one trade
 *   node scripts/scrape-industry-associations.mjs --include-non-mobile
 *   node scripts/scrape-industry-associations.mjs --delay 3000        # slower scrape
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// ── Phone helpers (in sync with src/utils/phone.ts) ──────────────────────────
function toE164Au(raw) {
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
const isAuMobile = (e164) => /^\+614\d{8}$/.test(e164);

// ── Association catalogue ────────────────────────────────────────────────────
//
// Each entry is { trade, source, urls: [{ url, state }] }. URLs are the
// PUBLIC member-finder pages. Add new sources here without touching parsers.
//
// State member finders are preferred over the national finder when both
// exist — they paginate better and don't aggregate duplicates.
const ASSOCIATIONS = [
  // ── Plumbers ───────────────────────────────────────────────────────────────
  { trade: "plumber", source: "master_plumbers_nsw",
    urls: [{ url: "https://www.masterplumbers.com.au/find-a-plumber", state: "NSW" }] },
  { trade: "plumber", source: "master_plumbers_vic",
    urls: [{ url: "https://www.plumber.com.au/find-a-plumber", state: "VIC" }] },
  { trade: "plumber", source: "master_plumbers_qld",
    urls: [{ url: "https://www.mpaq.com.au/find-a-master-plumber", state: "QLD" }] },
  { trade: "plumber", source: "master_plumbers_sa",
    urls: [{ url: "https://www.masterplumbers.asn.au/find-a-plumber", state: "SA" }] },
  { trade: "plumber", source: "master_plumbers_wa",
    urls: [{ url: "https://www.masterplumbers.asn.au/find-a-plumber", state: "WA" }] },

  // ── Electricians ───────────────────────────────────────────────────────────
  { trade: "electrician", source: "neca_au",
    urls: [
      { url: "https://www.neca.asn.au/find-electrician?state=NSW", state: "NSW" },
      { url: "https://www.neca.asn.au/find-electrician?state=VIC", state: "VIC" },
      { url: "https://www.neca.asn.au/find-electrician?state=QLD", state: "QLD" },
      { url: "https://www.neca.asn.au/find-electrician?state=WA",  state: "WA" },
      { url: "https://www.neca.asn.au/find-electrician?state=SA",  state: "SA" },
    ] },

  // ── Roofers (Master Plumbers covers roof plumbing in most states) ──────────
  { trade: "roofer", source: "master_plumbers_nsw_roofing",
    urls: [{ url: "https://www.masterplumbers.com.au/find-a-plumber?service=roofing", state: "NSW" }] },

  // ── Builders / handyman-adjacent ───────────────────────────────────────────
  { trade: "handyman", source: "master_builders",
    urls: [
      { url: "https://www.masterbuilders.com.au/find-a-master-builder?state=NSW", state: "NSW" },
      { url: "https://www.masterbuilders.com.au/find-a-master-builder?state=VIC", state: "VIC" },
      { url: "https://www.masterbuilders.com.au/find-a-master-builder?state=QLD", state: "QLD" },
    ] },
];

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let tradeFilter = null;
  let outputDir = "data/leads/associations";
  let mobileOnly = true;
  let delayMs = 2000;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--trade":              tradeFilter = args[++i] ?? null; break;
      case "--output-dir":         outputDir = args[++i] ?? outputDir; break;
      case "--include-non-mobile": mobileOnly = false; break;
      case "--delay":              delayMs = parseInt(args[++i] ?? "2000", 10); break;
      case "--help":
        console.log(`
Usage: node scripts/scrape-industry-associations.mjs [options]

Options:
  --trade <name>          plumber | electrician | roofer | handyman (default: all)
  --output-dir <dir>      Base output dir (default: data/leads/associations)
  --include-non-mobile    Keep landlines / 1300 (default: drop them)
  --delay <ms>            Delay between fetches (default: 2000)
  --help                  Show this help
        `);
        process.exit(0);
    }
  }
  return { tradeFilter, outputDir, mobileOnly, delayMs };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-AU,en;q=0.9",
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

// ── Extractors ───────────────────────────────────────────────────────────────

function* walkBusinessNodes(data) {
  if (!data) return;
  if (Array.isArray(data)) {
    for (const item of data) yield* walkBusinessNodes(item);
    return;
  }
  if (typeof data !== "object") return;

  const type = data["@type"];
  const types = Array.isArray(type) ? type : (type ? [type] : []);
  if (types.some((t) => /Business|Plumber|Electrician|Contractor|Service|Organization|Member/i.test(String(t)))) {
    if (data.name || data.telephone) yield data;
  }

  for (const key of ["itemListElement", "mainEntity", "hasPart", "@graph", "item"]) {
    if (data[key]) yield* walkBusinessNodes(data[key]);
  }
}

function extractFromJsonLd(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1].trim());
      for (const node of walkBusinessNodes(data)) out.push(node);
    } catch { /* ignore */ }
  }
  return out;
}

/**
 * Plain-HTML fallback. Looks for a repeating "member card" container with
 * a class containing "member" / "result" / "card" / "listing" / "item".
 * Within each container, extracts name (first <h2|h3|h4|strong>), phone
 * (first AU mobile or 0X pattern), and website (first <a href> not
 * pointing back to the association's own host).
 */
function extractFromHtml(html, sourceHost) {
  const out = [];
  const containerRe = /<(?:div|article|li|section)[^>]+class=["'][^"']*(?:member|result|card|listing|directory-item|provider)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|article|li|section)>/gi;
  let m;
  while ((m = containerRe.exec(html)) !== null) {
    const block = m[1];
    if (block.length < 50 || block.length > 8000) continue;

    const nameMatch = block.match(/<(?:h[2-5]|strong)[^>]*>([\s\S]*?)<\/(?:h[2-5]|strong)>/i);
    let name = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
    if (!name) continue;

    let phone = "";
    const telMatch = block.match(/href\s*=\s*["']tel:([^"']+)["']/i);
    if (telMatch) phone = telMatch[1];
    if (!phone) {
      const plain = block.match(/(\+?61\s*4\d[\s\-]?\d{3}[\s\-]?\d{3}|0\s*\d{1,4}[\s\-]?\d{3,4}[\s\-]?\d{3,4})/);
      if (plain) phone = plain[1];
    }

    let website = "";
    const linkRe = /<a[^>]+href=["']((?:https?:)?\/\/[^"']+)["']/gi;
    let lm;
    while ((lm = linkRe.exec(block)) !== null) {
      const href = lm[1].startsWith("//") ? "https:" + lm[1] : lm[1];
      try {
        const u = new URL(href);
        if (sourceHost && (u.hostname === sourceHost || u.hostname.endsWith("." + sourceHost))) continue;
        if (/facebook|instagram|linkedin|twitter|youtube|google\.com/i.test(u.hostname)) continue;
        website = href;
        break;
      } catch { /* skip */ }
    }

    let suburb = "";
    const suburbMatch = block.match(/\b([A-Z][A-Za-z\s']+),?\s+(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s+\d{4}\b/);
    if (suburbMatch) suburb = suburbMatch[1].trim();

    out.push({ name, phone, website, suburb });
  }
  return out;
}

function nodesToLeads(jsonLdNodes, htmlCards, trade, source, defaultState, mobileOnly) {
  const leads = [];
  const seen = new Set();

  const consider = (name, phone, website, suburb, state) => {
    if (!name) return;
    const norm = toE164Au(phone || "");
    if (mobileOnly && (!norm || !isAuMobile(norm))) return;
    const key = `${name.toLowerCase()}|${norm}`;
    if (seen.has(key)) return;
    seen.add(key);
    leads.push({
      business_name: name,
      phone: norm,
      email: "",
      website: website || "",
      trade_type: trade,
      suburb: suburb || "",
      state: state || defaultState,
      source,
      google_rating: null,
      review_count: null,
    });
  };

  for (const n of jsonLdNodes) {
    const name = String(n.name || n.legalName || "").trim();
    const phone = String(n.telephone || n.phone || "").trim();
    const website = String(n.url || n.sameAs || "").trim();
    let suburb = ""; let state = defaultState;
    if (n.address && typeof n.address === "object") {
      suburb = String(n.address.addressLocality || "").trim();
      state  = String(n.address.addressRegion  || defaultState).trim().toUpperCase();
    }
    consider(name, phone, website, suburb, state);
  }

  for (const c of htmlCards) {
    consider(c.name, c.phone, c.website, c.suburb, defaultState);
  }

  return leads;
}

// ── Output ───────────────────────────────────────────────────────────────────

function csvEscape(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeCsv(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  const header = "business_name,phone,email,website,trade_type,suburb,state,source,google_rating,review_count";
  const csvRows = rows.map((r) =>
    [r.business_name, r.phone, r.email, r.website, r.trade_type, r.suburb, r.state, r.source, r.google_rating, r.review_count]
      .map(csvEscape).join(",")
  );
  writeFileSync(path, [header, ...csvRows].join("\n") + "\n", "utf-8");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const associations = args.tradeFilter
    ? ASSOCIATIONS.filter((a) => a.trade === args.tradeFilter)
    : ASSOCIATIONS;

  console.log(`Industry-association scrape`);
  console.log(`Sources:      ${associations.length}`);
  console.log(`Mobile-only:  ${args.mobileOnly}`);
  console.log(`Delay:        ${args.delayMs}ms`);
  console.log(`Output dir:   ${args.outputDir}\n`);

  const perTrade = new Map(); // trade -> Lead[]

  for (const assoc of associations) {
    console.log(`──── ${assoc.source} (${assoc.trade}) ────`);
    const allLeads = [];
    for (const { url, state } of assoc.urls) {
      process.stdout.write(`  ${state} ${url}... `);
      let html = "";
      try {
        html = await fetchPage(url);
      } catch (err) {
        console.log(`SKIP (${err.message})`);
        continue;
      }

      let sourceHost = "";
      try { sourceHost = new URL(url).hostname; } catch { /* ignore */ }

      const jsonLd  = extractFromJsonLd(html);
      const htmlCards = extractFromHtml(html, sourceHost);
      const leads = nodesToLeads(jsonLd, htmlCards, assoc.trade, assoc.source, state, args.mobileOnly);
      allLeads.push(...leads);
      console.log(`${leads.length} members (jsonld=${jsonLd.length}, html=${htmlCards.length})`);

      await new Promise((r) => setTimeout(r, args.delayMs));
    }

    if (!perTrade.has(assoc.trade)) perTrade.set(assoc.trade, []);
    perTrade.get(assoc.trade).push(...allLeads);
  }

  // Write one CSV per trade (combining all associations for that trade).
  let total = 0;
  for (const [trade, rows] of perTrade.entries()) {
    if (rows.length === 0) continue;
    // Cross-association dedup on (name + phone) since a member can belong
    // to multiple associations.
    const seen = new Set();
    const deduped = [];
    for (const r of rows) {
      const key = `${r.business_name.toLowerCase()}|${r.phone}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }
    const path = join(args.outputDir, `${trade}.csv`);
    writeCsv(path, deduped);
    console.log(`\n  → ${path} (${deduped.length} unique members, ${rows.length - deduped.length} duplicates removed)`);
    total += deduped.length;
  }

  console.log(`\n=== DONE ===`);
  console.log(`Total unique members across all sources: ${total}`);
  if (total === 0) {
    console.log(`\nNo members extracted. Likely causes:`);
    console.log(`  - Association site changed its HTML — update parser in extractFromHtml()`);
    console.log(`  - Site uses a JS-rendered SPA — switch to Playwright fetch`);
    console.log(`  - Member finder requires login (some associations gate behind auth)`);
  }
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
