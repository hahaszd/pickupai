#!/usr/bin/env node
/**
 * National AU tradie lead-collection orchestrator.
 *
 * All sources are free. Defaults to one trade (plumber) so multi-trade
 * scrapes are an explicit choice.
 *
 * Coordinates these sources (--sources flag selects which run):
 *   hipages        scripts/scrape-hipages.ts                 (mobiles)
 *                  → data/leads/hipages/<trade>/<metro>.csv
 *   oneflare       scripts/scrape-oneflare.ts                (mobiles)
 *                  → data/leads/oneflare/<trade>/<metro>.csv
 *   truelocal      scripts/scrape-truelocal.ts
 *                  → data/leads/truelocal/<trade>/<metro>.csv
 *   localsearch    scripts/scrape-localsearch.ts
 *                  → data/leads/localsearch/<trade>/<metro>.csv
 *   serviceseeking scripts/scrape-serviceseeking.ts          (no phones)
 *                  → data/leads/serviceseeking/<trade>/<metro>.csv
 *
 * After collection, the import phase walks data/leads/ recursively and
 * imports every CSV into Neon via scripts/import-csv-to-db.ts.
 *
 * Tradie selection mirrors the ICP: small-business trades where a missed
 * call is essential, can't justify a receptionist, reachable by mobile SMS.
 *
 * Usage:
 *   node scripts/collect-au-tradies.mjs                                # plumber only, all default free sources
 *   node scripts/collect-au-tradies.mjs --trades plumber,electrician   # multi-trade
 *   node scripts/collect-au-tradies.mjs --sources hipages,truelocal    # subset of sources
 *   node scripts/collect-au-tradies.mjs --skip-collect                 # only re-run import
 *   node scripts/collect-au-tradies.mjs --skip-import                  # only collect
 */

import { spawn } from "node:child_process";
import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

// Default to ONE trade so multi-trade scrapes are an explicit choice.
const DEFAULT_TRADES  = ["plumber"];
// serviceseeking is NOT in defaults because it doesn't expose phones
// publicly (gated behind quote-request login). Its rows are useful only as
// name+suburb feed for scripts/enrich-prospects-from-website.mjs.
const DEFAULT_SOURCES = ["hipages", "oneflare", "truelocal", "localsearch"];
const ALL_SOURCES     = ["hipages", "oneflare", "serviceseeking", "truelocal", "localsearch"];
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
  let skipCollect  = false;
  let skipImport   = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--trades":         trades = (args[++i] ?? "").split(",").map(s => s.trim()).filter(Boolean); break;
      case "--sources":        sources = (args[++i] ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean); break;
      case "--skip-collect":   skipCollect = true; break;
      case "--skip-import":    skipImport = true; break;
      case "--help":
        console.log(`
Usage: node scripts/collect-au-tradies.mjs [options]

Options:
  --sources <list>         Comma-separated sources (default: ${DEFAULT_SOURCES.join(",")})
                           One or more of: ${ALL_SOURCES.join(", ")}
                           (serviceseeking only useful as feed for prospects:enrich)
  --trades <list>          Comma-separated trades (default: ${DEFAULT_TRADES.join(",")})
  --skip-collect           Don't fetch; only import existing CSVs under ${OUTPUT_DIR}/
  --skip-import            Fetch only; skip the import-to-DB step
  --help                   Show this help
        `);
        process.exit(0);
    }
  }

  const unknown = sources.filter(s => !ALL_SOURCES.includes(s));
  if (unknown.length) {
    console.error(`Unknown source(s): ${unknown.join(", ")}. Valid: ${ALL_SOURCES.join(", ")}`);
    process.exit(1);
  }

  return { trades, sources, skipCollect, skipImport };
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

async function collectTrueLocal(trade) {
  console.log(`\n[truelocal] ${trade}`);
  await run("npx", ["tsx", "scripts/scrape-truelocal.ts", "--trade", trade], {});
}

async function collectLocalsearch(trade) {
  console.log(`\n[localsearch] ${trade}`);
  await run("npx", ["tsx", "scripts/scrape-localsearch.ts", "--trade", trade], {});
}

async function main() {
  const { trades, sources, skipCollect, skipImport } = parseArgs();

  console.log(`Sources:       ${sources.join(", ")}`);
  console.log(`Trades:        ${trades.join(", ")}`);
  console.log(`Output dir:    ${OUTPUT_DIR}`);
  console.log(`Skip collect:  ${skipCollect}`);
  console.log(`Skip import:   ${skipImport}\n`);

  // ── Phase 1: collect ────────────────────────────────────────────────────
  if (!skipCollect) {
    for (const trade of trades) {
      console.log(`\n────────── COLLECTING ${trade.toUpperCase()} ──────────`);
      for (const source of sources) {
        try {
          if      (source === "hipages")        await collectHipages(trade);
          else if (source === "oneflare")       await collectOneflare(trade);
          else if (source === "serviceseeking") await collectServiceSeeking(trade);
          else if (source === "truelocal")      await collectTrueLocal(trade);
          else if (source === "localsearch")    await collectLocalsearch(trade);
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
