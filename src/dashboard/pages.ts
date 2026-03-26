import type { LeadRow, TenantRow } from "../db/repo.js";
import { generateForwardingCode } from "../twilio/sms.js";
import { formatAuPhone } from "../utils/phone.js";

// ─── Trial helpers ────────────────────────────────────────────────────────────

function trialDaysLeft(tenant: TenantRow): number | null {
  if (tenant.payment_status !== "trial" || !tenant.trial_ends_at) return null;
  return Math.ceil((new Date(tenant.trial_ends_at).getTime() - Date.now()) / 86400000);
}

function trialBannerHtml(tenant: TenantRow): string {
  if (tenant.vacation_mode) {
    return `<div style="background:#fef9c3;color:#854d0e;text-align:center;padding:.6rem 1rem;font-size:.85rem;font-weight:600">
      ⛱️ Holiday mode is active — callers are being told you're away.
      <a href="/dashboard/settings" style="color:#854d0e;text-decoration:underline">Turn it off →</a>
    </div>`;
  }
  if (tenant.payment_status === "payment_failed") {
    return `<div style="background:#fee2e2;color:#dc2626;text-align:center;padding:.6rem 1rem;font-size:.85rem;font-weight:600">
      Payment failed — your subscription may be cancelled soon.
      <a href="/dashboard/upgrade?reason=payment_failed" style="color:#dc2626;text-decoration:underline">Update payment method →</a>
    </div>`;
  }
  const days = trialDaysLeft(tenant);
  if (days === null || days > 7) return "";
  if (days <= 0) {
    return `<div style="background:#fee2e2;color:#dc2626;text-align:center;padding:.6rem 1rem;font-size:.85rem;font-weight:600">
      Your free trial has ended. <a href="/dashboard/upgrade" style="color:#dc2626;text-decoration:underline">Upgrade to continue →</a>
    </div>`;
  }
  return `<div style="background:#fef3c7;color:#92400e;text-align:center;padding:.6rem 1rem;font-size:.85rem;font-weight:600">
    ${days} day${days === 1 ? "" : "s"} left in your free trial.
    <a href="/dashboard/upgrade" style="color:#92400e;text-decoration:underline">Upgrade now →</a>
  </div>`;
}

// ─── Shared shell ─────────────────────────────────────────────────────────────

