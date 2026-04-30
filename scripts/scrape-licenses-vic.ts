#!/usr/bin/env npx tsx
/**
 * Victorian Building Authority (VBA) practitioner-search scraper.
 *
 * ⚠ STATUS (Apr 2026): NON-FUNCTIONAL. The old public practitioner-search
 * page (https://www.vba.vic.gov.au/practitioner-search and the half-dozen
 * variant slugs we tried) all 404. The "Find a practitioner" tool at
 * https://www.vba.vic.gov.au/tools/find-practitioner now redirects users
 * to an external search application at
 * https://practitioner.etoolbox.pic.vic.gov.au which sits behind a
 * SharePoint sign-in (PumaLogin/PIC). Public anonymous lookup appears to
 * have been retired.
 *
 * To restore: either obtain VBA login credentials and hit the etoolbox app
 * with an authenticated session, or scrape via Playwright if VBA later
 * publishes a public-anonymous endpoint. Until then this script returns 0
 * rows.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Source: https://www.vba.vic.gov.au/practitioner-search   (legacy URL — 404)
 *
 * VBA covers every licensed plumber, gasfitter and registered builder in VIC.
 * The form is an ASP.NET WebForm that round-trips ViewState +
 * EventValidation tokens between requests. To paginate we have to:
 *
 *   1. GET the search page once → grab __VIEWSTATE, __EVENTVALIDATION,
 *      __VIEWSTATEGENERATOR, all hidden inputs.
 *   2. POST the search with __EVENTTARGET set to the search-button name and
 *      our trade-class filter selected. The response gives a fresh ViewState.
 *   3. To page forward, POST again with __EVENTTARGET set to the pager
 *      LinkButton and the new ViewState we just received.
 *
 * Each row gives us name + suburb + license number; phone is rarely present.
 * The enrichment script (DuckDuckGo → website-crawl) is what turns these
 * into mobile prospects.
 *
 * Usage:
 *   npx tsx scripts/scrape-licenses-vic.ts                       # all classes
 *   npx tsx scripts/scrape-licenses-vic.ts --trade plumber       # single trade
 *   npx tsx scripts/scrape-licenses-vic.ts --max-pages 100
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { config } from "dotenv";
config();

// ── Phone helpers ────────────────────────────────────────────────────────────
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

const SEARCH_URL = "https://www.vba.vic.gov.au/practitioner-search";

const TRADES: Array<{ label: string; vbaCategory: string }> = [
  { label: "plumber",     vbaCategory: "Plumber" },
  { label: "electrician", vbaCategory: "Electrician" }, // VBA also lists registered electricians
  { label: "roofer",      vbaCategory: "Roof Plumber" },
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
  let outputDir = "data/leads/vic-licenses";
  let maxPages = 200;
  let delayMs = 2000;
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--trade":      tradeFilter = args[++i] ?? null; break;
      case "--output-dir": outputDir = args[++i] ?? outputDir; break;
      case "--max-pages":  maxPages = parseInt(args[++i] ?? "200"); break;
      case "--delay":      delayMs = parseInt(args[++i] ?? "2000"); break;
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
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "en-AU,en;q=0.9",
};

// Persist cookies between requests in a single string (good enough for one
// host; we don't need a full cookie jar).
let cookieJar = "";

function rememberCookies(resp: Response) {
  const sc = resp.headers.get("set-cookie");
  if (!sc) return;
  // Crude: only keep <name>=<value> pairs.
  for (const part of sc.split(/,(?=[^;]+=)/)) {
    const m = part.match(/^\s*([^=;]+)=([^;]+)/);
    if (!m) continue;
    cookieJar = cookieJar
      .split("; ")
      .filter(c => c && !c.startsWith(`${m[1]}=`))
      .concat([`${m[1]}=${m[2]}`])
      .join("; ");
  }
}

async function httpGet(url: string): Promise<{ html: string; resp: Response }> {
  const resp = await fetch(url, { headers: { ...HEADERS, ...(cookieJar ? { Cookie: cookieJar } : {}) } });
  rememberCookies(resp);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for GET ${url}`);
  return { html: await resp.text(), resp };
}

async function httpPost(url: string, body: URLSearchParams): Promise<{ html: string; resp: Response }> {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookieJar ? { Cookie: cookieJar } : {}),
    },
    body: body.toString(),
  });
  rememberCookies(resp);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for POST ${url}`);
  return { html: await resp.text(), resp };
}

/** Extract every <input type="hidden" name="X" value="Y" /> from an ASP.NET page. */
function extractHidden(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<input[^>]+type=["']hidden["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const nm = /name=["']([^"']+)["']/i.exec(tag);
    const vl = /value=["']([^"']*)["']/i.exec(tag);
    if (nm) out[nm[1]] = vl ? vl[1] : "";
  }
  return out;
}

/**
 * Heuristic VBA result parser.
 *
 * Looks for tables/cards that contain a name, a suburb (with VIC postcode),
 * and a license/registration number. Conservative on purpose so a layout
 * tweak just yields zero rows on a page rather than garbage rows.
 */
