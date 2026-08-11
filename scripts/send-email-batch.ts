/**
 * Send one variant of the cold-email sequence to the verified batch.
 *
 *   npx tsx scripts/send-email-batch.ts                       # DRY RUN, variant 1-opener
 *   npx tsx scripts/send-email-batch.ts --variant 3-pain      # dry-run another touch
 *   npx tsx scripts/send-email-batch.ts --send                # actually send
 *   npx tsx scripts/send-email-batch.ts --send --only <id,id> # subset
 *   npx tsx scripts/send-email-batch.ts --exclude <id,id>     # e.g. repliers
 *
 * DRY RUN IS THE DEFAULT and needs no marketing env vars: it renders every
 * message with loud placeholders, runs every check that can run, and writes
 * the exact previews to data/email-evidence/preview-<variant>/ for the owner
 * to read. `--send` refuses unless OUTREACH_SENDER_LEGAL_NAME,
 * OUTREACH_SENDER_CONTACT_EMAIL, OUTREACH_UNSUBSCRIBE_SECRET and a https
 * PUBLIC_BASE_URL are set.
 *
 * THE ORDER OF CHECKS PER RECIPIENT, none skippable:
 *   1. register↔batch join on prospect_id — the address comes ONLY from the
 *      consent register; the batch file holds merge fields and no addresses,
 *      so a transcription slip between the two is a refusal, not a mis-send.
 *   2. emailPreSendCheck against the LIVE prospects row — suppression is read
 *      at send time, not register-compile time; an SMS STOP that arrived
 *      yesterday blocks today's email.
 *   3. idempotency — an outreach_log row for this prospect+variant means it
 *      was already sent; refuse the duplicate.
 *   4. render (throws on any unreplaced token) → buildMarketingEmail (throws
 *      on missing s 17/s 18 pieces) → auditMarketingEmail (independent
 *      re-check of the rendered result).
 *   5. only then SMTP; then outreach_log with the full rendered body (the
 *      s 16(5) record), then prospects.last_contacted_at, then db.flush().
 *
 * Send-day rules (LISTS.md): the whole batch goes in ONE day — ACMA's penalty
 * arithmetic is per day, summed across days. Check the contact mailbox daily
 * afterwards; a reply-unsubscribe is honoured same-day via
 * markProspectUnsubscribed().
 */
