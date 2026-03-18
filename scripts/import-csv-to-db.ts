#!/usr/bin/env npx tsx
/**
 * One-time script to import leads CSV into the prospects table.
 * Usage: npx tsx scripts/import-csv-to-db.ts [csv-file]
 */
import { readFileSync } from "fs";
import { config } from "dotenv";
config();

import { openDb } from "../src/db/db.js";
import { importProspects } from "../src/db/repo.js";

async function main() {
  const csvPath = process.argv[2] ?? "leads-all-combined.csv";
  console.log(`Reading ${csvPath}...`);
  const text = readFileSync(csvPath, "utf-8");
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  if (lines.length < 2) {
    console.error("CSV must have a header + at least 1 data row");
    process.exit(1);
  }

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const rows: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { vals.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    vals.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ""; });
    if (!row.business_name) continue;

    rows.push({
      business_name: row.business_name,
      owner_name: row.owner_name || null,
      phone: row.phone || null,
      email: row.email || null,
      website: row.website || null,
      trade_type: row.trade_type || null,
      suburb: row.suburb || null,
      state: row.state || "NSW",
      source: row.source || "google_places",
      google_rating: row.google_rating ? parseFloat(row.google_rating) : null,
      review_count: row.review_count ? parseInt(row.review_count) : null,
      notes: null,
      last_contacted_at: null,
      next_followup_at: null
    });
  }

  console.log(`Parsed ${rows.length} rows from CSV.`);

  const sqlitePath = process.env.SQLITE_PATH ?? "./data/app.sqlite";
  const pgUrl = process.env.DATABASE_URL;
  const db = await openDb(sqlitePath, pgUrl);

  const result = importProspects(db, rows);
  console.log(`Imported: ${result.imported}`);
  console.log(`Skipped (duplicate phone): ${result.skipped}`);

  // Trigger a save if PG-backed
  if (pgUrl) {
    console.log("Flushing to PostgreSQL...");
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log("Done.");
  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
