#!/usr/bin/env node
/**
 * Build the 200-prospect controlled A/B test batch.
 *
 * Picks fresh, never-contacted, AU-mobile, license-register-sourced prospects
 * matching the trade/state/suburb criteria, then stratifies them across
 * `n` variant buckets so each bucket has the same suburb mix (controls for
 * geographic confounds in the comparison).
 *
 * Writes one `scripts/lists/<run-id>-<variant>.txt` file per variant —
 * each containing the prospect_ids to feed into `send-sms-batch.mjs`.
 *
 * Read-only against the DB. Does NOT send anything.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/build-test-batch.mjs \
 *     --variants A_reply_yes,B_call_demo,C_social_proof,D_trial \
 *     --per-variant 50 \
 *     --trade plumber \
 *     --state NSW \
 *     [--source-prefix licenses_]   # only pull from license-register scrapers
 *     [--exclude-batch-1]           # skip anyone already SMSed (default: true)
 *     [--seed 42]                   # for reproducible randomisation
 *     [--out-prefix scripts/lists/run-2026-04-30]
 */

import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL env var required");
  process.exit(1);
}

function parseArgs(argv) {
  const out = { excludeBatch1: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-exclude-batch-1") { out.excludeBatch1 = false; continue; }
    if (a === "--exclude-batch-1") { out.excludeBatch1 = true; continue; }
    if (a.startsWith("--")) {
      const key = a.slice(2).replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
      const val = argv[i + 1];
      if (val === undefined || val.startsWith("--")) {
        console.error(`ERROR: --${a.slice(2)} requires a value`);
        process.exit(1);
      }
      out[key] = val;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const variants = (args.variants ?? "").split(",").map(s => s.trim()).filter(Boolean);
const perVariant = parseInt(args.perVariant ?? "50", 10);
const trade = args.trade ?? "plumber";
const state = args.state ?? "NSW";
const sourcePrefix = args.sourcePrefix ?? "licenses_";
const seed = parseInt(args.seed ?? String(Date.now() % 1000000), 10);
const outPrefix = args.outPrefix ?? `scripts/lists/run-${new Date().toISOString().slice(0, 10)}`;

if (variants.length === 0) {
  console.error("ERROR: --variants is required (comma-separated, e.g. A,B,C,D)");
  process.exit(1);
}

const totalNeeded = variants.length * perVariant;

// Mulberry32 PRNG — small, deterministic, good enough for shuffle
function mulberry32(s) {
  return function () {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(seed);
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  console.log(`Building test batch: ${variants.length} variants × ${perVariant} prospects = ${totalNeeded} total`);
  console.log(`Trade: ${trade}  State: ${state}  Source prefix: "${sourcePrefix}"  Seed: ${seed}`);
  console.log(`Exclude batch 1: ${args.excludeBatch1}`);

  const res = await pool.query("SELECT data FROM sqlite_blob WHERE id = 'main'");
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(res.rows[0].data));

  const queryAll = (sql, params = []) => {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return out;
  };

  // Build the candidate pool. Filters:
  //   - matching trade
  //   - matching state
  //   - source LIKE prefix (license-register-only by default)
  //   - has phone, not unsubscribed, status in {new}
  //   - phone is AU mobile (starts with +614)
  //   - never contacted before (last_contacted_at IS NULL) so we don't double-send
  const candidates = queryAll(
    `SELECT prospect_id, business_name, phone, suburb, source, status, last_contacted_at, unsubscribed_at
     FROM prospects
     WHERE LOWER(trade_type) = LOWER(?)
       AND state = ?
       AND source LIKE ?
       AND phone IS NOT NULL
       AND substr(phone, 1, 4) = '+614'
       AND unsubscribed_at IS NULL
       AND status = 'new'
       AND (last_contacted_at IS NULL OR ? = 0)`,
    [trade, state, `${sourcePrefix}%`, args.excludeBatch1 ? 1 : 0]
  );

  console.log(`\nCandidate pool: ${candidates.length} prospects`);

  if (candidates.length < totalNeeded) {
    console.error(`\nERROR: not enough candidates (need ${totalNeeded}, have ${candidates.length}).`);
    console.error(`       Loosen filters: drop --source-prefix, broaden --trade, or set --no-exclude-batch-1.`);
    process.exit(2);
  }

  // ── Stratification: bucket candidates by suburb, distribute round-robin ──
  // This guarantees each variant bucket sees the same suburb mix, so a high
  // STOP rate in one bucket can't be blamed on "you sent to grumpier suburbs".
  const bySuburb = new Map();
  for (const c of candidates) {
    const k = c.suburb || "unknown";
    if (!bySuburb.has(k)) bySuburb.set(k, []);
    bySuburb.get(k).push(c);
  }

  const buckets = variants.map(() => []);
  // Shuffle within suburb, then distribute round-robin across buckets
  for (const [, list] of bySuburb) {
    const shuffled = shuffle(list);
    for (let i = 0; i < shuffled.length; i++) {
      const b = i % buckets.length;
      if (buckets[b].length < perVariant) {
        buckets[b].push(shuffled[i]);
      }
    }
  }

  // Top-up if any bucket is short (some suburbs may have run out)
  const leftover = shuffle(candidates.filter(c => !buckets.some(b => b.includes(c))));
  let li = 0;
  for (const b of buckets) {
    while (b.length < perVariant && li < leftover.length) {
      b.push(leftover[li++]);
    }
  }

  // Verify and write
  const outDir = path.dirname(outPrefix);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log("");
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const bucket = buckets[i];
    if (bucket.length < perVariant) {
      console.warn(`WARN: variant ${v} has only ${bucket.length} / ${perVariant} prospects`);
    }
    const filePath = `${outPrefix}-${v}.txt`;
    const lines = [
      `# Test batch for variant ${v}`,
      `# Generated: ${new Date().toISOString()}`,
      `# Seed: ${seed}  Trade: ${trade}  State: ${state}  Source: ${sourcePrefix}*`,
      `# Total: ${bucket.length} prospects`,
      "",
      ...bucket.map(c => `${c.prospect_id}  # ${c.business_name} (${c.suburb || "?"})`)
    ];
    fs.writeFileSync(filePath, lines.join("\n") + "\n");
    console.log(`Wrote ${filePath} (${bucket.length} prospects)`);
  }

  // Summary: suburb distribution per bucket
  console.log("\nSuburb distribution per bucket (top 5 each):");
  for (let i = 0; i < variants.length; i++) {
    const counts = new Map();
    for (const c of buckets[i]) {
      const k = c.suburb || "unknown";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log(`  ${variants[i]}: ${top.map(([s, n]) => `${s}=${n}`).join(", ")}${counts.size > 5 ? `  (+${counts.size - 5} more)` : ""}`);
  }

  console.log("\nNext steps:");
  console.log("  1. Review the generated lists.");
  console.log("  2. For each variant, run:");
  console.log(`       ADMIN_TOKEN=xxx BASE_URL=https://... node scripts/send-sms-batch.mjs \\`);
  console.log(`         --variant <variant_tag> \\`);
  console.log(`         --message-file scripts/variants/<variant_tag>.txt \\`);
  console.log(`         --prospect-ids-file ${outPrefix}-<variant_tag>.txt \\`);
  console.log(`         --dry-run`);
  console.log("  3. Drop --dry-run when ready. Send all 4 within the same hour to control time-of-day.");
  console.log("  4. Wait 72hr, then run scripts/measure-variants.mjs.");
} finally {
  await pool.end();
}
