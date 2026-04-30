import twilio from "twilio";

// Credentials from env. Pre-existing hardcoded values were rotated out.
//   TWILIO_ACCOUNT_SID=ACxxxxx TWILIO_AUTH_TOKEN=xxxx node scripts/check-inbound-sms.mjs
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error("ERROR: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars required.");
  process.exit(1);
}
const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
const messages = await client.messages.list({
  dateSentAfter: threeDaysAgo,
  limit: 200,
});

const inbound = messages.filter(m => m.direction === 'inbound');

console.log(`=== INBOUND SMS (last 3 days): ${inbound.length} ===\n`);
for (const msg of inbound.sort((a, b) => a.dateSent - b.dateSent)) {
  console.log(`From: ${msg.from} | To: ${msg.to} | Date: ${msg.dateSent?.toISOString()}`);
  console.log(`Body: "${msg.body}"`);
  console.log(`Status: ${msg.status} | SID: ${msg.sid}`);
  console.log('');
}
