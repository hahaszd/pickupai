/**
 * Stage 1 of the email consent check: gather the EVIDENCE, judge nothing.
 *
 *   npx tsx scripts/collect-email-evidence.ts --limit 10 --state NSW
 *   npx tsx scripts/collect-email-evidence.ts --limit 10 --trade plumber
 *
 * READ-ONLY against the database. It never writes a prospect row and never
 * sends anything. Everything it produces lands under `data/email-evidence/`,
 * which is gitignored — the pages belong to other businesses.
 *
 * WHY THIS IS SPLIT FROM THE JUDGEMENT
 * ------------------------------------
 * Inferred consent under Schedule 2 cl 4(2) of the Spam Act 2003 turns on four
 * things, and only two of them are mechanical:
 *
 *   (b) conspicuously published      — mechanical: the address is on the page
 *   (c) published with the holder's  — mechanical-ish: is it on their own site
 *       agreement
 *   (d) NOT accompanied by a "no unsolicited commercial messages" statement
 *                                    — NOT mechanical. The Act says "or a
 *                                      statement to SIMILAR EFFECT", which no
 *                                      keyword list covers.
 *   relevance to their work function — not mechanical either
 *
 * A survey on 2026-08-10 ran a keyword regex over 26 NSW tradie sites and
 * reported zero refusal notices. That zero was worthless: the regex never
 * followed the privacy-policy link, which is where such a statement usually
 * lives. See BACKLOG.md. So this script's only job is to FETCH — the homepage,
 * the contact page, and every privacy/terms/legal page linked from them — and
 * hand the raw text to something that can read English.
 *
 * It also extracts candidate addresses without deciding whether they are any
 * good. In the same survey, `Hilltop Plumbing` yielded a font designer's
 * address out of a CSS licence comment and its web developer's address, and
 * neither belonged to the business. Deciding that is stage 2's job as well.
 *
 * Cost: A$0. Plain HTTP fetches of public pages, one business at a time.
 */
import dotenv from "dotenv";
dotenv.config();

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openDb } from "../src/db/db.js";

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1] ?? d) : d;
};

const LIMIT = Number(flag("limit", "10"));
const STATE = flag("state", "NSW")!;
const TRADE = flag("trade");
const OUT_DIR = flag("out", "./data/email-evidence")!;

/**
 * Rows that are in `prospects` but could never be a customer. The first run
 * spent 7 of its 23 reader agents — 30% of the budget — on the Electrical
 * Trades Union before anyone noticed it is a union, not a tradie. Suppliers
 * (Reece) turned up in an earlier sample the same way.
 *
 * Override with --exclude '<regex>', or --exclude '' to keep everything. What
 * gets dropped is always printed: a filter that silently shrinks the list reads
 * as "we covered everything" when it did not.
 */
const EXCLUDE = new RegExp(
  flag(
    "exclude",
    "\\b(union|association|institute|federation|council|chamber|academy|college|tafe|" +
      "supplies|supply|wholesale|wholesaler|distributor|trade centre|warehouse|bunnings|reece)\\b"
  )!,
  "i"
);

// Addresses that are technically on the page but are nobody's business contact.
const ASSET_RE = /\.(png|jpe?g|gif|webp|svg|css|js|woff2?)$/i;
const NOISE_RE = /(sentry|wixpress|@2x|example\.(com|org)|godaddy|squarespace|\.wordpress|placeholder|your-?email|domain\.com)/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Pages whose text can carry a cl 4(2)(d) statement. */
const POLICY_HINT = /(privacy|terms|legal|conditions|disclaimer|policy|policies)/i;
const CONTACT_HINT = /(contact|about|get-?in-?touch|enquir)/i;

type Fetched = { url: string; kind: string; ok: boolean; status: number | null; text: string; html: string };

async function get(url: string, ms = 15000): Promise<Fetched> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  const base = { url, kind: "", ok: false, status: null as number | null, text: "", html: "" };
  try {
    const r = await fetch(url, {
      signal: c.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!r.ok) return { ...base, status: r.status };
    const html = await r.text();
    return { ...base, url: r.url, ok: true, status: r.status, html, text: toText(html) };
  } catch {
    return base;
  } finally {
    clearTimeout(t);
  }
}

/**
 * HTML → readable text. Deliberately crude but lossless about the two things
 * that matter: the words of any policy statement, and mailto: targets (which
 * often never appear as visible text).
 */
function toText(html: string): string {
  const mailtos = [...html.matchAll(/mailto:([^"'?>\s]+)/gi)].map((m) => `mailto:${m[1]}`);
  const body = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    // NBSP written as an escape: a literal one is invisible in a diff.
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return mailtos.length ? `${body}\n\n[mailto links found: ${[...new Set(mailtos)].join(" ")}]` : body;
}

function linksFrom(html: string, base: string): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1];
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    try {
      const u = new URL(href, base);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      if (u.hostname !== new URL(base).hostname) continue; // own site only — cl 4(2)(c)
      out.push({ url: u.href.split("#")[0], label: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() });
    } catch {
      /* malformed href */
    }
  }
  return out;
}

function candidateEmails(text: string): string[] {
  return [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.replace(/\.$/, "")))].filter(
    (e) => !ASSET_RE.test(e) && !NOISE_RE.test(e)
  );
}