function shell(title: string, body: string, tenant?: TenantRow) {
  const tenantName = tenant?.name ?? "";
  const banner = tenant ? trialBannerHtml(tenant) : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escape(title)} — PickupAI</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --brand: #2563eb; --brand-dark: #1d4ed8;
      --red: #dc2626; --orange: #ea580c; --amber: #d97706; --green: #16a34a;
      --gray-50: #f8fafc; --gray-100: #f1f5f9; --gray-200: #e2e8f0; --gray-300: #cbd5e1;
      --gray-400: #94a3b8; --gray-500: #64748b; --gray-600: #475569; --gray-800: #1e293b;
      --radius: 8px; --shadow: 0 1px 3px rgba(0,0,0,.12);
    }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--gray-50); color: var(--gray-800); }
    a { color: var(--brand); text-decoration: none; }
    a:hover { text-decoration: underline; }
    nav {
      background: var(--brand); color: #fff; display: flex; align-items: center;
      padding: 0 1.5rem; height: 56px; gap: 1.5rem; flex-wrap: wrap;
    }
    nav .logo { font-weight: 700; font-size: 1.1rem; letter-spacing: -.3px; color: #fff; text-decoration: none; }
    nav .logo span { opacity: .7; font-weight: 400; font-size: .85rem; margin-left: .5rem; }
    nav .logo:hover { opacity: .9; text-decoration: none; }
    nav a { color: rgba(255,255,255,.85); font-size: .9rem; }
    nav a:hover { color: #fff; text-decoration: none; }
    nav .spacer { flex: 1; }
    .nav-toggle { display: none; background: none; border: none; color: #fff; font-size: 1.5rem; cursor: pointer; padding: .25rem; line-height: 1; }
    .nav-links { display: contents; }
    .mobile-spacer { display: none; }
    @media (max-width: 640px) {
      .nav-toggle { display: block; }
      .mobile-spacer { display: block; flex: 1; }
      .desktop-spacer { display: none; }
      .nav-links { display: none; width: 100%; flex-direction: column; gap: 0; background: var(--brand); padding: .5rem 0; }
      .nav-links.open { display: flex; }
      .nav-links a { padding: .6rem 0; border-top: 1px solid rgba(255,255,255,.15); }
    }
    .container { max-width: 1100px; margin: 0 auto; padding: 1.5rem; }
    .card { background: #fff; border-radius: var(--radius); box-shadow: var(--shadow); padding: 1.5rem; }
    .badge {
      display: inline-block; padding: .2rem .6rem; border-radius: 999px;
      font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .4px;
    }
    .badge-emergency { background: #fee2e2; color: var(--red); }
    .badge-urgent { background: #ffedd5; color: var(--orange); }
    .badge-routine { background: #dcfce7; color: var(--green); }
    .badge-new { background: #dbeafe; color: var(--brand); }
    .badge-handled { background: var(--gray-100); color: var(--gray-600); }
    .badge-booked { background: #dcfce7; color: var(--green); }
    .badge-called_back { background: #f0fdf4; color: var(--green); }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; }
    h2 { font-size: 1.15rem; font-weight: 600; margin-bottom: .75rem; }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th { text-align: left; padding: .6rem .75rem; font-size: .75rem; font-weight: 600;
         text-transform: uppercase; letter-spacing: .4px; color: var(--gray-600);
         border-bottom: 2px solid var(--gray-200); }
    td { padding: .7rem .75rem; border-bottom: 1px solid var(--gray-100); vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--gray-50); }
    .btn {
      display: inline-block; padding: .45rem 1rem; border-radius: 6px;
      font-size: .85rem; font-weight: 600; cursor: pointer; border: none;
      text-decoration: none; transition: opacity .15s;
    }
    .btn:hover { opacity: .85; text-decoration: none; }
    .btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
    .btn-primary { background: var(--brand); color: #fff; }
    .btn-outline { background: transparent; color: var(--brand); border: 1.5px solid var(--brand); }
    .btn-sm { padding: .3rem .65rem; font-size: .8rem; }
    .btn-ghost { background: transparent; color: var(--gray-600); border: 1.5px solid var(--gray-200); }
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: .3rem; }
    input, select, textarea { width: 100%; padding: .5rem .75rem; border: 1.5px solid var(--gray-200);
                    border-radius: 6px; font-size: .9rem; font-family: inherit; }
    input:focus, select:focus, textarea:focus { border-color: var(--brand); outline: 2px solid var(--brand); outline-offset: 1px; }
    textarea { resize: vertical; min-height: 80px; }
    .filters { display: flex; gap: .75rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .filter-chip {
      padding: .35rem .9rem; border-radius: 999px; font-size: .8rem; font-weight: 600;
      border: 1.5px solid var(--gray-200); background: #fff; cursor: pointer;
      text-decoration: none; color: var(--gray-600); transition: all .15s;
    }
    .filter-chip:hover { border-color: var(--brand); color: var(--brand); text-decoration: none; }
    .filter-chip:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
    .filter-chip.active { background: var(--brand); color: #fff; border-color: var(--brand); }
    .alert { padding: .75rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: .9rem; }
    .alert-error { background: #fee2e2; color: var(--red); }
    .alert-success { background: #dcfce7; color: var(--green); }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    .detail-item label { color: var(--gray-600); font-size: .78rem; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; margin-bottom: .2rem; }
    .detail-item p { font-size: .95rem; }
    audio { width: 100%; margin-top: .5rem; }
    .transcript { background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: 6px;
                  padding: 1rem; font-size: .85rem; line-height: 1.6; white-space: pre-wrap;
                  max-height: 300px; overflow-y: auto; color: var(--gray-600); }
    .status-row { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: .75rem; }
    .empty { text-align: center; padding: 3rem; color: var(--gray-500); }
    .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    details[open] .adv-arrow { transform: rotate(90deg); }
    @media (max-width: 640px) {
      .detail-grid, .settings-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
<nav>
  <a href="/" class="logo">PickupAI <span>${escape(tenantName)}</span></a>
  <div class="spacer mobile-spacer"></div>
  ${tenant
    ? `<button class="nav-toggle" onclick="document.querySelector('.nav-links').classList.toggle('open')" aria-label="Menu">&#9776;</button>
       <div class="nav-links">
         <a href="/dashboard/leads">Jobs</a>
         <a href="/dashboard/stats">Call Stats</a>
         <a href="/dashboard/settings">Settings</a>
         <a href="/dashboard/welcome">Setup</a>
         <div class="spacer desktop-spacer"></div>
         <form method="POST" action="/dashboard/logout" style="display:inline;margin:0;padding:0;">
           <button type="submit" style="background:none;border:none;color:rgba(255,255,255,.85);font-size:.9rem;cursor:pointer;padding:0;font-family:inherit;">Log out</button>
         </form>
       </div>`
    : ``}
</nav>
${banner}
<div class="container">
  ${body}
</div>
</body>
</html>`;
}

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function urgencyBadge(level: string | null) {
  const cls = level === "emergency" ? "badge-emergency"
    : level === "urgent" ? "badge-urgent"
    : "badge-routine";
  return `<span class="badge ${cls}">${escape(capitalize(level ?? "routine"))}</span>`;
}

function statusBadge(status: string | null) {
  const cls = `badge-${(status ?? "new").replace(/[^a-z0-9-]/gi, "")}`;
  return `<span class="badge ${cls}">${escape(capitalize(status ?? "new"))}</span>`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

// ─── Login page ───────────────────────────────────────────────────────────────

export function loginPage(error?: string, flash?: string) {
  const body = `
<div style="max-width:400px;margin:4rem auto;">
  <div class="card">
    <h2 style="text-align:center;margin-bottom:1.5rem;">Sign in to Dashboard</h2>
    ${flash ? `<div class="alert alert-success">${escape(flash)}</div>` : ""}
    ${error ? `<div class="alert alert-error">${escape(error)}</div>` : ""}
    <form method="POST" action="/dashboard/login">
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required placeholder="owner@example.com" />
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required />
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%;margin-top:.5rem;">Sign in</button>
    </form>
    <p style="text-align:center;margin-top:1rem;font-size:.85rem;color:var(--gray-600);">
      <a href="/dashboard/forgot-password">Forgot your password?</a>
    </p>
    <p style="text-align:center;margin-top:.5rem;font-size:.85rem;color:var(--gray-600);">
      No account? <a href="/dashboard/signup">Start your free 14-day trial →</a>
    </p>
  </div>
</div>`;
  return shell("Sign in", body);
}

// ─── Sign up page ─────────────────────────────────────────────────────────────

export function signupPage(error?: string, prefill: Record<string, string> = {}) {
  const trades = ["plumber","electrician","roofer","handyman","painter","carpenter","tiler","builder","other"];
  const tradeOptions = trades.map(t =>
    `<option value="${t}"${prefill.trade_type === t ? " selected" : ""}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
  ).join("");

  const body = `
<div style="max-width:480px;margin:3rem auto;">
  <div class="card">
    <div style="text-align:center;margin-bottom:1.75rem;">
      <h2 style="font-size:1.3rem;margin-bottom:.35rem;">Start your free 14-day trial</h2>
      <p style="font-size:.85rem;color:var(--gray-600);">14-day free trial. Credit card required, cancel anytime before day 14.</p>
    </div>
    ${error ? `<div class="alert alert-error">${escape(error)}</div>` : ""}
    <form method="POST" action="/dashboard/signup">
      <div class="form-group">
        <label for="name">Business name</label>
        <input type="text" id="name" name="name" required placeholder="e.g. Mike's Plumbing" value="${escape(prefill.name ?? "")}" />
      </div>
      <div class="form-group">
        <label for="trade_type">Trade type</label>
        <select id="trade_type" name="trade_type" required>
          <option value="" disabled${!prefill.trade_type ? " selected" : ""}>Select your trade…</option>
          ${tradeOptions}
        </select>
      </div>
      <div class="form-group">
        <label for="ai_name">AI receptionist name <span style="font-weight:400;color:var(--gray-600);">(optional)</span></label>
        <input type="text" id="ai_name" name="ai_name" placeholder="Olivia" value="${escape(prefill.ai_name ?? "")}" />
      </div>
      <div class="form-group">
        <label for="owner_phone">Your mobile number <span style="font-size:.8rem;font-weight:400;color:var(--gray-600);">— for SMS job alerts</span></label>
        <input type="tel" id="owner_phone" name="owner_phone" required placeholder="+61 4XX XXX XXX" value="${escape(prefill.owner_phone ?? "")}" />
      </div>
      <div class="form-group">
        <label for="service_area">Where do you work? <span style="font-size:.8rem;font-weight:400;color:var(--gray-600);">(optional)</span></label>
        <input type="text" id="service_area" name="service_area" placeholder="e.g. All of Sydney metro, Hills District, Inner West" value="${escape(prefill.service_area ?? "")}" />
        <p style="font-size:.78rem;color:var(--gray-500);margin-top:.25rem">Your AI will politely explain you don't cover that area</p>
      </div>
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required placeholder="you@example.com" value="${escape(prefill.email ?? "")}" />
      </div>
      <div class="form-group">
        <label for="password">Password <span style="font-size:.8rem;font-weight:400;color:var(--gray-600);">(min 8 characters)</span></label>
        <input type="password" id="password" name="password" required minlength="8" />
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:flex-start;gap:.65rem;cursor:pointer;font-weight:400;">
          <input type="checkbox" name="terms_accepted" required style="width:auto;margin-top:.2rem;" />
          <span style="font-size:.85rem;">I agree to the
            <a href="/terms" target="_blank">Terms of Service</a> and
            <a href="/privacy" target="_blank">Privacy Policy</a>
          </span>
        </label>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%;margin-top:.5rem;padding:.65rem;">
        Create account &amp; start trial →
      </button>
    </form>
    <p style="text-align:center;margin-top:1.25rem;font-size:.85rem;color:var(--gray-600);">
      Already have an account? <a href="/dashboard/login">Sign in</a>
    </p>
  </div>
</div>`;
  return shell("Start free trial", body);
}

// ─── Onboarding progress indicator ───────────────────────────────────────────

function onboardingProgress(tenant: TenantRow): string {
  const paymentDone = tenant.payment_status === "active" || tenant.payment_status === "trial";
  const numberDone = !tenant.twilio_number.startsWith("+PENDING");

  const steps = [
    { label: "Sign up", done: true },
    { label: "Payment", done: paymentDone },
    { label: "Number ready", done: numberDone },
  ];

  const stepsRow = steps.map((s, i) => {
    const color = s.done ? "var(--green)" : "var(--gray-300)";
    const icon = s.done ? "\u2713" : String(i + 1);
    const textColor = s.done ? "var(--green)" : "var(--gray-600)";
    const parts = [`<div style="display:flex;flex-direction:column;align-items:center;gap:.35rem;">
      <div style="width:32px;height:32px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;">${icon}</div>
      <span style="font-size:.72rem;font-weight:600;color:${textColor};text-align:center;">${s.label}</span>
    </div>`];
    if (i < steps.length - 1) {
      const nextDone = steps[i + 1].done;
      parts.push(`<div style="flex:1;height:3px;background:${nextDone ? "var(--green)" : "var(--gray-200)"};margin-top:16px;"></div>`);
    }
    return parts.join("");
  }).join("");

  return `<div style="display:flex;align-items:flex-start;gap:0;margin-bottom:1.5rem;padding:1rem 0;">${stepsRow}</div>`;
}

// ─── Setup guide page (shown after signup) ────────────────────────────────────

// ─── Welcome page (post-signup) ───────────────────────────────────────────────

export type WelcomePageOpts = {
  /** Currently claimed demo number for this tenant, if any */
  demoNumber?: string | null;
  /** Error message to display */
  error?: string;
  /** Whether a simulated demo call was just triggered */
  simulationStarted?: boolean;
};

export function welcomePage(tenant: TenantRow, opts: WelcomePageOpts = {}) {
  const { demoNumber, error, simulationStarted } = opts;

  const demoNumberFormatted = demoNumber ? formatAuPhone(demoNumber) : null;

  const isPendingPayment = tenant.payment_status === "pending";
  const isNumberReady = !tenant.twilio_number.startsWith("+PENDING");
  const pickupNumber = isNumberReady ? tenant.twilio_number : null;
  const forwardingCodeStr = pickupNumber
    ? generateForwardingCode(pickupNumber)
    : null;

  const activationCard = isPendingPayment
    ? `<div class="card" style="border:2px solid var(--brand);margin-bottom:1rem;">
        <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.75rem;">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;">1</div>
          <h2 style="margin:0;font-size:1.05rem;">Complete your signup</h2>
        </div>
        <p style="font-size:.9rem;color:var(--gray-600);margin-bottom:1rem;">
          Add your card to start your 14-day free trial. You won't be charged today — cancel any time before day 14 and pay nothing.
        </p>
        <form method="POST" action="/dashboard/create-checkout-session">
          <button type="submit" class="btn btn-primary" style="width:100%;font-size:1rem;padding:.85rem;">Start free trial — add card →</button>
        </form>
        <p style="font-size:.78rem;color:var(--gray-500);margin-top:.75rem;text-align:center;">Secure payment via Stripe. Cancel any time from your account.</p>
      </div>`
    : isNumberReady
    ? `<div class="card" style="border:2px solid var(--brand);margin-bottom:1rem;">
        <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.75rem;">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;">1</div>
          <h2 style="margin:0;font-size:1.05rem;">Activate your AI receptionist</h2>
        </div>
        <p style="font-size:.9rem;color:var(--gray-600);margin-bottom:1rem;">
          Open your phone's dialler and type this code, then press <strong>Call</strong>:
        </p>
        <div style="position:relative;background:var(--gray-50);border:2px solid var(--gray-200);border-radius:10px;padding:1rem 1.25rem;font-family:monospace;font-size:1.15rem;letter-spacing:.05em;margin-bottom:.75rem;text-align:center;word-break:break-all;">
          <span id="fwd-code">${escape(forwardingCodeStr!)}</span>
          <button onclick="var t=document.getElementById('fwd-code');navigator.clipboard.writeText(t.textContent).then(()=>{this.textContent='Copied!'}).catch(()=>{var r=document.createRange();r.selectNodeContents(t);var s=window.getSelection();s.removeAllRanges();s.addRange(r);this.textContent='Selected!'});setTimeout(()=>this.textContent='Copy',1500)"
            style="position:absolute;right:.75rem;top:50%;transform:translateY(-50%);background:var(--brand);color:#fff;border:none;border-radius:6px;padding:.3rem .75rem;font-size:.75rem;font-weight:600;cursor:pointer;">Copy</button>
        </div>
        <p style="font-size:.85rem;color:var(--gray-600);margin-bottom:.5rem;">You'll hear a confirmation tone. That's it — your AI receptionist is live!</p>
        <details style="margin-top:.5rem;">
          <summary style="cursor:pointer;font-size:.82rem;color:var(--brand);font-weight:600;">Other ways to set this up (carrier app, phone call)</summary>
          <div style="margin-top:.5rem;font-size:.82rem;color:var(--gray-600);line-height:1.7;">
            <p><strong>Via your carrier app:</strong> Look for <em>Call Forwarding → No Answer</em> and enter your PickupAI number: <strong>${escape(formatAuPhone(pickupNumber!))}</strong></p>
            <p style="margin-top:.5rem;"><strong>Call your carrier:</strong> Ask for <em>conditional call forwarding (no answer) with a 20-second delay</em> to ${escape(formatAuPhone(pickupNumber!))}.</p>
            <p style="margin-top:.5rem;"><strong>To turn it off later:</strong> Dial <code>##61#</code> and press Call.</p>
          </div>
        </details>
      </div>`
    : `<div class="card" style="border:2px solid #fde68a;margin-bottom:1rem;">
        <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.75rem;">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--amber);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;">1</div>
          <h2 style="margin:0;font-size:1.05rem;">Your number is being set up</h2>
        </div>
        <p style="font-size:.9rem;color:var(--gray-600);">
          We're setting up your phone number. You'll receive an SMS with your activation code shortly. In the meantime, try a demo below!
        </p>
      </div>`;

  const body = `
<div style="max-width:600px;margin:2rem auto;">
  ${onboardingProgress(tenant)}

  <div style="background:var(--brand);color:#fff;border-radius:var(--radius);padding:1.5rem 1.75rem;margin-bottom:1.5rem;display:flex;align-items:center;gap:1rem;">
    <span style="font-size:2rem;">🎉</span>
    <div>
      <div style="font-weight:700;font-size:1.15rem;">Welcome, ${escape(tenant.name)}!</div>
      <div style="opacity:.85;font-size:.9rem;margin-top:.2rem;">${isPendingPayment ? "One more step to activate your AI receptionist." : isNumberReady ? "Your AI receptionist is ready. Follow the steps below to go live." : "Your account is set up. We're getting your number ready."}</div>
    </div>
  </div>

  ${error ? `<div class="alert alert-error" style="margin-bottom:1rem;">${escape(error)}</div>` : ""}

  ${activationCard}

  ${isPendingPayment ? "" : `<div class="card" style="margin-bottom:1rem;">
    <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.75rem;">
      <div style="width:40px;height:40px;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;">2</div>
      <h2 style="margin:0;font-size:1.05rem;">Test it</h2>
    </div>
    <p style="font-size:.9rem;color:var(--gray-600);margin-bottom:1rem;">
      Ask a mate to call your business number and don't answer. After ~20 seconds your AI picks up. You should get a text on <strong>${escape(tenant.owner_phone ? formatAuPhone(tenant.owner_phone) : "your mobile")}</strong> within a minute.
    </p>
    <p style="font-size:.85rem;color:var(--gray-500);">Or try a quick demo right now:</p>
    <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-top:.75rem;">
      ${simulationStarted
        ? `<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:var(--radius);padding:1rem;flex:1;min-width:200px;">
            <p style="font-weight:600;color:#16a34a;margin-bottom:.4rem;">Demo call in progress!</p>
            <p style="font-size:.82rem;color:var(--gray-600);">Check your phone for the SMS when it's done.</p>
          </div>`
        : `<form method="POST" action="/dashboard/simulate-demo-call" style="flex:1;">
            <button type="submit" class="btn btn-outline" style="width:100%;">Run a demo call (AI simulates a customer)</button>
          </form>`}
      ${demoNumber
        ? `<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:var(--radius);padding:1rem;flex:1;min-width:200px;">
            <p style="font-weight:600;color:#16a34a;font-size:.9rem;margin-bottom:.3rem;">Demo number ready:</p>
            <p style="font-family:monospace;font-size:1rem;margin-bottom:.3rem;">${escape(demoNumberFormatted ?? demoNumber)}</p>
            <p style="font-size:.78rem;color:var(--gray-500);">Call it from your mobile to hear your AI receptionist.</p>
          </div>`
        : `<form method="POST" action="/dashboard/request-demo" style="flex:1;">
            <button type="submit" class="btn btn-ghost" style="width:100%;">Get a number to call yourself</button>
          </form>`}
    </div>
  </div>

  <div class="card" style="margin-bottom:1.5rem;">
    <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.75rem;">
      <div style="width:40px;height:40px;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;">3</div>
      <h2 style="margin:0;font-size:1.05rem;">Start getting jobs</h2>
    </div>
    <p style="font-size:.9rem;color:var(--gray-600);">
      Every call your AI answers shows up in your account with the customer's details. You'll also get a text to your phone straight away.
    </p>
  </div>`}

  <div style="text-align:center;">
    ${isPendingPayment
      ? `<p style="font-size:.9rem;color:var(--gray-600);margin-bottom:1rem;">Once your card is on file, you can test the AI and start taking calls.</p>
         <form method="POST" action="/dashboard/create-checkout-session">
           <button type="submit" class="btn btn-primary" style="padding:.75rem 2rem;font-size:1rem;">Add card and start free trial →</button>
         </form>`
      : `<a href="/dashboard/leads" class="btn btn-primary" style="padding:.75rem 2rem;font-size:1rem;">View your jobs →</a>`}
    <p style="margin-top:.75rem;font-size:.8rem;color:var(--gray-600);">
      Need help? Text or email <a href="mailto:hello@getpickupai.com.au">hello@getpickupai.com.au</a>
    </p>
  </div>
</div>`;

  return shell("Welcome", body, tenant);
}

// ─── Leads list page ──────────────────────────────────────────────────────────

export function leadsPage(
  tenant: TenantRow,
  leads: (LeadRow & { recording_url: string | null })[],
  filters: { urgency?: string; status?: string; search?: string },
  stats?: { total: number; this_week: number; emergency: number; urgent: number; routine: number; new_status: number; handled: number; booked: number; called_back: number }
) {
  const urgencyOpts = [
    { v: "", label: "All urgencies" },
    { v: "emergency", label: "Emergency" },
    { v: "urgent", label: "Urgent" },
    { v: "routine", label: "Routine" }
  ];
  const statusOpts = [
    { v: "", label: "All statuses" },
    { v: "new", label: "New" },
    { v: "handled", label: "Handled" },
    { v: "booked", label: "Booked" },
    { v: "called_back", label: "Called back" }
  ];

  const qs = (u?: string, s?: string, q?: string) => {
    const p = new URLSearchParams();
    if (u) p.set("urgency", u);
    if (s) p.set("status", s);
    if (q) p.set("search", q);
    const str = p.toString();
    return str ? `?${str}` : "";
  };

  const urgencyFilters = urgencyOpts.map(o => {
    const active = (filters.urgency ?? "") === o.v ? " active" : "";
    return `<a href="/dashboard/leads${qs(o.v, filters.status, filters.search)}" class="filter-chip${active}">${o.label}</a>`;
  }).join("");

  const statusFilters = statusOpts.map(o => {
    const active = (filters.status ?? "") === o.v ? " active" : "";
    return `<a href="/dashboard/leads${qs(filters.urgency, o.v, filters.search)}" class="filter-chip${active}">${o.label}</a>`;
  }).join("");

  const statsBar = stats ? `
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.75rem;margin-bottom:1.25rem;">
  <div class="card" style="padding:.85rem;text-align:center;">
    <div style="font-size:1.6rem;font-weight:700;color:var(--brand)">${stats.total}</div>
    <div style="font-size:.75rem;color:var(--gray-600);text-transform:uppercase;letter-spacing:.4px">Total</div>
  </div>
  <div class="card" style="padding:.85rem;text-align:center;">
    <div style="font-size:1.6rem;font-weight:700;color:var(--brand)">${stats.this_week}</div>
    <div style="font-size:.75rem;color:var(--gray-600);text-transform:uppercase;letter-spacing:.4px">This week</div>
  </div>
  <div class="card" style="padding:.85rem;text-align:center;border-left:3px solid var(--red)">
    <div style="font-size:1.6rem;font-weight:700;color:var(--red)">${stats.emergency}</div>
    <div style="font-size:.75rem;color:var(--gray-600);text-transform:uppercase;letter-spacing:.4px">Emergency</div>
  </div>
  <div class="card" style="padding:.85rem;text-align:center;border-left:3px solid var(--orange)">
    <div style="font-size:1.6rem;font-weight:700;color:var(--orange)">${stats.urgent}</div>
    <div style="font-size:.75rem;color:var(--gray-600);text-transform:uppercase;letter-spacing:.4px">Urgent</div>
  </div>
  <div class="card" style="padding:.85rem;text-align:center;border-left:3px solid var(--green)">
    <div style="font-size:1.6rem;font-weight:700;color:var(--green)">${stats.booked + stats.handled + stats.called_back}</div>
    <div style="font-size:.75rem;color:var(--gray-600);text-transform:uppercase;letter-spacing:.4px">Handled</div>
  </div>
</div>` : "";

  const rows = leads.length === 0
    ? `<tr><td colspan="7"><div class="empty">No jobs yet. Calls will appear here automatically.</div></td></tr>`
    : leads.map(l => `
      <tr>
        <td>${urgencyBadge(l.urgency_level)}</td>
        <td><a href="/dashboard/leads/${l.lead_id}">${escape(l.name ?? "Unknown")}</a></td>
        <td>${escape(l.phone ? formatAuPhone(l.phone) : "—")}</td>
        <td>${escape(l.address ?? "—")}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escape(l.issue_summary ?? "—")}</td>
        <td>${statusBadge(l.lead_status)}</td>
        <td style="white-space:nowrap;font-size:.8rem;color:var(--gray-600)">${formatDate(l.created_at)}</td>
      </tr>`).join("");

  const csvQs = qs(filters.urgency, filters.status);
  const isPending = !tenant.twilio_number || tenant.twilio_number.startsWith("+PENDING_");
  const hasLeads = leads.length > 0;

  // Onboarding progress checklist for new accounts that don't have leads yet
  const onboardingChecklist = isPending && !hasLeads ? `
<div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:var(--radius);padding:1.25rem;margin-bottom:1.25rem;">
  <p style="font-weight:700;margin-bottom:.85rem;color:var(--brand);">📋 Getting started checklist</p>
  <div style="display:flex;flex-direction:column;gap:.6rem;font-size:.9rem;">
    <div style="display:flex;align-items:center;gap:.65rem;">
      <span style="color:#16a34a;font-weight:700;font-size:1.1rem;">✓</span>
      <span style="text-decoration:line-through;color:var(--gray-500);">Create your account</span>
    </div>
    <div style="display:flex;align-items:center;gap:.65rem;">
      <span style="color:var(--gray-500);font-weight:700;font-size:1.1rem;">○</span>
      <span><a href="/dashboard/welcome">Try the demo</a> — hear your AI receptionist in action</span>
    </div>
    <div style="display:flex;align-items:center;gap:.65rem;">
      <span style="color:var(--gray-500);font-weight:700;font-size:1.1rem;">○</span>
      <span><a href="/dashboard/settings">Complete your settings</a> — set your service area and business hours</span>
    </div>
    <div style="display:flex;align-items:center;gap:.65rem;">
      <span style="color:var(--gray-500);font-weight:700;font-size:1.1rem;">○</span>
      <span><a href="/dashboard/welcome">Set up call forwarding</a> — activate your AI receptionist</span>
    </div>
    <div style="display:flex;align-items:center;gap:.65rem;">
      <span style="color:var(--gray-500);font-weight:700;font-size:1.1rem;">○</span>
      <span>Get your first job enquiry — calls appear here automatically</span>
    </div>
  </div>
</div>` : "";

  const setupBanner = isPending && hasLeads ? `
<div style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:var(--radius);padding:1rem 1.25rem;margin-bottom:1.25rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;">
  <div>
    <p style="font-weight:600;margin:0 0 .2rem;">⚙️ Your AI receptionist isn't active yet</p>
    <p style="font-size:.85rem;color:var(--gray-600);margin:0;">You haven't set up call forwarding — customers can't reach your AI receptionist until this is done.</p>
  </div>
  <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
    <a href="/dashboard/welcome" class="btn btn-outline btn-sm">Try Demo</a>
    <a href="/dashboard/welcome" class="btn btn-primary btn-sm">Set Up Now →</a>
  </div>
</div>` : isPending ? "" : "";

  const body = `
${onboardingChecklist}
${setupBanner}
${statsBar}
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;flex-wrap:wrap;gap:.75rem;">
  <h1 style="margin:0">Jobs</h1>
  <a href="/dashboard/leads/export.csv${csvQs}" class="btn btn-outline btn-sm">Export CSV</a>
</div>
<div class="card">
  <form method="GET" action="/dashboard/leads" style="margin-bottom:.75rem;">
    <div style="display:flex;gap:.5rem;">
      <input type="text" name="search" value="${escape(filters.search ?? "")}" placeholder="Search by name, phone, address, or issue…" style="flex:1;" />
      ${filters.urgency ? `<input type="hidden" name="urgency" value="${escape(filters.urgency)}" />` : ""}
      ${filters.status ? `<input type="hidden" name="status" value="${escape(filters.status)}" />` : ""}
      <button type="submit" class="btn btn-primary btn-sm">Search</button>
      ${filters.search ? `<a href="/dashboard/leads${qs(filters.urgency, filters.status)}" class="btn btn-ghost btn-sm">Clear</a>` : ""}
    </div>
  </form>
  <div class="filters" style="margin-bottom:.5rem;">
    <span style="font-size:.8rem;color:var(--gray-600);line-height:2;">Urgency:</span>
    ${urgencyFilters}
  </div>
  <div class="filters">
    <span style="font-size:.8rem;color:var(--gray-600);line-height:2;">Status:</span>
    ${statusFilters}
  </div>
  <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
  <table>
    <thead>
      <tr>
        <th>Urgency</th><th>Name</th><th>Phone</th><th>Address</th>
        <th>Issue</th><th>Status</th><th>Received</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  </div>
</div>`;
  return shell("Jobs", body, tenant);
}

// ─── Lead detail page ─────────────────────────────────────────────────────────

export function leadDetailPage(
  tenant: TenantRow,
  lead: LeadRow & { recording_url: string | null; transcript: string | null; from_number: string | null },
  flash?: string,
  duplicateWarning?: string
) {
  const statusOptions = ["new", "handled", "booked", "called_back"];

  const statusButtons = statusOptions.filter(s => s !== (lead.lead_status ?? "new")).map(s => `
    <form method="POST" action="/dashboard/leads/${lead.lead_id}/status" style="display:inline;">
      <input type="hidden" name="status" value="${s}" />
      <button type="submit" class="btn btn-ghost btn-sm">${escape(capitalize(s))}</button>
    </form>`).join("");

  const proxyUrl = lead.recording_url
    ? `/dashboard/recording-proxy?url=${encodeURIComponent(lead.recording_url)}`
    : null;
  const recordingSection = proxyUrl
    ? `<div class="card" style="margin-top:1rem;">
        <h2>Call Recording</h2>
        <audio controls src="${proxyUrl}"></audio>
       </div>`
    : "";

  const transcriptSection = lead.transcript
    ? `<div class="card" style="margin-top:1rem;">
        <h2>Transcript</h2>
        <div class="transcript">${escape(lead.transcript ?? "")}</div>
       </div>`
    : "";

  function field(label: string, value: string | null | undefined) {
    return `<div class="detail-item">
      <label>${label}</label>
      <p>${escape(value ?? "—")}</p>
    </div>`;
  }

  const body = `
<div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem;flex-wrap:wrap;">
  <a href="/dashboard/leads" style="color:var(--gray-600);font-size:.9rem;">← Back to jobs</a>
</div>
${flash ? `<div class="alert" style="background:#dcfce7;color:var(--green);">${escape(flash)}</div>` : ""}
${duplicateWarning ? `<div class="alert" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;">${duplicateWarning}</div>` : ""}
<div class="card">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:.75rem;margin-bottom:1.25rem;">
    <div>
      <h1 style="margin-bottom:.5rem;">${escape(lead.name ?? "Unknown caller")}</h1>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
        ${urgencyBadge(lead.urgency_level)}
        ${statusBadge(lead.lead_status)}
      </div>
    </div>
    <div class="status-row">
      <span style="font-size:.8rem;color:var(--gray-600);line-height:2;">Mark as:</span>
      ${statusButtons}
    </div>
  </div>
  <div class="detail-grid">
    ${field("Phone", (lead.phone ?? lead.from_number) ? formatAuPhone((lead.phone ?? lead.from_number)!) : "—")}
    ${field("Address", lead.address)}
    ${field("Issue type", lead.issue_type)}
    ${field("Preferred time", lead.preferred_time)}
    ${field("Received", formatDate(lead.created_at))}
    ${field("Next action", lead.next_action)}
  </div>
  ${lead.issue_summary ? `<div class="detail-item" style="margin-top:.5rem;">
    <label>Issue summary</label>
    <p style="margin-top:.25rem;line-height:1.6;">${escape(lead.issue_summary)}</p>
  </div>` : ""}
  ${lead.notes ? `<div class="detail-item" style="margin-top:.75rem;">
    <label>Notes</label>
    <p style="margin-top:.25rem;line-height:1.6;color:var(--gray-600);">${escape(lead.notes)}</p>
  </div>` : ""}

  <div style="border-top:1px solid var(--gray-200);margin-top:1.25rem;padding-top:1.25rem;">
    <h2 style="margin-bottom:.75rem;font-size:1rem;">Job value</h2>
    <p style="font-size:.8rem;color:var(--gray-600);margin-bottom:.5rem;">Track how much money your AI receptionist brings in.</p>
    <form method="POST" action="/dashboard/leads/${lead.lead_id}/job-value" style="display:flex;gap:.5rem;align-items:center;">
      <span style="font-size:1rem;color:var(--gray-600)">$</span>
      <input type="number" name="job_value" value="${lead.job_value != null ? lead.job_value : ""}" min="0" step="1" placeholder="e.g. 850"
        style="width:140px;" />
      <button type="submit" class="btn btn-outline btn-sm">Save</button>
    </form>
    ${lead.job_value != null ? `<p style="font-size:.8rem;color:var(--gray-500);margin-top:.35rem">Job value: <strong>$${lead.job_value.toLocaleString()}</strong></p>` : ""}
  </div>
</div>
${recordingSection}
${transcriptSection}`;
  return shell(`Job — ${lead.name ?? "Unknown"}`, body, tenant);
}

// ─── Stats page ──────────────────────────────────────────────────────────────

export type StatsData = {
  callsThisWeek: number;
  callsThisMonth: number;
  leadsThisWeek: number;
  leadsThisMonth: number;
  totalJobValue: number;
  totalLeads: number;
  totalCalls: number;
};

export function statsPage(tenant: TenantRow, stats: StatsData): string {
  const fmt = (n: number) => n.toLocaleString("en-AU");
  const fmtDollar = (n: number) => `$${n.toLocaleString("en-AU")}`;

  if (stats.totalCalls === 0 && stats.totalLeads === 0) {
    const body = `
<h1>Call Stats</h1>
<div class="card" style="text-align:center;padding:3rem 1.5rem;">
  <div style="font-size:3rem;margin-bottom:1rem;">📊</div>
  <h2 style="margin-bottom:.75rem;">No calls yet</h2>
  <p style="color:var(--gray-600);font-size:.95rem;line-height:1.6;margin-bottom:1.5rem;">
    Once your AI receptionist takes its first call, your stats will appear here —
    calls answered, jobs captured, and total job value.
  </p>
  <a href="/dashboard/welcome" class="btn btn-primary">Try a demo call</a>
</div>`;
    return shell("Call Stats", body, tenant);
  }

  const body = `
<h1>Call Stats</h1>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:2rem;">
  <div class="card" style="text-align:center;">
    <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.25rem;">Calls this week</p>
    <p style="font-size:2rem;font-weight:700;color:var(--brand);">${fmt(stats.callsThisWeek)}</p>
  </div>
  <div class="card" style="text-align:center;">
    <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.25rem;">Calls this month</p>
    <p style="font-size:2rem;font-weight:700;color:var(--brand);">${fmt(stats.callsThisMonth)}</p>
  </div>
  <div class="card" style="text-align:center;">
    <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.25rem;">Jobs this week</p>
    <p style="font-size:2rem;font-weight:700;color:var(--green);">${fmt(stats.leadsThisWeek)}</p>
  </div>
  <div class="card" style="text-align:center;">
    <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.25rem;">Jobs this month</p>
    <p style="font-size:2rem;font-weight:700;color:var(--green);">${fmt(stats.leadsThisMonth)}</p>
  </div>
</div>

<div class="card" style="margin-bottom:1.5rem;">
  <h2>All time</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;text-align:center;margin-top:1rem;">
    <div>
      <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.25rem;">Total calls</p>
      <p style="font-size:1.75rem;font-weight:700;">${fmt(stats.totalCalls)}</p>
    </div>
    <div>
      <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.25rem;">Total jobs</p>
      <p style="font-size:1.75rem;font-weight:700;">${fmt(stats.totalLeads)}</p>
    </div>
    <div>
      <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.25rem;">Total job value</p>
      <p style="font-size:1.75rem;font-weight:700;color:var(--green);">${fmtDollar(stats.totalJobValue)}</p>
    </div>
  </div>
</div>`;
  return shell("Call Stats", body, tenant);
}

// ─── Settings page ────────────────────────────────────────────────────────────

export function settingsPage(tenant: TenantRow, flash?: string): string {
  const tradeOptions = ["plumber","electrician","roofer","handyman","painter","carpenter","tiler","builder","other"];
  const tradeSelect = tradeOptions.map(o =>
    `<option value="${o}"${tenant.trade_type === o ? " selected" : ""}>${o.charAt(0).toUpperCase() + o.slice(1)}</option>`
  ).join("");

  const flashHtml = flash
    ? `<div class="alert ${flash.startsWith("✓") ? "alert-success" : "alert-error"}">${escape(flash)}</div>`
    : "";

  const body = `
<h1>Account Settings</h1>
${flashHtml}
<div class="card">
  <form method="POST" action="/dashboard/settings">
    <div class="settings-grid">
      <div class="form-group">
        <label for="name">Business name</label>
        <input type="text" id="name" name="name" value="${escape(tenant.name)}" required />
      </div>
      <div class="form-group">
        <label for="trade_type">Trade type</label>
        <select id="trade_type" name="trade_type">${tradeSelect}</select>
      </div>
      <div class="form-group">
        <label for="ai_name">AI receptionist name</label>
        <input type="text" id="ai_name" name="ai_name" value="${escape(tenant.ai_name)}" placeholder="Olivia" />
        <p style="font-size:.8rem;color:var(--gray-500);margin-top:.25rem">The name your AI uses when answering calls</p>
      </div>
      <div class="form-group">
        <label for="owner_phone">Your callback number</label>
        <input type="tel" id="owner_phone" name="owner_phone" value="${escape(tenant.owner_phone)}" required />
        <p style="font-size:.8rem;color:var(--gray-500);margin-top:.25rem">SMS job summaries are sent here</p>
      </div>
      <div class="form-group">
        <label for="business_hours_start">Business hours start</label>
        <input type="time" id="business_hours_start" name="business_hours_start" value="${escape(tenant.business_hours_start)}" />
      </div>
      <div class="form-group">
        <label for="business_hours_end">Business hours end</label>
        <input type="time" id="business_hours_end" name="business_hours_end" value="${escape(tenant.business_hours_end)}" />
      </div>
    </div>
    <div class="form-group">
      <label for="service_area">Service area</label>
      <textarea id="service_area" name="service_area" rows="3">${escape(tenant.service_area ?? "")}</textarea>
      <p style="font-size:.8rem;color:var(--gray-500);margin-top:.25rem">
        Describe where you work — the AI will politely decline jobs outside this area.
        Example: "All suburbs within 40km of Parramatta, including the Hills District and Inner West."
      </p>
    </div>
    <details style="border-top:1px solid var(--gray-200);margin-top:.75rem;padding-top:1rem;"${
      (tenant.custom_instructions || tenant.enable_warm_transfer || tenant.vacation_mode) ? " open" : ""
    }>
      <summary style="cursor:pointer;font-weight:600;font-size:.95rem;color:var(--brand);margin-bottom:1rem;list-style:none;display:flex;align-items:center;gap:.5rem;">
        <span style="font-size:.8rem;transition:transform .2s;" class="adv-arrow">▶</span>
        Advanced settings
        <span style="font-size:.8rem;font-weight:400;color:var(--gray-500);margin-left:.25rem;">(custom instructions, live connect, holiday mode)</span>
      </summary>

      <div class="form-group">
        <label for="custom_instructions">Custom AI instructions <span style="font-weight:400;color:var(--gray-600);">(optional)</span></label>
        <textarea id="custom_instructions" name="custom_instructions" rows="4" placeholder="e.g. We have a $120 call-out fee for after-hours jobs. We don't take on jobs in high-rise apartments. Always ask if the customer has a preferred time in the morning or afternoon.">${escape(tenant.custom_instructions ?? "")}</textarea>
        <p style="font-size:.8rem;color:var(--gray-500);margin-top:.25rem">
          Add any business-specific rules, pricing notes, or special handling instructions for the AI.
        </p>
      </div>

      <div class="form-group">
        <label style="display:flex;align-items:center;gap:.65rem;cursor:pointer;">
          <input type="checkbox" name="enable_warm_transfer" value="1"${tenant.enable_warm_transfer ? " checked" : ""} style="width:auto;accent-color:var(--brand);" />
          <span>Live connect — transfer calls to your phone during business hours</span>
        </label>
        <p style="font-size:.8rem;color:var(--gray-500);margin-top:.25rem">When enabled, calls during business hours will ring you first. If you don't answer within 18 seconds, the AI takes over.</p>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:.65rem;cursor:pointer;">
          <input type="checkbox" name="vacation_mode" value="1"${tenant.vacation_mode ? " checked" : ""} style="width:auto;accent-color:var(--brand);" />
          <span>Holiday mode — tell callers the business is away</span>
        </label>
      </div>
      <div class="form-group">
        <label for="vacation_message">Holiday message <span style="font-weight:400;color:var(--gray-600);">(optional)</span></label>
        <input type="text" id="vacation_message" name="vacation_message" value="${escape(tenant.vacation_message ?? "")}"
          placeholder="e.g. Back on Monday 7 April. Will return all calls then." />
      </div>
    </details>
    <div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;margin-top:.5rem">
      <button type="submit" class="btn btn-primary">Save changes</button>
      <a href="/dashboard/leads" class="btn btn-ghost">Cancel</a>
    </div>
  </form>
</div>

<div class="card" style="margin-top:1.25rem">
  <h2>Account info</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;font-size:.9rem">
    <div>
      <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.2rem">Email</p>
      <p>${escape(tenant.owner_email ?? "")}</p>
    </div>
    <div>
      <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.2rem">Plan</p>
      <p>${tenant.payment_status === "active" ? "Active" : tenant.payment_status === "trial" ? "Free trial" : tenant.payment_status === "pending" ? `Waiting for card — <a href="#" onclick="document.getElementById('pending-checkout-form').submit();return false;">complete signup</a><form id="pending-checkout-form" method="POST" action="/dashboard/create-checkout-session" style="display:none;"></form>` : "—"}</p>
    </div>
    ${tenant.trial_ends_at ? `<div>
      <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.2rem">Trial ends</p>
      <p>${new Date(tenant.trial_ends_at).toLocaleDateString("en-AU", { dateStyle: "long" })}</p>
    </div>` : ""}
  </div>
  <p style="font-size:.82rem;color:var(--gray-500);margin-top:1rem">
    To change your email, contact us at
    <a href="mailto:hello@getpickupai.com.au">hello@getpickupai.com.au</a> ·
    <a href="/dashboard/forgot-password">Change password</a>
  </p>
</div>

<div class="card" style="margin-top:1.25rem">
  <h2>Subscription</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;font-size:.9rem;margin-bottom:1rem">
    <div>
      <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.2rem">Status</p>
      <p>${tenant.payment_status === "active" ? '<span style="color:var(--green);font-weight:700;">✓ Active</span>'
          : tenant.payment_status === "cancelling" ? '<span style="color:var(--amber);font-weight:700;">⏳ Cancelling at period end</span>'
          : tenant.payment_status === "trial" ? '<span style="color:var(--brand);font-weight:700;">Free trial</span>'
          : tenant.payment_status === "payment_failed" ? '<span style="color:var(--red);font-weight:700;">⚠ Payment failed</span>'
          : tenant.payment_status === "expired" ? '<span style="color:var(--gray-600);">Expired</span>'
          : tenant.payment_status === "cancelled" ? '<span style="color:var(--gray-600);">Cancelled</span>'
          : '<span style="color:var(--gray-600);">—</span>'}</p>
    </div>
    ${tenant.trial_ends_at ? `<div>
      <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.2rem">Trial ends</p>
      <p>${new Date(tenant.trial_ends_at).toLocaleDateString("en-AU", { dateStyle: "long" })}</p>
    </div>` : ""}
    <div>
      <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.2rem">Plan</p>
      <p>${tenant.payment_status === "active" ? "Active subscription"
          : tenant.payment_status === "cancelling" ? "Cancelling — active until period end"
          : tenant.payment_status === "trial" ? "Free trial (14 days)"
          : tenant.payment_status === "pending" ? `Waiting for card — <a href="#" onclick="document.getElementById('plan-checkout-form').submit();return false;">complete signup</a><form id="plan-checkout-form" method="POST" action="/dashboard/create-checkout-session" style="display:none;"></form>`
          : tenant.payment_status === "expired" ? "Expired"
          : tenant.payment_status === "payment_failed" ? "Payment issue — please update your card"
          : tenant.payment_status === "cancelled" ? "Cancelled"
          : "—"}</p>
    </div>
  </div>
  ${(tenant.payment_status !== "active" && tenant.payment_status !== "cancelling") ? `<a href="/dashboard/upgrade" class="btn btn-primary btn-sm">Upgrade plan</a>` : ""}
  ${(tenant.payment_status === "active" || tenant.payment_status === "cancelling") && tenant.stripe_customer_id
    ? `<form method="POST" action="/dashboard/billing-portal" style="display:inline">
        <button type="submit" class="btn btn-outline btn-sm">Manage subscription (cancel / update card)</button>
      </form>`
    : ""}
  <p style="font-size:.75rem;color:var(--gray-500);margin-top:.75rem;">
    All prices inc. GST ·
    <a href="/terms" target="_blank">Terms</a> · <a href="/privacy" target="_blank">Privacy</a>
  </p>
</div>`;
  return shell("Settings", body, tenant);
}

// ─── Forgot password page ─────────────────────────────────────────────────────

export function forgotPasswordPage(flash?: string): string {
  const isSuccess = flash && !flash.startsWith("⚠");
  const body = `
<div style="max-width:420px;margin:4rem auto;">
  <div class="card">
    <h2 style="text-align:center;margin-bottom:1.5rem;">Reset your password</h2>
    ${flash ? `<div class="alert ${isSuccess ? "alert-success" : "alert-error"}">${escape(flash)}</div>` : ""}
    <p style="font-size:.9rem;color:var(--gray-600);margin-bottom:1.25rem;text-align:center;">
      Enter the email address you registered with and we'll send a reset code to your phone.
    </p>
    <form method="POST" action="/dashboard/forgot-password">
      <div class="form-group">
        <label for="email">Email address</label>
        <input type="email" id="email" name="email" required placeholder="owner@example.com" autofocus />
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%;margin-top:.5rem;">Send reset code</button>
    </form>
    <p style="text-align:center;margin-top:1.25rem;font-size:.85rem;color:var(--gray-600);">
      <a href="/dashboard/login">← Back to sign in</a>
    </p>
  </div>
</div>`;
  return shell("Forgot password", body);
}

// ─── Reset password page ──────────────────────────────────────────────────────

export function resetPasswordPage(email: string, flash?: string, flashType: "success" | "error" = "error"): string {
  const body = `
<div style="max-width:420px;margin:4rem auto;">
  <div class="card">
    <h2 style="text-align:center;margin-bottom:1.5rem;">Set a new password</h2>
    ${flash ? `<div class="alert ${flashType === "success" ? "alert-success" : "alert-error"}">${escape(flash)}</div>` : ""}
    <p style="font-size:.9rem;color:var(--gray-600);margin-bottom:1.25rem;text-align:center;">
      Enter the 6-digit code sent to your phone, then choose a new password.
    </p>
    <form method="POST" action="/dashboard/reset-password">
      <input type="hidden" name="email" value="${escape(email)}" />
      <div class="form-group">
        <label for="code">6-digit SMS code</label>
        <input type="text" id="code" name="code" required maxlength="6" pattern="[0-9]{6}" inputmode="numeric" placeholder="123456" autofocus />
      </div>
      <div class="form-group">
        <label for="password">New password</label>
        <input type="password" id="password" name="password" required minlength="8" />
      </div>
      <div class="form-group">
        <label for="confirm_password">Confirm new password</label>
        <input type="password" id="confirm_password" name="confirm_password" required minlength="8" />
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%;margin-top:.5rem;">Update password</button>
    </form>
    <p style="text-align:center;margin-top:1.25rem;font-size:.85rem;color:var(--gray-600);">
      Didn't get a code? <a href="/dashboard/forgot-password">Request a new one</a>
    </p>
  </div>
</div>`;
  return shell("Reset password", body);
}

// ─── Upgrade / trial-expired page ─────────────────────────────────────────────

export function upgradePage(tenant?: TenantRow, stripeEnabled?: boolean, reason?: string): string {
  const paymentFailedBanner = reason === "payment_failed"
    ? `<div class="alert alert-error" style="margin-bottom:1.5rem;font-size:.95rem;">
        <strong>Payment failed.</strong> Your last payment couldn't be processed.
        Please update your payment method below to keep your AI receptionist active.
       </div>`
    : "";
  const ctaHtml = stripeEnabled
    ? `<form method="POST" action="/dashboard/create-checkout-session">
        <button type="submit" class="btn btn-primary" style="font-size:1rem;padding:.8rem 2.25rem;cursor:pointer">
          Subscribe — $149 / month →
        </button>
      </form>
      <p style="margin-top:.65rem;font-size:.82rem;color:var(--gray-500)">
        Secure payment via Stripe · Cancel anytime · No lock-in
      </p>`
    : `<a href="mailto:hello@getpickupai.com.au?subject=I'd like to upgrade PickupAI&body=Hi, I'd like to continue my PickupAI subscription for ${escape(tenant?.name ?? "my business")}."
         class="btn btn-primary" style="font-size:1rem;padding:.8rem 2rem;display:inline-block">
        Email us to activate →
      </a>
      <p style="margin-top:1rem;font-size:.85rem;color:var(--gray-500)">
        Or email <a href="mailto:hello@getpickupai.com.au" style="color:var(--gray-500)">hello@getpickupai.com.au</a> — we'll respond same day
      </p>`;

  const { icon, headline, subtitle } = reason === "pending"
    ? { icon: "💳", headline: "Complete your signup", subtitle: "Finish setting up your payment to start your 14-day free trial." }
    : reason === "payment_failed"
    ? { icon: "⚠️", headline: "Update your payment method", subtitle: "Your last payment couldn't be processed. Update your card below to keep your AI receptionist active." }
    : (tenant?.payment_status === "expired" || tenant?.payment_status === "cancelled")
    ? { icon: "🔄", headline: "Reactivate your account", subtitle: "Your subscription has ended. Subscribe below to get your AI receptionist back online." }
    : { icon: "⏰", headline: "Your free trial has ended", subtitle: "Thanks for trying PickupAI! To keep your AI receptionist answering calls and capturing job enquiries, subscribe below." };

  const body = `
<div style="max-width:560px;margin:4rem auto;text-align:center">
  ${paymentFailedBanner}
  <div style="font-size:3rem;margin-bottom:1rem">${icon}</div>
  <h1 style="font-size:1.75rem;margin-bottom:.75rem">${headline}</h1>
  <p style="color:var(--gray-600);font-size:1rem;line-height:1.6;margin-bottom:2rem">
    ${subtitle}
  </p>
  <div class="card" style="text-align:left;margin-bottom:1.5rem">
    <h2 style="margin-bottom:1rem">What's included — $149 / month</h2>
    <ul style="list-style:none;display:flex;flex-direction:column;gap:.65rem">
      <li style="display:flex;gap:.65rem;align-items:flex-start">
        <span style="color:var(--green);font-weight:700;margin-top:.1rem">✓</span>
        <span>24/7 call answering — every call picked up</span>
      </li>
      <li style="display:flex;gap:.65rem;align-items:flex-start">
        <span style="color:var(--green);font-weight:700;margin-top:.1rem">✓</span>
        <span>Instant SMS job summary after every call</span>
      </li>
      <li style="display:flex;gap:.65rem;align-items:flex-start">
        <span style="color:var(--green);font-weight:700;margin-top:.1rem">✓</span>
        <span>Emergency detection and priority flagging</span>
      </li>
      <li style="display:flex;gap:.65rem;align-items:flex-start">
        <span style="color:var(--green);font-weight:700;margin-top:.1rem">✓</span>
        <span>AI trained on your trade and service area</span>
      </li>
      <li style="display:flex;gap:.65rem;align-items:flex-start">
        <span style="color:var(--green);font-weight:700;margin-top:.1rem">✓</span>
        <span>Online account with all your jobs and call history</span>
      </li>
    </ul>
    <p style="font-size:.8rem;color:var(--gray-500);margin-top:1rem">
      Founding customer price — locked for 3 months, then $199/mo. Cancel anytime.
    </p>
  </div>
  ${ctaHtml}
  <p style="font-size:.75rem;color:var(--gray-500);margin-top:.75rem;">
    All prices inc. GST ·
    <a href="/terms" target="_blank" style="color:var(--gray-500)">Terms</a> ·
    <a href="/privacy" target="_blank" style="color:var(--gray-500)">Privacy</a>
  </p>
  <form method="POST" action="/dashboard/logout" style="margin-top:1.5rem">
    <button type="submit" style="background:none;border:none;cursor:pointer;font-size:.85rem;color:var(--gray-500);padding:0;text-decoration:underline;">Sign out</button>
  </form>
</div>`;
  return shell("Upgrade", body, tenant);
}
