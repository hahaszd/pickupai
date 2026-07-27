/**
 * Build a full picture of one signup: who they are, what they did, and — the
 * part that matters — where they came from.
 *
 *   npx tsx scripts/tenant-profile.ts                    # list recent signups
 *   npx tsx scripts/tenant-profile.ts <tenant_id>
 *   npx tsx scripts/tenant-profile.ts --phone 0412345678
 *   npx tsx scripts/tenant-profile.ts --latest           # most recent signup
 *
 * Needs DATABASE_URL (or a local SQLITE_PATH). Read-only — it never writes.
 *
 * The attribution question is the point. A signup whose phone matches a
 * scraped prospect who was texted weeks earlier is a *delayed conversion*,
 * which means the SMS channel had a longer lag than we assumed rather than
 * being dead. A signup with no prospect match and no funnel events arrived
 * some other way, and that way is worth knowing.
 */
import { openDb } from "../src/db/db.js";
import { toE164Au } from "../src/utils/phone.js";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name: string) => args.includes(`--${name}`);
const positional = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));

const h = (title: string) => console.log(`\n${"─".repeat(64)}\n${title}\n${"─".repeat(64)}`);
const row = (label: string, value: unknown) =>
  console.log(`  ${label.padEnd(22)} ${value === null || value === undefined || value === "" ? "—" : value}`);
const days = (from: string, to: string) =>
  Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);