function parseResults(html: string, tradeLabel: string): LicenseRow[] {
  const rows: LicenseRow[] = [];

  // Try table rows first
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tm;
  while ((tm = trRe.exec(html)) !== null) {
    const tr = tm[1];
    if (!/VIC\s*\d{4}/.test(tr)) continue;

    const cells: string[] = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm;
    while ((cm = cellRe.exec(tr)) !== null) {
      const txt = cm[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      cells.push(txt);
    }
    if (cells.length < 2) continue;

    let license = "";
    let name = "";
    let suburb = "";
    let phone = "";
    for (const c of cells) {
      if (!license && /^\d{4,8}$/.test(c)) license = c;
      if (!suburb && /VIC\s*\d{4}/.test(c)) suburb = c.replace(/VIC\s*\d{4}.*/, "").trim();
      if (!phone) {
        const phoneMatch = c.match(/(\+?61\s*4\d[\s\-]?\d{3}[\s\-]?\d{3}|0\s*4\d{2}[\s\-]?\d{3}[\s\-]?\d{3})/);
        if (phoneMatch) phone = phoneMatch[1];
      }
      if (c.length > name.length && !/VIC\s*\d{4}/.test(c) && !/^\d{4,8}$/.test(c)) name = c;
    }
    if (!name) continue;

    rows.push({
      business_name: name,
      phone: toE164Au(phone),
      email: "",
      website: "",
      trade_type: tradeLabel,
      suburb,
      state: "VIC",
      source: "license_vic",
      license_number: license,
      google_rating: null,
      review_count: null,
    });
  }

  return rows;
}

/**
 * Search by VBA category and follow pagination. Field names are taken from
 * VBA's published WebForm at the time of writing. If the form is renamed,
 * adjust the field names here only.
 */
async function fetchTrade(tradeClass: string, tradeLabel: string, args: ParsedArgs): Promise<LicenseRow[]> {
  const collected: LicenseRow[] = [];
  const seen = new Set<string>();

  // 1) Fresh GET to seed cookies + ViewState
  let html: string;
  try {
    ({ html } = await httpGet(SEARCH_URL));
  } catch (err: any) {
    console.log(`  GET failed: ${err.message}`);
    return collected;
  }

  let hidden = extractHidden(html);
  if (!hidden.__VIEWSTATE) {
    console.log(`  ! No ViewState found on initial page — VBA form may have been redesigned. Aborting trade.`);
    return collected;
  }

  // Field names (best-effort; VBA tweaks these every couple of years):
  const F_CATEGORY = "ctl00$ContentPlaceHolder1$ddlCategory";
  const F_SEARCH   = "ctl00$ContentPlaceHolder1$btnSearch";

  for (let page = 1; page <= args.maxPages; page++) {
    process.stdout.write(`  ${tradeClass} p${page}... `);
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(hidden)) body.append(k, v);
    body.set(F_CATEGORY, tradeClass);

    if (page === 1) {
      body.set("__EVENTTARGET", "");
      body.set("__EVENTARGUMENT", "");
      body.set(F_SEARCH, "Search");
    } else {
      body.set("__EVENTTARGET", `ctl00$ContentPlaceHolder1$gvResults$ctl01$ctl0${page - 1}`);
      body.set("__EVENTARGUMENT", `Page$${page}`);
      body.delete(F_SEARCH);
    }

    let resp: { html: string; resp: Response };
    try {
      resp = await httpPost(SEARCH_URL, body);
    } catch (err: any) {
      console.log(`SKIP (${err.message})`);
      break;
    }

    const rows = parseResults(resp.html, tradeLabel);
    let added = 0;
    for (const r of rows) {
      const key = r.license_number || `${r.business_name}|${r.suburb}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(r);
      added++;
    }
    console.log(`${added} new (trade total: ${collected.length})`);

    if (added === 0) break; // no more pages or layout changed

    hidden = extractHidden(resp.html); // critical: refresh ViewState for next page
    if (!hidden.__VIEWSTATE) break;

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

  console.log(`VBA practitioner-search scrape`);
  console.log(`Trades:     ${trades.map(t => t.label).join(", ")}`);
  console.log(`Output dir: ${args.outputDir}`);
  console.log(`Max pages:  ${args.maxPages} per class`);
  console.log(`Delay:      ${args.delayMs}ms\n`);

  let totalRows = 0;
  let totalMobile = 0;
  for (const trade of trades) {
    console.log(`\n──── ${trade.label.toUpperCase()} (${trade.vbaCategory}) ────`);
    const rows = await fetchTrade(trade.vbaCategory, trade.label, args);
    const path = join(args.outputDir, `${trade.label}.csv`);
    writeCsv(path, rows);
    const mobiles = rows.filter(r => r.phone && isAuMobile(r.phone)).length;
    console.log(`  → ${path}: ${rows.length} rows, ${mobiles} with mobile`);
    totalRows += rows.length;
    totalMobile += mobiles;
  }

  console.log(`\n=== DONE ===`);
  console.log(`Total: ${totalRows} license rows, ${totalMobile} with AU mobile attached`);
  console.log(`Rows without mobile can be enriched via:`);
  console.log(`  node scripts/enrich-prospects-from-website.mjs --source license_vic`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
