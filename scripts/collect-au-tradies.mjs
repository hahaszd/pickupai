#!/usr/bin/env node
/**
 * National AU tradie lead-collection orchestrator.
 *
 * For each trade in TRADES, runs scripts/collect-leads.ts in --regions-dir mode
 * over scripts/au-regions/, then imports every produced CSV into the DB via
 * scripts/import-csv-to-db.ts.
 *
 * Tradie selection mirrors the ICP: small-business trades where a missed call
 * is essential to the business, can't justify a receptionist, and reachable by
 * mobile SMS.
 *
 * Usage:
 *   node scripts/collect-au-tradies.mjs                       # default trades, default cap
 *   node scripts/collect-au-tradies.mjs --skip-collect        # only re-run the import phase
 *   node scripts/collect-au-tradies.mjs --skip-import         # only collect; don't import
 *   node scripts/collect-au-tradies.mjs --max-requests 1500   # tighter cap (whole run)
 *   node scripts/collect-au-tradies.mjs --trades plumber,handyman
 */

import { spawn } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_TRADES = ["plumber", "electrician", "roofer", "handyman"];
const REGIONS_DIR = "scripts/au-regions";
const OUTPUT_DIR  = "data/leads";

// Production DB. Mirrors the hardcoded URL the other scripts/*.mjs already use,
// so the import phase writes to Neon (not the local SQLite file) when invoked
// from a dev machine with no DATABASE_URL in .env.
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://neondb_owner:npg_p7TKVWbOQy2F@ep-long-mountain-a75ui4v2-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";

function parseArgs() {
  const args = process.argv.slice(2);
  let trades = DEFAULT_TRADES;
  let maxRequests = 5000;
  let maxPerSuburb = 60;
  let skipCollect = false;
  let skipImport = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--trades":         trades = (args[++i] ?? "").split(",").map(s => s.trim()).filter(Boolean); break;
      case "--max-requests":   maxRequests = parseInt(args[++i] ?? "5000"); break;
      case "--max":            maxPerSuburb = parseInt(args[++i] ?? "60"); break;
      case "--skip-collect":   skipCollect = true; break;
      case "--skip-import":    skipImport = true; break;
      case "--help":
        console.log(`
Usage: node scripts/collect-au-tradies.mjs [options]

Options:
  --trades <list>          Comma-separated trades (default: ${DEFAULT_TRADES.join(",")})
  --max <n>                Max results per suburb (default: 60)
  --max-requests <n>       Hard cap on Pro requests PER TRADE (default: 5000)
  --skip-collect           Don't fetch; only import existing CSVs under ${OUTPUT_DIR}/
  --skip-import            Fetch only; skip the import-to-DB step
  --help                   Show this help
        `);
        process.exit(0);
    }
  }
  return { trades, maxRequests, maxPerSuburb, skipCollect, skipImport };
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

async function main() {
  const { trades, maxRequests, maxPerSuburb, skipCollect, skipImport } = parseArgs();

  console.log(`Trades:        ${trades.join(", ")}`);
  console.log(`Regions dir:   ${REGIONS_DIR}`);
  console.log(`Output dir:    ${OUTPUT_DIR}`);
  console.log(`Max/suburb:    ${maxPerSuburb}`);
  console.log(`Max requests:  ${maxRequests} per trade`);
  console.log(`Skip collect:  ${skipCollect}`);
  console.log(`Skip import:   ${skipImport}\n`);

  // ── Phase 1: collect ──────────────────────────────────────────────────────
  if (!skipCollect) {
    for (const trade of trades) {
      console.log(`\n────────── COLLECTING ${trade.toUpperCase()} ──────────`);
      try {
        await run("npx", [
          "tsx", "scripts/collect-leads.ts",
          "--trade", trade,
          "--regions-dir", REGIONS_DIR,
          "--output-dir", OUTPUT_DIR,
          "--max", String(maxPerSuburb),
          "--max-requests", String(maxRequests)
        ], {});
      } catch (err) {
        console.error(`Collect failed for ${trade}:`, err.message);
      }
    }
  } else {
    console.log("Skipping collect phase (--skip-collect).");
  }

  // ── Phase 2: import ───────────────────────────────────────────────────────
  if (skipImport) {
    console.log("\nSkipping import phase (--skip-import).");
    return;
  }

  console.log(`\n────────── IMPORTING TO DB ──────────`);
  for (const trade of trades) {
    const tradeDir = join(OUTPUT_DIR, trade);
    if (!existsSync(tradeDir)) {
      console.log(`(no CSVs in ${tradeDir} — skipping ${trade})`);
      continue;
    }
    const files = readdirSync(tradeDir).filter(f => f.endsWith(".csv"));
    for (const f of files) {
      const path = join(tradeDir, f);
      console.log(`\n→ ${path}`);
      try {
        await run("npx", ["tsx", "scripts/import-csv-to-db.ts", path], { DATABASE_URL });
      } catch (err) {
        console.error(`Import failed for ${path}:`, err.message);
      }
    }
  }

  console.log(`\nAll done. Run "node scripts/count-prospects.mjs" to inspect the resulting DB state.`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
