#!/usr/bin/env npx tsx
/**
 * NSW Fair Trading public register scraper.
 *
 * Source: https://www.onegov.nsw.gov.au/publicregister/
 * The register exposes every licensed plumber, electrical contractor, and
 * roof tiler in NSW. Phone is sometimes present on the detail page; when
 * absent the row still gives us a business name + suburb that the
 * enrichment script can hand off to Google Places + the website-crawler.
 *
 * Usage:
 *   npx tsx scripts/scrape-licenses-nsw.ts                       # all trades
 *   npx tsx scripts/scrape-licenses-nsw.ts --trade plumber       # single trade
 *   npx tsx scripts/scrape-licenses-nsw.ts --max-pages 50        # cap pagination per trade
 *   npx tsx scripts/scrape-licenses-nsw.ts --output-dir data/leads/nsw-licenses
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

const BASE = "https://www.onegov.nsw.gov.au/publicregister";

// NSW Fair Trading trade-class slugs as used by the public register.
// "trade label" is what we store on the prospect row; "classes" are the
// register's own trade-class names that we submit in the search form.
const TRADES: Array<{ label: string; classes: string[] }> = [
  { label: "plumber",     classes: ["Plumbing", "Plumber", "Drainer", "Gasfitter"] },
  { label: "electrician", classes: ["Electrical", "Electrician", "Electrical contractor"] },
  { label: "roofer",      classes: ["Roof tiler", "Roof Tiling", "Roofing"] },
  // Handyman: NSW does not separately license general handymen, so we skip.
];

interface LicenseRow {
  business_name: string;
  phone: string;
  email: string;
  website: string;
  trade_type: string;
  suburb: string;
  state: string;
  source: string;
  license_number: string;
  google_rating: null;
  review_count: null;
}

interface ParsedArgs {
  tradeFilter: string | null;
  outputDir: string;
  maxPages: number;
  delayMs: number;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let tradeFilter: string | null = null;
  let outputDir = "data/leads/nsw-licenses";
  let maxPages = 200;
  let delayMs = 1500;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--trade":      tradeFilter = args[++i] ?? null; break;
      case "--output-dir": outputDir = args[++i] ?? outputDir; break;
      case "--max-pages":  maxPages = parseInt(args[++i] ?? "200"); break;
      case "--delay":      delayMs = parseInt(args[++i] ?? "1500"); break;
    }
  }
  return { tradeFilter, outputDir, maxPages, delayMs };
}

function csvEscape(val: string | number | null): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/json",
  "Accept-Language": "en-AU,en;q=0.9",
};

async function fetchPage(url: string, init: RequestInit = {}): Promise<string> {
  const resp = await fetch(url, { ...init, headers: { ...HEADERS, ...(init.headers ?? {}) } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.text();
}

/**
 * Parse a NSW Fair Trading public register results page.
 *
 * The register's HTML structure has been stable for years:
 *   <table class="results">
 *     <tr>
 *       <td><a href="/publicregister/details/?id=...">License # 12345C</a></td>
 *       <td>BUSINESS NAME PTY LTD</td>
 *       <td>SUBURB NSW 2000</td>
 *       <td>Plumber</td>
 *     </tr>
 *     ...
 *   </table>
 *
 * We extract from rows defensively (swallow malformed entries) and dedupe
 * by license number.
 */
function parseResults(html: string, tradeLabel: string): LicenseRow[] {
  const rows: LicenseRow[] = [];

  // Match each <tr> in the results table
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(html)) !== null) {
    const tr = rm[1];
    // Only consider rows that look like a result (have a license number link)
    if (!/details\/?\?id=|licenceNumber|license number/i.test(tr) &&
        !/[A-Z]?\d{4,8}[A-Z]?/.test(tr)) continue;

    const cells: string[] = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(tr)) !== null) {
      const txt = cm[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      cells.push(txt);
    }
    if (cells.length < 2) continue;

    // Heuristic: license number is the cell with mostly digits (and an
    // optional trailing class letter), business name is the longest text
    // cell, suburb is the cell with a 4-digit postcode.
    let license = "";
    let name = "";
    let suburb = "";
    let phone = "";
    for (const c of cells) {
      if (!license && /^[A-Z]?\d{4,8}[A-Z]?$/.test(c)) license = c;
      if (!suburb && /\b\d{4}\b/.test(c)) suburb = c.replace(/\bNSW\b\s*\d{4}\b/i, "").trim();
      if (!phone) {
        const phoneMatch = c.match(/(\+?61\s*4\d[\s\-]?\d{3}[\s\-]?\d{3}|0\s*4\d{2}[\s\-]?\d{3}[\s\-]?\d{3})/);
        if (phoneMatch) phone = phoneMatch[1];
      }
      if (c.length > name.length && !/\d{4}/.test(c) && !/^[A-Z]?\d{4,8}[A-Z]?$/.test(c)) name = c;
    }
    if (!license && !name) continue;

    const normPhone = toE164Au(phone);
    rows.push({
      business_name: name,
      phone: normPhone,
      email: "",
      website: "",
      trade_type: tradeLabel,
      suburb,
      state: "NSW",
      source: "license_nsw",
      license_number: license,
      google_rating: null,
      review_count: null,
    });
  }

  return rows;
}

