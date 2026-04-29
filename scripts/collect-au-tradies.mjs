#!/usr/bin/env node
/**
 * National AU tradie lead-collection orchestrator.
 *
 * Coordinates four sources (--sources flag selects which run):
 *   google         scripts/collect-leads.ts (Google Places API)
 *                  → data/leads/<trade>/<metro>.csv
 *   hipages        scripts/scrape-hipages.ts
 *                  → data/leads/hipages/<trade>/<metro>.csv
 *   oneflare       scripts/scrape-oneflare.ts
 *                  → data/leads/oneflare/<trade>/<metro>.csv
 *   serviceseeking scripts/scrape-serviceseeking.ts
 *                  → data/leads/serviceseeking/<trade>/<metro>.csv
 *
 * After collection, the import phase walks data/leads/ recursively and
 * imports every CSV into Neon via scripts/import-csv-to-db.ts.
 *
 * Tradie selection mirrors the ICP: small-business trades where a missed
 * call is essential, can't justify a receptionist, reachable by mobile SMS.
 *
 * Usage:
 *   node scripts/collect-au-tradies.mjs                              # all sources, default trades
 *   node scripts/collect-au-tradies.mjs --sources hipages,oneflare   # only these scrapers
 *   node scripts/collect-au-tradies.mjs --skip-collect               # only re-run import
 *   node scripts/collect-au-tradies.mjs --skip-import                # only collect
 *   node scripts/collect-au-tradies.mjs --max-requests 1500          # tighter cap (per trade, google only)
 *   node scripts/collect-au-tradies.mjs --trades plumber,handyman
 */

import { spawn } from "node:child_process";
import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_TRADES  = ["plumber", "electrician", "roofer", "handyman"];
const DEFAULT_SOURCES = ["google", "hipages", "oneflare", "serviceseeking"];
const REGIONS_DIR     = "scripts/au-regions";
const OUTPUT_DIR      = "data/leads";

// Production DB. Mirrors the hardcoded URL the other scripts/*.mjs already use,
// so the import phase writes to Neon (not the local SQLite file) when invoked
// from a dev machine with no DATABASE_URL in .env.
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://neondb_owner:npg_p7TKVWbOQy2F@ep-long-mountain-a75ui4v2-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";

function parseArgs() {
  const args = process.argv.slice(2);
  let trades       = DEFAULT_TRADES;
  let sources      = DEFAULT_SOURCES;
  let maxRequests  = 5000;
  let maxPerSuburb = 60;
  let skipCollect  = false;
  let skipImport   = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--trades":         trades = (args[++i] ?? "").split(",").map(s => s.trim()).filter(Boolean); break;
      case "--sources":        sources = (args[++i] ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean); break;
      case "--max-requests":   maxRequests = parseInt(args[++i] ?? "5000"); break;
      case "--max":            maxPerSuburb = parseInt(args[++i] ?? "60"); break;
      case "--skip-collect":   skipCollect = true; break;
      case "--skip-import":    skipImport = true; break;
      case "--help":
        console.log(`
Usage: node scripts/collect-au-tradies.mjs [options]

Options:
  --sources <list>         Comma-separated sources (default: ${DEFAULT_SOURCES.join(",")})
                           One or more of: google, hipages, oneflare, serviceseeking
  --trades <list>          Comma-separated trades (default: ${DEFAULT_TRADES.join(",")})
  --max <n>                Max results per suburb (Google source only) (default: 60)
  --max-requests <n>       Hard cap on Pro requests PER TRADE (Google source only) (default: 5000)
  --skip-collect           Don't fetch; only import existing CSVs under ${OUTPUT_DIR}/
  --skip-import            Fetch only; skip the import-to-DB step
  --help                   Show this help
        `);
        process.exit(0);
    }
  }

  const unknown = sources.filter(s => !DEFAULT_SOURCES.includes(s));
  if (unknown.length) {
    console.error(`Unknown source(s): ${unknown.join(", ")}. Valid: ${DEFAULT_SOURCES.join(", ")}`);
    process.exit(1);
  }

  return { trades, sources, maxRequests, maxPerSuburb, skipCollect, skipImport };
}

