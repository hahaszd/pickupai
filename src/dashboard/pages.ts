import type { LeadRow, TenantRow } from "../db/repo.js";

// ─── Shared shell ─────────────────────────────────────────────────────────────

function shell(title: string, body: string, tenant?: TenantRow) {
  const tenantName = tenant?.name ?? "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escape(title)} — AI Receptionist</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --brand: #2563eb; --brand-dark: #1d4ed8;
      --red: #dc2626; --orange: #ea580c; --green: #16a34a;
      --gray-50: #f8fafc; --gray-100: #f1f5f9; --gray-200: #e2e8f0;
      --gray-400: #94a3b8; --gray-600: #475569; --gray-800: #1e293b;
      --radius: 8px; --shadow: 0 1px 3px rgba(0,0,0,.12);
    }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--gray-50); color: var(--gray-800); }
    a { color: var(--brand); text-decoration: none; }
    a:hover { text-decoration: underline; }
    nav {
      background: var(--brand); color: #fff; display: flex; align-items: center;
      padding: 0 1.5rem; height: 56px; gap: 1.5rem;
    }
    nav .logo { font-weight: 700; font-size: 1.1rem; letter-spacing: -.3px; }
    nav .logo span { opacity: .7; font-weight: 400; font-size: .85rem; margin-left: .5rem; }
    nav a { color: rgba(255,255,255,.85); font-size: .9rem; }
    nav a:hover { color: #fff; text-decoration: none; }
    nav .spacer { flex: 1; }
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
    .btn-primary { background: var(--brand); color: #fff; }
    .btn-outline { background: transparent; color: var(--brand); border: 1.5px solid var(--brand); }
    .btn-sm { padding: .3rem .65rem; font-size: .8rem; }
    .btn-ghost { background: transparent; color: var(--gray-600); border: 1.5px solid var(--gray-200); }
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: .3rem; }
    input, select { width: 100%; padding: .5rem .75rem; border: 1.5px solid var(--gray-200);
                    border-radius: 6px; font-size: .9rem; outline: none; }
    input:focus, select:focus { border-color: var(--brand); }
    .filters { display: flex; gap: .75rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .filter-chip {
      padding: .35rem .9rem; border-radius: 999px; font-size: .8rem; font-weight: 600;
      border: 1.5px solid var(--gray-200); background: #fff; cursor: pointer;
      text-decoration: none; color: var(--gray-600); transition: all .15s;
    }
    .filter-chip:hover { border-color: var(--brand); color: var(--brand); text-decoration: none; }
    .filter-chip.active { background: var(--brand); color: #fff; border-color: var(--brand); }
    .alert { padding: .75rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: .9rem; }
    .alert-error { background: #fee2e2; color: var(--red); }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    .detail-item label { color: var(--gray-600); font-size: .78rem; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; margin-bottom: .2rem; }
    .detail-item p { font-size: .95rem; }
    audio { width: 100%; margin-top: .5rem; }
    .transcript { background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: 6px;
                  padding: 1rem; font-size: .85rem; line-height: 1.6; white-space: pre-wrap;
                  max-height: 300px; overflow-y: auto; color: var(--gray-600); }
    .status-row { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: .75rem; }
    .empty { text-align: center; padding: 3rem; color: var(--gray-400); }
    @media (max-width: 640px) {
      .detail-grid { grid-template-columns: 1fr; }
      nav .hide-sm { display: none; }
    }
  </style>
</head>
<body>
<nav>
  <div class="logo">AI Receptionist <span>${escape(tenantName)}</span></div>
  ${tenant ? `<a href="/dashboard/leads">Leads</a><div class="spacer"></div><a href="/dashboard/logout" class="hide-sm">Log out</a>` : `<div class="spacer"></div>`}
</nav>
<div class="container">
  ${body}
</div>
</body>
</html>`;
}

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function urgencyBadge(level: string | null) {
  const cls = level === "emergency" ? "badge-emergency"
    : level === "urgent" ? "badge-urgent"
    : "badge-routine";
  return `<span class="badge ${cls}">${escape(level ?? "routine")}</span>`;
}

function statusBadge(status: string | null) {
  const cls = `badge-${status ?? "new"}`;
  return `<span class="badge ${cls}">${escape(status ?? "new")}</span>`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

// ─── Login page ───────────────────────────────────────────────────────────────

export function loginPage(error?: string) {
  const body = `
<div style="max-width:400px;margin:4rem auto;">
  <div class="card">
    <h2 style="text-align:center;margin-bottom:1.5rem;">Sign in to Dashboard</h2>
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
    <p style="text-align:center;margin-top:1.25rem;font-size:.85rem;color:var(--gray-600);">
      No account? <a href="/dashboard/signup">Start your free 14-day trial →</a>
    </p>
  </div>
</div>`;
  return shell("Sign in", body);
}

// ─── Sign up page ─────────────────────────────────────────────────────────────

export function signupPage(error?: string, prefill: Record<string, string> = {}) {
  const trades = ["plumber","electrician","roofer","painter","carpenter","tiler","handyman"];
  const tradeOptions = trades.map(t =>
    `<option value="${t}"${prefill.trade_type === t ? " selected" : ""}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
  ).join("");

  const body = `
<div style="max-width:480px;margin:3rem auto;">
  <div class="card">
    <div style="text-align:center;margin-bottom:1.75rem;">
      <h2 style="font-size:1.3rem;margin-bottom:.35rem;">Start your free 14-day trial</h2>
      <p style="font-size:.85rem;color:var(--gray-600);">No credit card required. Set up in 10 minutes.</p>
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
        <label for="owner_phone">Your mobile number <span style="font-size:.8rem;font-weight:400;color:var(--gray-600);">— for SMS lead alerts</span></label>
        <input type="tel" id="owner_phone" name="owner_phone" required placeholder="+61 4XX XXX XXX" value="${escape(prefill.owner_phone ?? "")}" />
      </div>
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required placeholder="you@example.com" value="${escape(prefill.email ?? "")}" />
      </div>
      <div class="form-group">
        <label for="password">Password <span style="font-size:.8rem;font-weight:400;color:var(--gray-600);">(min 8 characters)</span></label>
        <input type="password" id="password" name="password" required minlength="8" />
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

// ─── Setup guide page (shown after signup) ────────────────────────────────────

export function setupGuidePage(tenant: TenantRow) {
  const isProvisioned = !tenant.twilio_number.startsWith("+PENDING");
  const pickupNumber = isProvisioned ? tenant.twilio_number : null;

  const forwardingStep = pickupNumber
    ? `<p style="margin-bottom:.75rem;">Your PickupAI number is: <strong style="font-size:1.1rem;color:var(--brand);">${escape(pickupNumber)}</strong></p>
       <p style="margin-bottom:.75rem;">Open your phone's dialler and enter:</p>
       <div style="background:var(--gray-50);border:1.5px solid var(--gray-200);border-radius:8px;padding:1rem 1.25rem;font-family:monospace;font-size:1.05rem;letter-spacing:.05em;margin-bottom:.75rem;">
         **61*${escape(pickupNumber.replace(/\+/g, ""))}*11*20#
       </div>
       <p style="font-size:.85rem;color:var(--gray-600);">Then press <strong>Call / Dial</strong>. You'll hear a confirmation tone.</p>`
    : `<div class="alert" style="background:#fef9c3;color:#92400e;border:1px solid #fde68a;">
         <strong>Your number is being provisioned.</strong> We'll text you within 24 hours with your dedicated PickupAI number and setup instructions.
       </div>`;

  const body = `
<div style="max-width:640px;margin:2rem auto;">

  <div style="background:var(--brand);color:#fff;border-radius:var(--radius);padding:1.5rem 1.75rem;margin-bottom:1.5rem;display:flex;align-items:center;gap:1rem;">
    <span style="font-size:2rem;">✓</span>
    <div>
      <div style="font-weight:700;font-size:1.1rem;">Account created! Welcome, ${escape(tenant.name)}.</div>
      <div style="opacity:.85;font-size:.9rem;margin-top:.2rem;">Follow the 3 steps below to activate your AI receptionist.</div>
    </div>
  </div>

  <div class="card" style="margin-bottom:1rem;">
    <div style="display:flex;gap:1rem;align-items:flex-start;">
      <div style="min-width:40px;height:40px;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;">1</div>
      <div style="flex:1;">
        <h2 style="margin-bottom:.5rem;">Set up call forwarding on your mobile</h2>
        <p style="font-size:.9rem;color:var(--gray-600);margin-bottom:1rem;">
          When you can't answer, your calls will automatically forward to your AI receptionist.
        </p>
        ${forwardingStep}
        <details style="margin-top:.75rem;">
          <summary style="cursor:pointer;font-size:.85rem;color:var(--brand);font-weight:600;">Telstra / Optus / Vodafone instructions &amp; alternatives</summary>
          <div style="margin-top:.75rem;font-size:.85rem;color:var(--gray-600);line-height:1.7;">
            <p><strong>Option A:</strong> Dial the code above from your phone.</p>
            <p style="margin-top:.5rem;"><strong>Option B:</strong> Via your carrier app — look for <em>Call Forwarding → No Answer</em> or <em>Divert when unanswered</em>.</p>
            <p style="margin-top:.5rem;"><strong>Option C:</strong> Call your carrier and ask them to set <em>conditional call forwarding (no answer) with a 20-second delay</em> to your PickupAI number.</p>
            <p style="margin-top:.75rem;"><strong>To cancel forwarding at any time:</strong> Dial <code>##61#</code> and press Call.</p>
          </div>
        </details>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:1rem;">
    <div style="display:flex;gap:1rem;align-items:flex-start;">
      <div style="min-width:40px;height:40px;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;">2</div>
      <div style="flex:1;">
        <h2 style="margin-bottom:.5rem;">Test it</h2>
        <p style="font-size:.9rem;color:var(--gray-600);">Ask a friend to call your business number and don't answer. After ~20 seconds your AI receptionist will pick up. You should receive an SMS on <strong>${escape(tenant.owner_phone || "your mobile")}</strong> within a minute.</p>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:1.5rem;">
    <div style="display:flex;gap:1rem;align-items:flex-start;">
      <div style="min-width:40px;height:40px;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;">3</div>
      <div style="flex:1;">
        <h2 style="margin-bottom:.5rem;">View your leads</h2>
        <p style="font-size:.9rem;color:var(--gray-600);">Every call generates a lead in your dashboard. You can see caller details, listen to recordings, and mark jobs as handled.</p>
      </div>
    </div>
  </div>

  <div style="text-align:center;">
    <a href="/dashboard/leads" class="btn btn-primary" style="padding:.75rem 2rem;font-size:1rem;">
      Go to Dashboard →
    </a>
    <p style="margin-top:.75rem;font-size:.8rem;color:var(--gray-600);">
      Need help? Email <a href="mailto:hello@pickupai.com.au">hello@pickupai.com.au</a>
    </p>
  </div>

</div>`;
  return shell("Setup Guide", body, tenant);
}

// ─── Leads list page ──────────────────────────────────────────────────────────

export function leadsPage(
  tenant: TenantRow,
  leads: (LeadRow & { recording_url: string | null })[],
  filters: { urgency?: string; status?: string }
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

  const qs = (u?: string, s?: string) => {
    const p = new URLSearchParams();
    if (u) p.set("urgency", u);
    if (s) p.set("status", s);
    const str = p.toString();
    return str ? `?${str}` : "";
  };

  const urgencyFilters = urgencyOpts.map(o => {
    const active = (filters.urgency ?? "") === o.v ? " active" : "";
    return `<a href="/dashboard/leads${qs(o.v, filters.status)}" class="filter-chip${active}">${o.label}</a>`;
  }).join("");

  const statusFilters = statusOpts.map(o => {
    const active = (filters.status ?? "") === o.v ? " active" : "";
    return `<a href="/dashboard/leads${qs(filters.urgency, o.v)}" class="filter-chip${active}">${o.label}</a>`;
  }).join("");

  const rows = leads.length === 0
    ? `<tr><td colspan="7"><div class="empty">No leads found. Calls will appear here automatically.</div></td></tr>`
    : leads.map(l => `
      <tr>
        <td>${urgencyBadge(l.urgency_level)}</td>
        <td><a href="/dashboard/leads/${l.lead_id}">${escape(l.name ?? "Unknown")}</a></td>
        <td>${escape(l.phone ?? "—")}</td>
        <td>${escape(l.address ?? "—")}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escape(l.issue_summary ?? "—")}</td>
        <td>${statusBadge(l.lead_status)}</td>
        <td style="white-space:nowrap;font-size:.8rem;color:var(--gray-600)">${formatDate(l.created_at)}</td>
      </tr>`).join("");

  const csvQs = qs(filters.urgency, filters.status);
  const body = `
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;flex-wrap:wrap;gap:.75rem;">
  <h1 style="margin:0">Leads</h1>
  <a href="/dashboard/leads/export.csv${csvQs}" class="btn btn-outline btn-sm">Export CSV</a>
</div>
<div class="card">
  <div class="filters" style="margin-bottom:.5rem;">
    <span style="font-size:.8rem;color:var(--gray-600);line-height:2;">Urgency:</span>
    ${urgencyFilters}
  </div>
  <div class="filters">
    <span style="font-size:.8rem;color:var(--gray-600);line-height:2;">Status:</span>
    ${statusFilters}
  </div>
  <table>
    <thead>
      <tr>
        <th>Urgency</th><th>Name</th><th>Phone</th><th>Address</th>
        <th>Issue</th><th>Status</th><th>Received</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  return shell("Leads", body, tenant);
}

// ─── Lead detail page ─────────────────────────────────────────────────────────

export function leadDetailPage(
  tenant: TenantRow,
  lead: LeadRow & { recording_url: string | null; transcript: string | null; from_number: string | null },
  flash?: string
) {
  const statusOptions = ["new", "handled", "booked", "called_back"];

  const statusButtons = statusOptions.filter(s => s !== (lead.lead_status ?? "new")).map(s => `
    <form method="POST" action="/dashboard/leads/${lead.lead_id}/status" style="display:inline;">
      <input type="hidden" name="status" value="${s}" />
      <button type="submit" class="btn btn-ghost btn-sm">${escape(s.replace("_", " "))}</button>
    </form>`).join("");

  const recordingSection = lead.recording_url
    ? `<div class="card" style="margin-top:1rem;">
        <h2>Call Recording</h2>
        <audio controls src="${escape(lead.recording_url)}"></audio>
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
  <a href="/dashboard/leads" style="color:var(--gray-600);font-size:.9rem;">← Back to leads</a>
</div>
${flash ? `<div class="alert" style="background:#dcfce7;color:var(--green);">${escape(flash)}</div>` : ""}
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
    ${field("Phone", lead.phone ?? lead.from_number)}
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
</div>
${recordingSection}
${transcriptSection}`;
  return shell(`Lead — ${lead.name ?? "Unknown"}`, body, tenant);
}
