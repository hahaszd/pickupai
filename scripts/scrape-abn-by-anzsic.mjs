#!/usr/bin/env node
/**
 * ABN Lookup (Australian Business Register) tradie scraper.
 *
 * Pulls every ABN-registered AU business whose registered name matches a
 * trade keyword (plumber/electrician/roofer/handyman) in a given state.
 * Output is a CSV per state per trade with business_name + ABN + main
 * location, ready for the orchestrator's import phase.
 *
 * This source is fundamentally different from the directory scrapers
 * (Hipages/Oneflare/TrueLocal/etc.): those only show businesses that paid
 * to be listed. ABR returns the entire universe of AU registered tradies.
 * Coverage is much higher; per-row contact info is much lower (no phones).
 * Pair with scripts/recover-mobiles-from-websites.mjs for enrichment.
 *
 * REQUIRES a free ABN Lookup web-service GUID:
 *   1. Register at https://abr.business.gov.au/Tools/WebServices
 *      (asks for name/email; instant approval; free forever).
 *   2. Set the GUID in your shell or .env:
 *        ABN_GUID=01234567-89ab-cdef-0123-456789abcdef
 *
 * Usage:
 *   node scripts/scrape-abn-by-anzsic.mjs                    # all trades, all states
 *   node scripts/scrape-abn-by-anzsic.mjs --trade plumber    # single trade
 *   node scripts/scrape-abn-by-anzsic.mjs --state NSW        # single state
 *   node scripts/scrape-abn-by-anzsic.mjs --max-per-search 200  # cap (default 200)
 *   node scripts/scrape-abn-by-anzsic.mjs --delay 600        # ms between calls (default 600)
 *
 * Cost: $0. ABN Lookup is rate-limited rather than billed; the default
 * 600ms delay keeps us well under the published throttle.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// ── Config ───────────────────────────────────────────────────────────────────

const ABN_GUID = process.env.ABN_GUID;
const BASE = "https://abr.business.gov.au/json";

// Trade keywords searched per state. Multiple variants per trade catch the
// long tail of registered names ("Bobs Plumbing Services Pty Ltd", "Acme
// Electrical Contractors", etc.).
const TRADES = [
  { label: "plumber",     keywords: ["plumbing", "plumber"] },
  { label: "electrician", keywords: ["electrical", "electrician"] },
  { label: "roofer",      keywords: ["roofing", "roof tiling", "roof restoration"] },
  { label: "handyman",    keywords: ["handyman", "handy man"] },
];

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let tradeFilter = null;
  let stateFilter = null;
  let outputDir = "data/leads/abr";
  let maxPerSearch = 200;
  let delayMs = 600;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--trade":          tradeFilter = args[++i] ?? null; break;
      case "--state":          stateFilter = (args[++i] ?? "").toUpperCase() || null; break;
      case "--output-dir":     outputDir = args[++i] ?? outputDir; break;
      case "--max-per-search": maxPerSearch = parseInt(args[++i] ?? "200", 10); break;
      case "--delay":          delayMs = parseInt(args[++i] ?? "600", 10); break;
      case "--help":
        console.log(`
Usage: node scripts/scrape-abn-by-anzsic.mjs [options]

Options:
  --trade <name>         plumber | electrician | roofer | handyman (default: all)
  --state <code>         NSW | VIC | QLD | WA | SA | TAS | ACT | NT (default: all)
  --output-dir <dir>     Base output dir (default: data/leads/abr)
  --max-per-search <n>   Cap results per (keyword, state) pair (default: 200, max ABR allows)
  --delay <ms>           Delay between API calls in ms (default: 600)
  --help                 Show this help

Requires ABN_GUID env var (free from https://abr.business.gov.au/Tools/WebServices).
        `);
        process.exit(0);
    }
  }
  return { tradeFilter, stateFilter, outputDir, maxPerSearch, delayMs };
}

// ── ABR JSON API helpers ─────────────────────────────────────────────────────

/**
 * ABR returns JSONP like `callback({...})`. We pass `&callback=callback`
 * and strip the wrapper. (No safer/cleaner JSON variant exists publicly.)
 */
function stripJsonp(text) {
  const m = text.match(/^[a-zA-Z_$][\w$]*\(([\s\S]*)\)\s*;?\s*$/);
  if (!m) {
    try { return JSON.parse(text); } catch { return null; }
  }
  try { return JSON.parse(m[1]); } catch { return null; }
}

async function fetchJsonp(url) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (PickupAI lead-gen; contact: hello@getpickupai.com.au)",
      "Accept": "application/javascript, text/javascript, */*",
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  return stripJsonp(text);
}

/**
 * MatchingNames.aspx - returns up to maxResults matching names with ABN,
 * status, and main business location.
 *
 * Response shape (selected fields):
 *   {
 *     Names: [
 *       {
 *         Abn: "12345678901",
 *         Name: "BOBS PLUMBING PTY LTD",
 *         NameType: "Trading", | "Main" | "Legal" | ...
 *         IsCurrent: true,
 *         State: "NSW",
 *         Postcode: "2000",
 *         Score: 100, // matching confidence
 *       },
 *       ...
 *     ],
 *     Message: "..." // empty on success
 *   }
 */
