# Sunday → Tuesday launch runbook (operator)

**Cursor todos:** S2, S3, S4, M2–M6, T1–T4 are **on-calendar operator actions**. After you do each, check it in your list or the table below. Code + S1 + M1 are already done in the repo and production health check.

Use with `[docs/launch-sunday-audit-results.md](launch-sunday-audit-results.md)` and `[docs/outreach-templates.md](outreach-templates.md)`.

## M2 — Twilio Advanced Opt-Out (Monday AM)

1. In Twilio: **Messaging** → **Services** (or the number) → **Opt-Out** / **Advanced opt-out** — ensure STOP, STOPALL, etc. are enabled.  
2. From a test handset, **reply STOP** to an SMS you send from the **outreach** number.  
3. Expect Twilio’s auto-confirmation. Try sending to that number again; expect block at carrier/Twilio edge.  
4. *If* STOP does not work without a Messaging Service, add your long code to a Messaging Service and re-test before Tuesday.

## M3 — End-to-end demo call (Monday)

- Call `+61 2 8000 0796`, then `+61 2 5950 6532`.  
- Confirm: single clean greeting, lead capture, `save_lead` in logs, `leads` has row, **OWNER** SMS to `OWNER_PHONE_NUMBER` (if set), email if SMTP is configured.  
- Log any gaps in the Sunday audit doc.

## M4 — Test bulk SMS to your own phone (Monday)

1. `Admin` → `Bulk SMS` (filter as for real campaign).  
2. **Note:** only **AU mobile** (04) receives bulk sends (landlines are skipped and counted in the result flash).  
3. Check message on iOS and Android: `{name}`, tappable `tel:` to demo number, tappable `getpickupai.com.au`, one opt-out line.  
4. *Auto-append in code: `To opt out, email hello@getpickupai.com.au` when missing from template; avoid duplicating in your paste.*

## M5 — Trial signup (Monday, launch-blocking)

- Incognito: `{PUBLIC_BASE_URL}/dashboard/signup` → go through to Stripe **test** mode if applicable (`4242…` card).  
- Check: `demo` / `pending` → webhook → `trial` + `trial_ends_at`, `provisionAuNumber` assigns a number, inbound greeting works on the **purchased** number.

## M6 — Lock lists (Monday PM)

- In Admin **Prospects**: `status` = new, `trade` = plumber (Sydney/NSW as you filter), sort by **google rating** descending.  
- **First 20** = validation (Tue 7:30), **next 80** = main batch (Wed, if go). Screenshot the two lists.

## M7 + preflight (Monday night)

- `npm test` — 5 pre-existing failures (see note below), **not** from mobile SMS filter.  
- Open in browser tabs: Twilio Messaging, Twilio Voice, Railway logs, Admin / Prospects, `hello@getpickupai.com.au`.  
- Phone charged; 6:45 Tuesday alarm; block calendar **7:30 – noon** Tuesday.  
- Reread `docs/launch-sunday-audit-results.md` — all S2–S4 rows filled.

### npm test (last run, dev machine)

- **Result:** 219 passed, **5 failed** (pre-existing: `session.test` photo line, `sms.test` photos, `repo.test` nudge).  
- **Re-run after any code change** before go-live.

## T1 — Tuesday 6:45 smoke (15 min)

- `GET` `/version` → v7 build.  
- One call to `+61 2 8000 0796` — greeting only.  
- Stream Railway + Twilio for errors.

## T2 — Tuesday 7:30 validation (20)

- **Admin** → **Bulk SMS**; filters: match your 20; paste approved template from the SMS plan.  
- *Duration hint:* about **1 s per text** in code → ≈ 20+ seconds of sending for 20.  
- Watch **Twilio** delivery.

## T3 — Tuesday 7:30 – noon: monitoring

- Demo number inbound = hot lead.  
- Personal return calls, email opt-outs → mark prospect `do_not_contact` in admin.  
- No other deep work; watch metrics.

## T4 — Wednesday: 80 batch decision

- If delivery **>~95%** and no show-stoppers, schedule **7:30 Wed** for 80. Else tune and re-validate a small sample first.

| Step | You did it? |
|------|------------|
| S2 Demo routing | [ ] |
| S3 Prospects in DB | [ ] |
| S4 Twilio console | [ ] |
| M2 STOP / opt-out | [ ] |
| M3 Two demo E2E calls | [ ] |
| M4 Test bulk SMS to self | [ ] |
| M5 Trial + Stripe E2E | [ ] |
| M6 Screenshot 20 + 80 | [ ] |
| M7 Alarms, tabs, calendar (phone charge) | [ ] |
| T1 Tue 6:45 smoke | [ ] |
| T2 Tue 7:30 send 20 | [ ] |
| T3 Tue 7:30–noon monitor | [ ] |
| T4 Wed 7:30 decision (80 batch) | [ ] |

---

## Code shipped for this plan (M1)

- `isAuMobile()` in `src/utils/phone.ts` — only **+614…** (normalised) receive bulk SMS.  
- `GET/POST` bulk SMS routes and `adminBulkSmsPage` show mobile count and excluded (non-mobile) count.  
- Flash: `N skipped (not AU mobile)`.