async function main() {
  if (!process.env.DATABASE_URL && !process.env.SQLITE_PATH) {
    console.error("Neither DATABASE_URL nor SQLITE_PATH is set — there is no database to read.");
    process.exit(2);
  }
  const db = await openDb(process.env.SQLITE_PATH ?? "./data/app.sqlite", process.env.DATABASE_URL);

  // Over-fetch so the exclusions below can be replaced rather than shrinking the
  // batch — --limit 10 should still deliver ten businesses worth reading.
  const candidates = db.all<any>(
    `SELECT prospect_id, business_name, trade_type, suburb, state, website, source
       FROM prospects
      WHERE state = ? AND website LIKE 'http%' AND unsubscribed_at IS NULL
        ${TRADE ? "AND trade_type = ?" : ""}
      ORDER BY prospect_id
      LIMIT ?`,
    TRADE ? [STATE, TRADE, LIMIT * 3] : [STATE, LIMIT * 3]
  );

  const dropped = candidates.filter((p) => EXCLUDE.source && EXCLUDE.test(p.business_name ?? ""));
  const rows = candidates.filter((p) => !dropped.includes(p)).slice(0, LIMIT);

  if (dropped.length) {
    console.log(`Excluded ${dropped.length} row(s) as not-a-tradie-business — check this list, it is a heuristic:`);
    for (const d of dropped) console.log(`  · ${d.business_name}`);
    console.log("");
  }

  if (!rows.length) {
    console.error(`No prospects matched state=${STATE}${TRADE ? ` trade=${TRADE}` : ""}.`);
    process.exit(1);
  }

  const stamp = new Date().toISOString();
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Collecting evidence for ${rows.length} prospects → ${OUT_DIR}\n`);

  const index: any[] = [];

  for (const p of rows) {
    const dir = join(OUT_DIR, p.prospect_id);
    await mkdir(dir, { recursive: true });

    const home = await get(p.website);
    const pages: Fetched[] = [];
    if (home.ok) pages.push({ ...home, kind: "homepage" });

    if (home.ok) {
      const links = linksFrom(home.html, home.url);
      const wanted: { url: string; kind: string }[] = [];
      for (const l of links) {
        const hay = `${l.url} ${l.label}`;
        if (POLICY_HINT.test(hay)) wanted.push({ url: l.url, kind: "policy" });
        else if (CONTACT_HINT.test(hay)) wanted.push({ url: l.url, kind: "contact" });
      }
      // Policy pages first, and cap so one sprawling site cannot dominate a run.
      const seen = new Set([home.url]);
      const ordered = [...wanted.filter((w) => w.kind === "policy"), ...wanted.filter((w) => w.kind === "contact")];
      for (const w of ordered) {
        if (seen.has(w.url) || seen.size > 6) continue;
        seen.add(w.url);
        const f = await get(w.url, 12000);
        if (f.ok) pages.push({ ...f, kind: w.kind });
      }
    }

    const files: any[] = [];
    for (const [i, pg] of pages.entries()) {
      const file = `${String(i).padStart(2, "0")}-${pg.kind}.txt`;
      await writeFile(join(dir, file), `SOURCE-URL: ${pg.url}\nFETCHED-AT: ${stamp}\n\n${pg.text}`, "utf8");
      files.push({ file, url: pg.url, kind: pg.kind, chars: pg.text.length });
    }

    const emails = candidateEmails(pages.map((p2) => p2.text).join("\n"));
    const record = {
      prospect_id: p.prospect_id,
      business_name: p.business_name,
      trade_type: p.trade_type,
      suburb: p.suburb,
      state: p.state,
      source: p.source,
      website: p.website,
      fetched_at: stamp,
      reachable: home.ok,
      http_status: home.status,
      candidate_emails: emails,
      pages: files,
    };
    await writeFile(join(dir, "manifest.json"), JSON.stringify(record, null, 2), "utf8");
    index.push(record);

    const tag = !home.ok ? `UNREACHABLE (${home.status ?? "no response"})` : `${files.length} page(s), ${emails.length} candidate address(es)`;
    console.log(`  ${p.business_name.padEnd(38).slice(0, 38)} ${tag}`);
  }

  await writeFile(join(OUT_DIR, "index.json"), JSON.stringify({ collected_at: stamp, state: STATE, trade: TRADE ?? null, prospects: index }, null, 2), "utf8");

  const reach = index.filter((r) => r.reachable);
  const pagesTotal = index.reduce((n, r) => n + r.pages.length, 0);
  console.log(`\nreachable ${reach.length}/${index.length} · ${pagesTotal} pages saved · ${index.reduce((n, r) => n + r.candidate_emails.length, 0)} candidate addresses`);
  console.log(`\nNOTHING HAS BEEN JUDGED YET. Every address above is a candidate and every`);
  console.log(`page is unread. Stage 2 reads them one at a time; stage 3 verifies the quotes.`);
  console.log(`Index: ${join(OUT_DIR, "index.json")}`);
  process.exit(0);
}

void main();