async function main() {
  const db = await openDb(process.env.SQLITE_PATH ?? "./data/app.sqlite", process.env.DATABASE_URL);

  // ── Pick the tenant ────────────────────────────────────────────────────────
  let tenant: any = null;

  if (has("latest")) {
    tenant = db.get(`SELECT * FROM tenants ORDER BY created_at DESC LIMIT 1`);
  } else if (flag("phone")) {
    tenant = db.get(`SELECT * FROM tenants WHERE owner_phone = ?`, [toE164Au(flag("phone")!)]);
  } else if (positional) {
    tenant = db.get(`SELECT * FROM tenants WHERE tenant_id = ?`, [positional]);
  } else {
    h("Recent signups");
    const recent = db.all<any>(
      `SELECT tenant_id, name, trade_type, owner_phone, payment_status, created_at
       FROM tenants ORDER BY created_at DESC LIMIT 15`
    );
    for (const t of recent) {
      console.log(`  ${t.created_at.slice(0, 16).replace("T", " ")}  ${String(t.payment_status ?? "—").padEnd(8)}  ${String(t.trade_type ?? "—").padEnd(12)}  ${t.name}`);
      console.log(`  ${" ".repeat(18)}${t.tenant_id}  ${t.owner_phone ?? "—"}`);
    }
    console.log(`\nRun again with a tenant_id, or --latest.`);
    return;
  }

  if (!tenant) {
    console.error("No tenant matched.");
    process.exit(1);
  }

  const now = new Date().toISOString();

  // ── Who ────────────────────────────────────────────────────────────────────
  h(`Signup — ${tenant.name}`);
  row("tenant_id", tenant.tenant_id);
  row("Trade", tenant.trade_type);
  row("Signed up", `${tenant.created_at} (${days(tenant.created_at, now)} days ago)`);
  row("Owner phone", tenant.owner_phone);
  row("Owner email", tenant.owner_email);
  row("Payment status", tenant.payment_status);
  row("Trial ends", tenant.trial_ends_at);
  row("Stripe customer", tenant.stripe_customer_id ? "yes — reached checkout" : "no");
  row("Last login", tenant.last_login_at ?? "never logged back in");
  row("Service area", tenant.service_area);
  row("Custom instructions", tenant.custom_instructions ? "set" : "none");

  // ── Did they actually set the product up? ──────────────────────────────────
  //
  // This is the strongest tell. A competitor kicking tyres explores the demo
  // and stops. Someone who provisioned a number, forwarded their calls and
  // customised the assistant is running a business on it.
  h("Setup — did they commit?");
  const provisioned = tenant.twilio_number && !String(tenant.twilio_number).startsWith("+PENDING");
  row("Number", tenant.twilio_number);
  row("Provisioned", provisioned ? "YES — a real number was purchased" : "no (still pending)");
  row("Provision status", tenant.provision_status);
  row("Provision error", tenant.provision_error);

  const realCalls = db.get<{ n: number }>(
    `SELECT COUNT(*) n FROM calls WHERE tenant_id = ? AND is_demo = 0 AND status IS NOT NULL`,
    [tenant.tenant_id]
  )?.n ?? 0;
  const demoCalls = db.get<{ n: number }>(
    `SELECT COUNT(*) n FROM calls WHERE tenant_id = ? AND is_demo = 1`,
    [tenant.tenant_id]
  )?.n ?? 0;
  const leads = db.get<{ n: number }>(`SELECT COUNT(*) n FROM leads WHERE tenant_id = ?`, [tenant.tenant_id])?.n ?? 0;

  row("Demo calls", demoCalls);
  row("REAL calls", `${realCalls}${realCalls > 0 ? "  ← forwarding is live" : "  ← never forwarded their phone"}`);
  row("Leads captured", leads);

  const verdict =
    realCalls > 0 ? "Real customer — their phone is actually forwarding to us."
    : provisioned && demoCalls > 0 ? "Engaged but not committed — took a number, tried the demo, never forwarded."
    : demoCalls > 0 ? "Tyre-kicker — demo only."
    : "Signed up and did nothing. Competitor or abandoned signup.";
  console.log(`\n  VERDICT: ${verdict}`);

  // ── Where did they come from? ──────────────────────────────────────────────
  h("Attribution — how did they find us?");
  const prospect = db.get<any>(`SELECT * FROM prospects WHERE phone = ?`, [tenant.owner_phone]);

  if (prospect) {
    row("Prospect match", `YES — ${prospect.business_name}`);
    row("Prospect source", prospect.source);
    row("Scraped on", prospect.created_at);
    row("Prospect status", prospect.status);

    const outreach = db.all<any>(
      `SELECT channel, status, variant, sent_at, link_clicked_at, replied_at
       FROM outreach_log WHERE prospect_id = ? ORDER BY sent_at ASC`,
      [prospect.prospect_id]
    );
    console.log(`\n  Outreach history (${outreach.length}):`);
    for (const o of outreach) {
      const bits = [
        o.sent_at?.slice(0, 16).replace("T", " "),
        o.channel,
        o.status,
        o.variant ? `variant=${o.variant}` : null,
        o.link_clicked_at ? "CLICKED" : null,
        o.replied_at ? "REPLIED" : null
      ].filter(Boolean);
      console.log(`    ${bits.join("  ")}`);
    }

    const lastMarketing = outreach.filter((o) => o.channel !== "signup").pop();
    if (lastMarketing) {
      const lag = days(lastMarketing.sent_at, tenant.created_at);
      console.log(
        `\n  ► DELAYED CONVERSION: last contacted ${lag} days before signing up.` +
        (lag > 14
          ? `\n    That is well outside the window the SMS campaign was measured over —\n    the channel may have a far longer lag than it was judged on.`
          : "")
      );
    }
  } else {
    row("Prospect match", "NO — never in the outreach list");
    console.log(
      `\n  ► ORGANIC. They were never texted, so they found us some other way:\n` +
      `    word of mouth, a direct visit, or search. Check GA4 for the referrer\n` +
      `    around ${tenant.created_at.slice(0, 10)}.`
    );
  }

  // ── Funnel events (PG-native, survives the blob) ───────────────────────────
  if (db.pg && prospect) {
    const { rows } = await db.pg.query(
      `SELECT event, variant, occurred_at FROM funnel_events
       WHERE prospect_id = $1 ORDER BY occurred_at ASC`,
      [prospect.prospect_id]
    );
    h(`Funnel events (${rows.length})`);
    for (const r of rows) {
      console.log(`  ${new Date(r.occurred_at).toISOString().slice(0, 16).replace("T", " ")}  ${r.event}${r.variant ? `  variant=${r.variant}` : ""}`);
    }
    if (rows.length === 0) console.log("  none — they never hit a tracked link");
  }

  // ── What the app logged about them ─────────────────────────────────────────
  const events = db.all<any>(
    `SELECT event_name, level, payload_json, created_at FROM analytics_events
     WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 40`,
    [tenant.tenant_id]
  );
  h(`Analytics events (${events.length})`);
  for (const e of events) {
    const payload = e.payload_json && e.payload_json !== "{}" ? `  ${String(e.payload_json).slice(0, 90)}` : "";
    console.log(`  ${e.created_at.slice(0, 16).replace("T", " ")}  ${String(e.level).padEnd(5)} ${e.event_name}${payload}`);
  }

  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
