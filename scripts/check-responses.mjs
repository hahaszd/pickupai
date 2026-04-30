import initSqlJs from "sql.js";
import pg from "pg";

// Credentials from env. Pre-existing hardcoded value was rotated out.
//   DATABASE_URL=postgresql://... node scripts/check-responses.mjs
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL env var required.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  const res = await pool.query("SELECT data FROM sqlite_blob WHERE id = 'main'");
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(res.rows[0].data));

  // 1. Outreach log SMS entries
  console.log("=== OUTREACH LOG (SMS sends) ===");
  const logs = [];
  const s1 = db.prepare("SELECT * FROM outreach_log WHERE channel = 'sms' ORDER BY sent_at DESC LIMIT 110");
  while (s1.step()) logs.push(s1.getAsObject());
  s1.free();
  console.log(`Total SMS outreach log entries: ${logs.length}`);
  
  const statusCounts = {};
  logs.forEach(l => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });
  console.log("SMS delivery statuses:", JSON.stringify(statusCounts));

  console.log("\nLatest 5 outreach logs:");
  logs.slice(0, 5).forEach(l => {
    console.log(`  ${l.sent_at} | status=${l.status} | sid=${l.twilio_sid || 'none'} | prospect=${l.prospect_id}`);
  });

  // 2. Prospect status distribution
  console.log("\n=== PROSPECT STATUS (plumbers) ===");
  const stats = [];
  const s2 = db.prepare("SELECT status, COUNT(*) as cnt FROM prospects WHERE LOWER(trade_type) = 'plumber' GROUP BY status ORDER BY cnt DESC");
  while (s2.step()) stats.push(s2.getAsObject());
  s2.free();
  stats.forEach(r => console.log(`  ${r.status}: ${r.cnt}`));

  // 3. Any prospects beyond 'contacted'?
  console.log("\n=== PROSPECTS WHO RESPONDED (beyond contacted) ===");
  const responded = [];
  const s3 = db.prepare("SELECT prospect_id, business_name, phone, status FROM prospects WHERE status IN ('replied', 'demo_booked', 'trial', 'paying') AND LOWER(trade_type) = 'plumber'");
  while (s3.step()) responded.push(s3.getAsObject());
  s3.free();
  console.log(`Count: ${responded.length}`);
  responded.forEach(r => console.log(`  ${r.business_name} | ${r.phone} | status=${r.status}`));

  // 4. Recent calls (any demo calls from SMS recipients?)
  console.log("\n=== RECENT CALLS (last 10) ===");
  const calls = [];
  const s4 = db.prepare("SELECT call_id, from_number, to_number, started_at, status, is_demo FROM calls ORDER BY started_at DESC LIMIT 10");
  while (s4.step()) calls.push(s4.getAsObject());
  s4.free();
  calls.forEach(c => console.log(`  ${c.started_at} | from=${c.from_number} | to=${c.to_number} | status=${c.status} | demo=${c.is_demo}`));

  // 5. Campaign funnel query (what the dashboard uses)
  console.log("\n=== CAMPAIGN FUNNEL DATA ===");
  const s5 = db.prepare("SELECT COUNT(*) as cnt FROM outreach_log WHERE channel = 'sms'");
  s5.step(); console.log(`Total SMS in outreach_log: ${s5.getAsObject().cnt}`); s5.free();

  const s6 = db.prepare("SELECT COUNT(DISTINCT prospect_id) as cnt FROM outreach_log WHERE channel = 'sms'");
  s6.step(); console.log(`Unique prospects SMS'd: ${s6.getAsObject().cnt}`); s6.free();

  const s7 = db.prepare("SELECT COUNT(*) as cnt FROM outreach_log WHERE channel = 'demo_call'");
  s7.step(); console.log(`Demo call entries: ${s7.getAsObject().cnt}`); s7.free();

  const s8 = db.prepare("SELECT COUNT(*) as cnt FROM outreach_log WHERE channel = 'signup'");
  s8.step(); console.log(`Signup entries: ${s8.getAsObject().cnt}`); s8.free();

  // 6. Twilio delivery status updates
  console.log("\n=== SMS DELIVERY STATUS (from Twilio webhooks) ===");
  const delivered = [];
  const s9 = db.prepare("SELECT status, COUNT(*) as cnt FROM outreach_log WHERE channel = 'sms' AND twilio_sid IS NOT NULL GROUP BY status");
  while (s9.step()) delivered.push(s9.getAsObject());
  s9.free();
  delivered.forEach(r => console.log(`  ${r.status}: ${r.cnt}`));

  // 7. Check recent analytics events
  console.log("\n=== ANALYTICS EVENTS (all time) ===");
  const events = [];
  const s10 = db.prepare("SELECT event_name, COUNT(*) as cnt FROM analytics_events GROUP BY event_name ORDER BY cnt DESC");
  while (s10.step()) events.push(s10.getAsObject());
  s10.free();
  if (events.length === 0) console.log("  (none)");
  events.forEach(r => console.log(`  ${r.event_name}: ${r.cnt}`));

  // 8. Check new tenants/signups today
  console.log("\n=== RECENT TENANTS (signups) ===");
  const tenants = [];
  const s11 = db.prepare("SELECT tenant_id, name, owner_phone, created_at, payment_status FROM tenants ORDER BY created_at DESC LIMIT 5");
  while (s11.step()) tenants.push(s11.getAsObject());
  s11.free();
  tenants.forEach(t => console.log(`  ${t.created_at} | ${t.name} | ${t.owner_phone} | payment=${t.payment_status}`));

} finally {
  await pool.end();
}