async function searchNames(keyword, state, maxResults) {
  const params = new URLSearchParams({
    name: keyword,
    maxResults: String(maxResults),
    guid: ABN_GUID,
    callback: "callback",
    activeAbnsOnly: "Y",
    legalName: "Y",
    tradingName: "Y",
    businessName: "Y",
    [`stateCode_${state.toLowerCase()}`]: "Y",
  });
  const url = `${BASE}/MatchingNames.aspx?${params.toString()}`;
  const data = await fetchJsonp(url);
  if (!data) return [];
  const names = data.Names ?? data.names ?? [];
  // Defensive: some payloads use lowercase keys.
  return names.map((n) => ({
    abn:      String(n.Abn ?? n.abn ?? "").replace(/\s+/g, ""),
    name:     String(n.Name ?? n.name ?? "").trim(),
    state:    String(n.State ?? n.state ?? state).toUpperCase(),
    postcode: String(n.Postcode ?? n.postcode ?? "").trim(),
    score:    Number(n.Score ?? n.score ?? 0),
    isCurrent: Boolean(n.IsCurrent ?? n.isCurrent ?? true),
  }));
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
  const header = "business_name,phone,email,website,trade_type,suburb,state,source,abn,google_rating,review_count";
  const csvRows = rows.map((r) =>
    [r.business_name, r.phone, r.email, r.website, r.trade_type, r.suburb, r.state, r.source, r.abn, r.google_rating, r.review_count]
      .map(csvEscape).join(",")
  );
  writeFileSync(path, [header, ...csvRows].join("\n") + "\n", "utf-8");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!ABN_GUID) {
    console.error("Error: ABN_GUID env var is required.");
    console.error("Register for a free GUID at https://abr.business.gov.au/Tools/WebServices");
    console.error("Then set: ABN_GUID=<your-guid>");
    process.exit(1);
  }

  const args = parseArgs();
  const trades = args.tradeFilter ? TRADES.filter((t) => t.label === args.tradeFilter) : TRADES;
  const states = args.stateFilter ? [args.stateFilter] : STATES;

  console.log(`ABR scrape — Trades: ${trades.map((t) => t.label).join(", ")}`);
  console.log(`States:        ${states.join(", ")}`);
  console.log(`Max per search: ${args.maxPerSearch}`);
  console.log(`Delay:          ${args.delayMs}ms`);
  console.log(`Output dir:     ${args.outputDir}\n`);

  let totalUnique = 0;

  for (const trade of trades) {
    console.log(`──── ${trade.label.toUpperCase()} ────`);
    const tradeRows = [];
    const seenAbns = new Set();
    const seenNamePostcode = new Set();

    for (const state of states) {
      const stateRowsBefore = tradeRows.length;
      for (const keyword of trade.keywords) {
        process.stdout.write(`  ${state} "${keyword}"... `);
        let names = [];
        try {
          names = await searchNames(keyword, state, args.maxPerSearch);
        } catch (err) {
          console.log(`SKIP (${err.message})`);
          continue;
        }

        let added = 0;
        for (const n of names) {
          if (!n.abn || !n.name) continue;
          // Dedup on ABN first; fall back to name+postcode (some entries
          // share names across multiple ABNs and we want the one with most
          // matching evidence to win).
          const fallbackKey = `${n.name.toLowerCase()}|${n.postcode}`;
          if (seenAbns.has(n.abn)) continue;
          if (!n.abn && seenNamePostcode.has(fallbackKey)) continue;
          seenAbns.add(n.abn);
          if (!n.abn) seenNamePostcode.add(fallbackKey);

          tradeRows.push({
            business_name: n.name,
            phone: "",
            email: "",
            website: "",
            trade_type: trade.label,
            suburb: "", // ABR exposes postcode but not suburb in the name search
            state: n.state,
            source: "abr",
            abn: n.abn,
            google_rating: null,
            review_count: null,
          });
          added++;
        }
        console.log(`${names.length} matched, ${added} new (state total: ${tradeRows.length - stateRowsBefore})`);

        await new Promise((r) => setTimeout(r, args.delayMs));
      }
    }

    const path = join(args.outputDir, `${trade.label}.csv`);
    writeCsv(path, tradeRows);
    totalUnique += tradeRows.length;
    console.log(`  → ${path} (${tradeRows.length} unique ABNs)\n`);
  }

  console.log(`=== DONE ===`);
  console.log(`Total unique ABNs across all trades: ${totalUnique}`);
  console.log(`\nNext step (no extra API spend): run the website-crawler enrichment to`);
  console.log(`recover mobiles for these ABR rows once they've been imported:`);
  console.log(`  node scripts/recover-mobiles-from-websites.mjs --apply`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