function run(cmd, args, extraEnv = {}, stdio = "inherit") {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio,
      shell: process.platform === "win32",
      env: { ...process.env, ...extraEnv },
    });
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) resolve(0);
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

// Recursively walk a directory and return all .csv file paths.
function findCsvs(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...findCsvs(p));
    else if (entry.toLowerCase().endsWith(".csv")) out.push(p);
  }
  return out;
}

async function collectGoogle(trade, maxPerSuburb, maxRequests) {
  console.log(`\n[google] ${trade}`);
  await run("npx", [
    "tsx", "scripts/collect-leads.ts",
    "--trade", trade,
    "--regions-dir", REGIONS_DIR,
    "--output-dir", OUTPUT_DIR,
    "--max", String(maxPerSuburb),
    "--max-requests", String(maxRequests),
  ], {});
}

async function collectHipages(trade) {
  console.log(`\n[hipages] ${trade}`);
  await run("npx", ["tsx", "scripts/scrape-hipages.ts", "--trade", trade], {});
}

async function collectOneflare(trade) {
  console.log(`\n[oneflare] ${trade}`);
  await run("npx", ["tsx", "scripts/scrape-oneflare.ts", "--trade", trade], {});
}

async function collectServiceSeeking(trade) {
  console.log(`\n[serviceseeking] ${trade}`);
  await run("npx", ["tsx", "scripts/scrape-serviceseeking.ts", "--trade", trade], {});
}

async function main() {
  const { trades, sources, maxRequests, maxPerSuburb, skipCollect, skipImport } = parseArgs();

  console.log(`Sources:       ${sources.join(", ")}`);
  console.log(`Trades:        ${trades.join(", ")}`);
  console.log(`Regions dir:   ${REGIONS_DIR} (google source only)`);
  console.log(`Output dir:    ${OUTPUT_DIR}`);
  console.log(`Max/suburb:    ${maxPerSuburb} (google only)`);
  console.log(`Max requests:  ${maxRequests} per trade (google only)`);
  console.log(`Skip collect:  ${skipCollect}`);
  console.log(`Skip import:   ${skipImport}\n`);

  // ── Phase 1: collect ────────────────────────────────────────────────────
  if (!skipCollect) {
    for (const trade of trades) {
      console.log(`\n────────── COLLECTING ${trade.toUpperCase()} ──────────`);
      for (const source of sources) {
        try {
          if (source === "google")              await collectGoogle(trade, maxPerSuburb, maxRequests);
          else if (source === "hipages")        await collectHipages(trade);
          else if (source === "oneflare")       await collectOneflare(trade);
          else if (source === "serviceseeking") await collectServiceSeeking(trade);
        } catch (err) {
          console.error(`[${source}] ${trade} failed:`, err.message);
        }
      }
    }
  } else {
    console.log("Skipping collect phase (--skip-collect).");
  }

  // ── Phase 2: import ─────────────────────────────────────────────────────
  if (skipImport) {
    console.log("\nSkipping import phase (--skip-import).");
    return;
  }

  console.log(`\n────────── IMPORTING TO DB ──────────`);
  const csvFiles = findCsvs(OUTPUT_DIR);
  console.log(`Found ${csvFiles.length} CSV files under ${OUTPUT_DIR}/`);
  for (const path of csvFiles) {
    console.log(`\n→ ${path}`);
    try {
      await run("npx", ["tsx", "scripts/import-csv-to-db.ts", path], { DATABASE_URL });
    } catch (err) {
      console.error(`Import failed for ${path}:`, err.message);
    }
  }

  console.log(`\nAll done. Run "node scripts/count-prospects.mjs" to inspect the resulting DB state.`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