async function fetchTrade(tradeClass: string, tradeLabel: string, args: ParsedArgs): Promise<LicenseRow[]> {
  const collected: LicenseRow[] = [];
  const seenLicenses = new Set<string>();

  // The NSW register uses a query-string-based search with paging:
  //   ?registerName=trades&searchType=name&licenceClass=<class>&page=<n>
  // (Field names verified against historical scrapes; if site has rotated to
  //  a new endpoint, only this URL template needs updating.)
  for (let page = 1; page <= args.maxPages; page++) {
    const url = `${BASE}/?registerName=trades&searchType=licenceClass`
      + `&licenceClass=${encodeURIComponent(tradeClass)}&page=${page}`;
    process.stdout.write(`  ${tradeClass} p${page}... `);
    let html: string;
    try {
      html = await fetchPage(url);
    } catch (err: any) {
      console.log(`SKIP (${err.message})`);
      break;
    }

    const rows = parseResults(html, tradeLabel);
    let added = 0;
    for (const r of rows) {
      const key = r.license_number || `${r.business_name}|${r.suburb}`;
      if (seenLicenses.has(key)) continue;
      seenLicenses.add(key);
      collected.push(r);
      added++;
    }
    console.log(`${added} new (trade total: ${collected.length})`);
    if (added === 0) break; // pagination exhausted (or HTML structure changed)

    await new Promise(r => setTimeout(r, args.delayMs));
  }

  return collected;
}

function writeCsv(path: string, rows: LicenseRow[]) {
  mkdirSync(dirname(path), { recursive: true });
  const header = "business_name,phone,email,website,trade_type,suburb,state,source,license_number,google_rating,review_count";
  const csvRows = rows.map(r =>
    [r.business_name, r.phone, r.email, r.website, r.trade_type, r.suburb, r.state, r.source, r.license_number, r.google_rating, r.review_count]
      .map(csvEscape).join(",")
  );
  writeFileSync(path, [header, ...csvRows].join("\n") + "\n", "utf-8");
}

async function main() {
  const args = parseArgs();
  const trades = args.tradeFilter
    ? TRADES.filter(t => t.label === args.tradeFilter)
    : TRADES;

  console.log(`NSW Fair Trading register scrape`);
  console.log(`Trades:     ${trades.map(t => t.label).join(", ")}`);
  console.log(`Output dir: ${args.outputDir}`);
  console.log(`Max pages:  ${args.maxPages} per class`);
  console.log(`Delay:      ${args.delayMs}ms\n`);

  let totalRows = 0;
  let totalMobile = 0;
  for (const trade of trades) {
    console.log(`\n──── ${trade.label.toUpperCase()} ────`);
    const tradeRows: LicenseRow[] = [];
    const seen = new Set<string>();
    for (const cls of trade.classes) {
      const rows = await fetchTrade(cls, trade.label, args);
      for (const r of rows) {
        const key = r.license_number || `${r.business_name}|${r.suburb}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tradeRows.push(r);
      }
    }
    const path = join(args.outputDir, `${trade.label}.csv`);
    writeCsv(path, tradeRows);
    const mobiles = tradeRows.filter(r => r.phone && isAuMobile(r.phone)).length;
    console.log(`  → ${path}: ${tradeRows.length} rows, ${mobiles} with mobile`);
    totalRows += tradeRows.length;
    totalMobile += mobiles;
  }

  console.log(`\n=== DONE ===`);
  console.log(`Total: ${totalRows} license rows, ${totalMobile} with AU mobile attached`);
  console.log(`Rows without mobile can be enriched via:`);
  console.log(`  node scripts/enrich-prospects-from-website.mjs --source license_nsw`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
