#!/usr/bin/env npx tsx
/**
 * Queensland Building and Construction Commission (QBCC) license search
 * scraper.
 *
 * Source: https://onlineservices.qbcc.qld.gov.au/OnlineLicenceSearch
 *
 * QBCC licenses every plumber, drainer, gas fitter, electrical, and roof
 * tiler in QLD. The search is an HTML form. It throws an interstitial
 * CAPTCHA when it detects automated patterns; we back off (long pause +
 * lower QPS) when we see one and otherwise treat the response like any
 * other failed page.
 *
 * Each row gives us name + suburb + license number. Phone is occasionally
 * on the detail page. Mobile-poor rows go through the enrichment script
 * (DuckDuckGo → website-crawl) before becoming SMS prospects.
 *
 * Usage:
 *   npx tsx scripts/scrape-licenses-qld.ts                       # all classes
 *   npx tsx scripts/scrape-licenses-qld.ts --trade plumber       # single trade
 *   npx tsx scripts/scrape-licenses-qld.ts --max-pages 50
 *   npx tsx scripts/scrape-licenses-qld.ts --captcha-backoff 60000  # ms to sleep on CAPTCHA
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

const SEARCH_URL = "https://onlineservices.qbcc.qld.gov.au/OnlineLicenceSearch/Search/SearchLicensee";

const TRADES: Array<{ label: string; classes: string[] }> = [
  { label: "plumber",     classes: ["Plumbing", "Drainage", "Gas Fitting"] },
  { label: "electrician", classes: ["Electrical Work"] },
  { label: "roofer",      classes: ["Roof Tiling", "Roofing - Metal"] },
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
  captchaBackoffMs: number;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let tradeFilter: string | null = null;
  let outputDir = "data/leads/qld-licenses";
  let maxPages = 200;
  let delayMs = 2500;
  let captchaBackoffMs = 60_000;
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--trade":           tradeFilter = args[++i] ?? null; break;
      case "--output-dir":      outputDir = args[++i] ?? outputDir; break;
      case "--max-pages":       maxPages = parseInt(args[++i] ?? "200"); break;
      case "--delay":           delayMs = parseInt(args[++i] ?? "2500"); break;
      case "--captcha-backoff": captchaBackoffMs = parseInt(args[++i] ?? "60000"); break;
    }
  }
  return { tradeFilter, outputDir, maxPages, delayMs, captchaBackoffMs };
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

let cookieJar = "";

function rememberCookies(resp: Response) {
  const sc = resp.headers.get("set-cookie");
  if (!sc) return;
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

function looksLikeCaptcha(html: string): boolean {
  return /captcha|are you a robot|please verify you are human/i.test(html);
}

async function httpGet(url: string): Promise<{ html: string; resp: Response }> {
  const resp = await fetch(url, { headers: { ...HEADERS, ...(cookieJar ? { Cookie: cookieJar } : {}) } });
  rememberCookies(resp);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
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
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return { html: await resp.text(), resp };
}

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

function parseResults(html: string, tradeLabel: string): LicenseRow[] {
  const rows: LicenseRow[] = [];

  // Match each <tr> within the results table (or a result <div class="card">)
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tm;
  while ((tm = trRe.exec(html)) !== null) {
    const tr = tm[1];
    if (!/QLD\s*\d{4}/.test(tr)) continue;

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
      if (!license && /^\d{6,8}$/.test(c)) license = c;
      if (!suburb && /QLD\s*\d{4}/.test(c)) suburb = c.replace(/QLD\s*\d{4}.*/, "").trim();
      if (!phone) {
        const phoneMatch = c.match(/(\+?61\s*4\d[\s\-]?\d{3}[\s\-]?\d{3}|0\s*4\d{2}[\s\-]?\d{3}[\s\-]?\d{3})/);
        if (phoneMatch) phone = phoneMatch[1];
      }
      if (c.length > name.length && !/QLD\s*\d{4}/.test(c) && !/^\d{6,8}$/.test(c)) name = c;
    }
    if (!name) continue;

    rows.push({
      business_name: name,
      phone: toE164Au(phone),
      email: "",
      website: "",
      trade_type: tradeLabel,
      suburb,
      state: "QLD",
      source: "license_qld",
      license_number: license,
      google_rating: null,
      review_count: null,
    });
  }

  return rows;
}

async function fetchTrade(tradeClass: string, tradeLabel: string, args: ParsedArgs): Promise<LicenseRow[]> {
  const collected: LicenseRow[] = [];
  const seen = new Set<string>();

  // 1) Seed cookies + ViewState/Antiforgery tokens
  let html: string;
  try {
    ({ html } = await httpGet(SEARCH_URL));
  } catch (err: any) {
    console.log(`  GET failed: ${err.message}`);
    return collected;
  }
  if (looksLikeCaptcha(html)) {
    console.log(`  CAPTCHA on initial GET — sleeping ${args.captchaBackoffMs}ms`);
    await new Promise(r => setTimeout(r, args.captchaBackoffMs));
    return collected;
  }

  let hidden = extractHidden(html);

  // QBCC field names. Defensive: if QBCC redesigns this page, tweak only here.
  const F_CLASS = "TradeClass";
  const F_NAME  = "LicenseeName";

  for (let page = 1; page <= args.maxPages; page++) {
    process.stdout.write(`  ${tradeClass} p${page}... `);
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(hidden)) body.append(k, v);
    body.set(F_CLASS, tradeClass);
    body.set(F_NAME, "");
    body.set("page", String(page));

    let resp: { html: string; resp: Response };
    try {
      resp = await httpPost(SEARCH_URL, body);
    } catch (err: any) {
      console.log(`SKIP (${err.message})`);
      break;
    }

    if (looksLikeCaptcha(resp.html)) {
      console.log(`CAPTCHA — sleeping ${args.captchaBackoffMs}ms then aborting trade`);
      await new Promise(r => setTimeout(r, args.captchaBackoffMs));
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
    if (added === 0) break;

    hidden = extractHidden(resp.html);
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

  console.log(`QBCC license search scrape`);
  console.log(`Trades:           ${trades.map(t => t.label).join(", ")}`);
  console.log(`Output dir:       ${args.outputDir}`);
  console.log(`Max pages:        ${args.maxPages} per class`);
  console.log(`Delay:            ${args.delayMs}ms`);
  console.log(`CAPTCHA backoff:  ${args.captchaBackoffMs}ms\n`);

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
  console.log(`  node scripts/enrich-prospects-from-website.mjs --source license_qld`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
