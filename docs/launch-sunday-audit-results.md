# Sunday audit results (launch SMS batch)

*Do not treat this as legal advice. Fill in and keep for records.*

> Per launch plan: S1–S4 findings. **Do not edit** the `sun-tue` Cursor plan file; this doc is the operational log for S5.

## S1 — Production deployment & health (automated)

- **GET** `https://www.getpickupai.com.au/version` — **OK**
- **Response:** `build: "greeting-fix-v7-wait-playback-drained"`, `commit: "pending"`, `deployedAt: "2026-04-18T06:44:40.415Z"`
- **Conclusion:** Production is on the v7 “wait for Twilio playback drained” greeting fix.
- **Railway logs (last 4h):** *Operator: paste anything alarming from Railway → service → Deployments / Logs if you re-check.*

## S2 — Demo number routing (operator)

*Call from your mobile, watch live logs, confirm it is **not** `tenant_id: "default"` fallback unless intentional.*

| Number | Greeting OK (no double greet)? | Logs show `incoming` HIT? | Tenant (not `default`)? | Notes |
|--------|-------------------------------|----------------------------|-------------------------|-------|
| +61 2 8000 0796 | | | | |
| +61 2 5950 6532 | | | | |

## S3 — Prospect data on production (operator)

*Admin → [PUBLIC_BASE_URL]/admin/prospects (requires `ADMIN_TOKEN`).*

| Check | Count / notes |
|--------|----------------|
| Total prospects | |
| `state` = NSW | |
| `status` = new | |
| AU mobile (`+614` / `04` style) | |
| Plumber / Electrician / Roofer / other | / / / |
| At least 20 usable plumbers? | Y / N |

*Spot-check 10 rows: `business_name` sensible, `phone` looks like mobile, no junk.*

## S4 — Twilio (operator, Twilio Console)

- [ ] Account active, no suspension, balance OK  
- [ ] **Australia** outbound SMS permitted (geo permissions)  
- [ ] **Outreach** “from” number in `TWILIO_SMS_NUMBERS` is **+614…** and **is not** either demo number (8000 0796 / 5950 6532)  
- [ ] Messaging Service (if used): senders, **Advanced Opt-Out** (STOP) enabled  
- [ ] Alphanumeric Sender ID: *pending* / *approved* / *rejected* (note)  
- [ ] Recent SMS logs: no error pattern on test sends  

---

*After S2–S4, decide go/no-go for **Tuesday 7:30 AM** validation send.*
