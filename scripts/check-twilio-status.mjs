import twilio from "twilio";

// Credentials from env. Pre-existing hardcoded values were rotated out.
//   TWILIO_ACCOUNT_SID=ACxxxxx TWILIO_AUTH_TOKEN=xxxx node scripts/check-twilio-status.mjs SMxxx SMyyy
//   (or set MESSAGE_SIDS=SMxxx,SMyyy as a comma-separated list)
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error("ERROR: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars required.");
  process.exit(1);
}
const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

const sidsFromArgs = process.argv.slice(2).filter(a => /^SM[a-f0-9]+$/i.test(a));
const sidsFromEnv = (process.env.MESSAGE_SIDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
const sids = sidsFromArgs.length ? sidsFromArgs : sidsFromEnv;
if (sids.length === 0) {
  console.error("ERROR: pass message SIDs as args or MESSAGE_SIDS env var (comma-separated).");
  console.error("       e.g. node scripts/check-twilio-status.mjs SM729b... SM223e...");
  process.exit(1);
}

console.log("=== Actual Twilio status for 'stuck' messages ===\n");
for (const sid of sids) {
  try {
    const msg = await client.messages(sid).fetch();
    console.log(`${sid}:`);
    console.log(`  To: ${msg.to} | Status: ${msg.status} | Error: ${msg.errorCode || 'none'} | ErrorMsg: ${msg.errorMessage || 'none'}`);
    console.log(`  Sent: ${msg.dateSent} | Updated: ${msg.dateUpdated}`);
    console.log('');
  } catch (e) {
    console.log(`${sid}: ERROR fetching - ${e.message}\n`);
  }
}
