#!/usr/bin/env node
/**
 * Send a marketing-SMS variant batch via the admin send-selected-sms endpoint.
 *
 * SECURITY: ADMIN_TOKEN and BASE_URL are read from env. NEVER commit credentials.
 *
 * Usage:
 *   ADMIN_TOKEN=xxx BASE_URL=https://getpickupai.up.railway.app \
 *   node scripts/send-sms-batch.mjs \
 *     --variant A_reply_yes \
 *     --message-file scripts/variants/A.txt \
 *     --prospect-ids-file scripts/lists/test-batch-A.txt \
 *     [--dry-run]
 *     [--force]   # bypass quiet-hours guard (use only for testing your own number)
 *
 * --message-file / --prospect-ids-file: paths to text files. Use '-' to read from stdin.
 * --prospect-ids-file format: one prospect_id (UUID) per line; lines starting with # ignored.
 * --message-file: full SMS template, supports {name}, {pid}, {link} substitutions
 *                 (server-side rendered; this script just passes the raw template).
 *
 * Examples:
 *   node scripts/send-sms-batch.mjs --variant B_call_demo --message-file - --prospect-ids-file lists/B.txt --dry-run
 *
 * Exit codes: 0 = OK, 1 = bad args, 2 = network/server error
 */

import fs from "node:fs";
import process from "node:process";

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const BASE_URL = (process.env.BASE_URL ?? "").replace(/\/$/, "");

if (!ADMIN_TOKEN || !BASE_URL) {
  console.error("ERROR: ADMIN_TOKEN and BASE_URL env vars are required.");
  console.error("       Example: ADMIN_TOKEN=xxx BASE_URL=https://app.example.com node scripts/send-sms-batch.mjs ...");
  process.exit(1);
}

// ── Arg parsing ──────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") { out.dryRun = true; continue; }
    if (a === "--force") { out.force = true; continue; }
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

if (!args.variant) {
  console.error("ERROR: --variant <tag> is required (e.g. A_reply_yes)");
  console.error("       Variants are how we group sends for A/B comparison. Don't skip this.");
  process.exit(1);
}
if (!args.messageFile) {
  console.error("ERROR: --message-file <path|-> is required");
  process.exit(1);
}
if (!args.prospectIdsFile) {
  console.error("ERROR: --prospect-ids-file <path|-> is required");
  process.exit(1);
}

function readAll(pathOrDash) {
  if (pathOrDash === "-") {
    return fs.readFileSync(0, "utf-8");
  }
  if (!fs.existsSync(pathOrDash)) {
    console.error(`ERROR: file not found: ${pathOrDash}`);
    process.exit(1);
  }
  return fs.readFileSync(pathOrDash, "utf-8");
}

const message = readAll(args.messageFile).trim();
if (!message) {
  console.error("ERROR: message is empty");
  process.exit(1);
}
if (message.length > 320) {
  console.error(`WARN: message is ${message.length} chars (>2 SMS segments). Consider trimming.`);
}

const prospectIds = readAll(args.prospectIdsFile)
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith("#"));

if (prospectIds.length === 0) {
  console.error("ERROR: no prospect IDs found");
  process.exit(1);
}

// ── Confirmation summary ─────────────────────────────────────────────────
console.log("");
console.log("┌─ SMS BATCH SEND ──────────────────────────────────────────────");
console.log(`│ Variant:    ${args.variant}`);
console.log(`│ Recipients: ${prospectIds.length}`);
console.log(`│ Length:     ${message.length} chars (${Math.ceil(message.length / 160)} segment${message.length > 160 ? "s" : ""})`);
console.log(`│ Dry-run:    ${args.dryRun ? "YES (no actual send)" : "NO — will send live"}`);
console.log(`│ Force:      ${args.force ? "YES (bypass quiet hours)" : "no"}`);
console.log(`│ Endpoint:   ${BASE_URL}/admin/prospects/send-selected-sms`);
console.log("├─ MESSAGE ─────────────────────────────────────────────────────");
for (const ln of message.split("\n")) console.log(`│ ${ln}`);
console.log("├─ FIRST 5 PROSPECT IDs ────────────────────────────────────────");
for (const id of prospectIds.slice(0, 5)) console.log(`│ ${id}`);
if (prospectIds.length > 5) console.log(`│ ... + ${prospectIds.length - 5} more`);
console.log("└──────────────────────────────────────────────────────────────");
console.log("");

if (args.dryRun) {
  console.log("DRY RUN — no request sent. Re-run without --dry-run to send.");
  process.exit(0);
}

// ── Send ─────────────────────────────────────────────────────────────────
const params = new URLSearchParams();
params.append("message", message);
params.append("variant", args.variant);
if (args.force) params.append("force", "1");
for (const id of prospectIds) params.append("prospect_ids", id);

const url = `${BASE_URL}/admin/prospects/send-selected-sms${args.force ? "?force=1" : ""}`;
console.log(`POST ${url}`);

try {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-admin-token": ADMIN_TOKEN
    },
    body: params.toString(),
    redirect: "manual"
  });

  console.log(`Response status: ${resp.status}`);
  if (resp.status === 302 || resp.status === 301) {
    const location = resp.headers.get("location") || "";
    if (location.includes("flash=")) {
      const flash = decodeURIComponent(location.split("flash=")[1] || "");
      console.log(`Result: ${flash}`);
      if (flash.startsWith("⚠")) process.exit(2);
    } else {
      console.log(`Redirect to: ${location}`);
    }
    process.exit(0);
  }

  const text = await resp.text();
  console.log(`Body: ${text.slice(0, 500)}`);
  process.exit(resp.status >= 400 ? 2 : 0);
} catch (err) {
  console.error(`Request failed: ${err.message}`);
  process.exit(2);
}