import dotenv from "dotenv";
dotenv.config();

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import nodemailer from "nodemailer";
import { openDb } from "../src/db/db.js";
import { createOutreachLog } from "../src/db/repo.js";
import {
  emailPreSendCheck,
  buildMarketingEmail,
  auditMarketingEmail,
  assertMarketingEmailConfigured,
  unsubscribeUrlFor,
  type SenderIdentity,
} from "../src/outreach/email-compliance.js";
import {
  renderOutreachEmail,
  type OutreachRecipient,
} from "../src/outreach/render-outreach-email.js";

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1] ?? d) : d;
};
const SEND = args.includes("--send");
const VARIANT = flag("variant", "1-opener")!;
const ONLY = flag("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const EXCLUDE = new Set(flag("exclude")?.split(",").map((s) => s.trim()).filter(Boolean) ?? []);

const REGISTER_PATH = flag("register", "./data/email-evidence/consent-register-2026-08-10.json")!;
const BATCH_PATH = flag("batch", "./data/email-evidence/batch-2026-08.json")!;
const TEMPLATE_PATH = `./scripts/email-variants/${VARIANT}.txt`;
const DELAY_MS = 5_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!process.env.DATABASE_URL && !process.env.SQLITE_PATH) {
    console.error("Neither DATABASE_URL nor SQLITE_PATH is set — there is no database to read.");
    process.exit(2);
  }

  const register = JSON.parse(readFileSync(REGISTER_PATH, "utf8"));
  const batch = JSON.parse(readFileSync(BATCH_PATH, "utf8"));
  const template = readFileSync(TEMPLATE_PATH, "utf8");
  const signature = process.env.OUTREACH_SIGNATURE_NAME ?? batch.signatureName ?? "Simon";

  const emailByProspect = new Map<string, string>(
    (register.keep as Array<{ prospect_id: string; email: string }>).map((k) => [k.prospect_id, k.email])
  );

  // ── Sender identity: real for --send, loud placeholders for dry-run ────────
  let sender: SenderIdentity;
  let unsubFor: (pid: string) => string;
  if (SEND) {
    const cfg = {
      legalName: process.env.OUTREACH_SENDER_LEGAL_NAME,
      contactEmail: process.env.OUTREACH_SENDER_CONTACT_EMAIL,
      unsubscribeSecret: process.env.OUTREACH_UNSUBSCRIBE_SECRET,
      publicBaseUrl: process.env.PUBLIC_BASE_URL,
    };
    assertMarketingEmailConfigured(cfg); // throws with the missing-var list
    sender = {
      legalName: cfg.legalName,
      tradingName: process.env.OUTREACH_SENDER_TRADING_NAME ?? "PickupAI",
      abn: process.env.OUTREACH_SENDER_ABN,
      contactEmail: cfg.contactEmail,
      contactPhone: process.env.OUTREACH_SENDER_CONTACT_PHONE,
      postalAddress: process.env.OUTREACH_SENDER_POSTAL_ADDRESS,
    };
    unsubFor = (pid) => unsubscribeUrlFor(pid, cfg.unsubscribeSecret, cfg.publicBaseUrl);
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error("--send needs SMTP_HOST / SMTP_USER / SMTP_PASS.");
      process.exit(2);
    }
  } else {
    sender = {
      legalName: process.env.OUTREACH_SENDER_LEGAL_NAME ?? "⚠PLACEHOLDER-LEGAL-NAME⚠",
      tradingName: process.env.OUTREACH_SENDER_TRADING_NAME ?? "PickupAI",
      abn: process.env.OUTREACH_SENDER_ABN,
      contactEmail: process.env.OUTREACH_SENDER_CONTACT_EMAIL ?? "placeholder@example.invalid",
      contactPhone: process.env.OUTREACH_SENDER_CONTACT_PHONE,
      postalAddress: process.env.OUTREACH_SENDER_POSTAL_ADDRESS,
    };
    unsubFor = (pid) =>
      process.env.OUTREACH_UNSUBSCRIBE_SECRET && process.env.PUBLIC_BASE_URL?.startsWith("https://")
        ? unsubscribeUrlFor(pid, process.env.OUTREACH_UNSUBSCRIBE_SECRET, process.env.PUBLIC_BASE_URL)
        : `https://PLACEHOLDER.invalid/u/${pid}`;
  }

  const db = await openDb(process.env.SQLITE_PATH ?? "./data/app.sqlite", process.env.DATABASE_URL);

  const previewDir = `./data/email-evidence/preview-${VARIANT}`;
  if (!SEND) mkdirSync(previewDir, { recursive: true });

  const transporter = SEND
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 465),
        secure: (process.env.SMTP_SECURE ?? "true") === "true",
        auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
      })
    : null;

  const results: Array<{ id: string; name: string; outcome: string }> = [];
  let sent = 0;

  const recipients: OutreachRecipient[] = (batch.recipients as OutreachRecipient[])
    .filter((r) => (ONLY ? ONLY.includes(r.prospect_id) : true))
    .filter((r) => !EXCLUDE.has(r.prospect_id));

  console.log(
    `${SEND ? "SENDING" : "DRY RUN"} · variant=${VARIANT} · ${recipients.length} recipient(s) · signature=${signature}\n`
  );

  for (const r of recipients) {
    const label = r.displayName.padEnd(34).slice(0, 34);

    // 1. Address only from the register.
    const email = emailByProspect.get(r.prospect_id);
    if (!email) {
      results.push({ id: r.prospect_id, name: r.displayName, outcome: "REFUSED: not in consent register" });
      console.log(`  ${label} REFUSED — prospect_id not in the consent register`);
      continue;
    }

    // 2. Live suppression state, read now.
    const row = db.get<any>(
      `SELECT prospect_id, status, unsubscribed_at FROM prospects WHERE prospect_id = ?`,
      [r.prospect_id]
    );
    if (!row) {
      results.push({ id: r.prospect_id, name: r.displayName, outcome: "REFUSED: prospect row missing" });
      console.log(`  ${label} REFUSED — no prospects row`);
      continue;
    }
    const gate = emailPreSendCheck({ prospect_id: r.prospect_id, email, status: row.status, unsubscribed_at: row.unsubscribed_at });
    if (!gate.ok) {
      results.push({ id: r.prospect_id, name: r.displayName, outcome: `BLOCKED: ${gate.reason}` });
      console.log(`  ${label} BLOCKED — ${gate.reason}`);
      continue;
    }

    // 3. Never the same variant twice.
    const already = db.get<any>(
      `SELECT log_id FROM outreach_log WHERE prospect_id = ? AND channel = 'email' AND variant = ?`,
      [r.prospect_id, VARIANT]
    );
    if (already) {
      results.push({ id: r.prospect_id, name: r.displayName, outcome: "SKIPPED: already sent this variant" });
      console.log(`  ${label} SKIPPED — ${VARIANT} already sent`);
      continue;
    }

    // 4. Render → build → audit. Any throw stops the whole run: a defect in
    // one message is a defect in the template or the pipeline, not the row.
    const { subject, body } = renderOutreachEmail(template, r, signature);
    const msg = buildMarketingEmail({ to: email, subject, body, sender, unsubscribeUrl: unsubFor(r.prospect_id) });
    const audit = auditMarketingEmail(msg);
    if (!audit.ok) {
      console.error(`AUDIT FAILED for ${r.displayName}: missing ${audit.missing.join(", ")} — aborting the run.`);
      process.exit(1);
    }

    if (!SEND) {
      const file = join(previewDir, `${r.prospect_id}.txt`);
      writeFileSync(file, `To: ${email}\nSubject: ${msg.subject}\n\n${msg.text}`, "utf8");
      results.push({ id: r.prospect_id, name: r.displayName, outcome: `preview → ${file}` });
      console.log(`  ${label} rendered → ${file}`);
      continue;
    }

    // 5. Send, record, and only count it sent once the record exists.
    try {
      await transporter!.sendMail({
        from: `"${signature} from PickupAI" <${sender.contactEmail}>`,
        to: msg.to,
        replyTo: msg.replyTo,
        subject: msg.subject,
        text: msg.text,
        headers: msg.headers,
      });
      createOutreachLog(db, {
        prospect_id: r.prospect_id,
        channel: "email",
        message: `Subject: ${msg.subject}\n\n${msg.text}`,
        status: "sent",
        variant: VARIANT,
      });
      db.run(`UPDATE prospects SET last_contacted_at = ? WHERE prospect_id = ?`, [
        new Date().toISOString(),
        r.prospect_id,
      ]);
      await db.flush(); // ADR-0002 logic: the send already happened; losing its record is the worst outcome.
      sent++;
      results.push({ id: r.prospect_id, name: r.displayName, outcome: `SENT to ${email}` });
      console.log(`  ${label} SENT → ${email}`);
    } catch (err: any) {
      // Record the attempt too — an SMTP failure after acceptance is ambiguous,
      // and an unrecorded maybe-send is worse than a recorded failure.
      createOutreachLog(db, {
        prospect_id: r.prospect_id,
        channel: "email",
        message: `Subject: ${msg.subject}\n\n[SEND FAILED: ${err?.message ?? "unknown"}]`,
        status: "failed",
        variant: VARIANT,
      });
      await db.flush();
      results.push({ id: r.prospect_id, name: r.displayName, outcome: `FAILED: ${err?.message ?? "unknown"}` });
      console.log(`  ${label} FAILED — ${err?.message ?? "unknown"}`);
    }
    await sleep(DELAY_MS);
  }

  const counts: Record<string, number> = {};
  for (const x of results) counts[x.outcome.split(":")[0].split(" ")[0]] = (counts[x.outcome.split(":")[0].split(" ")[0]] ?? 0) + 1;
  console.log(`\nSummary: ${JSON.stringify(counts)}${SEND ? ` · ${sent} sent` : ""}`);
  if (!SEND) {
    console.log(`\nRead the previews in ${previewDir}/ — that is EXACTLY what would be sent.`);
    console.log(`Nothing was sent and nothing was written to the database.`);
  }
  process.exit(0);
}

void main();
