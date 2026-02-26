import type { TenantWithStats, TenantDetail, OverviewStats, DemoSessionRow } from "../db/repo.js";

// ─── Shared helpers ────────────────────────────────────────────────────────────

/** Format an E.164 Australian number to local display (e.g. +61412345678 → 0412 345 678) */
export function formatAuPhone(e164: string): string {
  if (!e164 || !e164.startsWith("+61")) return e164;
  const local = "0" + e164.slice(3);
  if (local.startsWith("04")) {
    // Mobile: 04XX XXX XXX
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }
  // Landline: (0X) XXXX XXXX
  return `(${local.slice(0, 2)}) ${local.slice(2, 6)} ${local.slice(6)}`;
}

/** Generate the Australian USSD code for no-answer call divert, timeout 20s */
export function ussdDivertCode(e164: string): string {
  const stripped = e164.replace("+", ""); // e.g. 61280000796
  return `**61*${stripped}*11*20#`;
}

/** Build the SMS body sent to the tradie when their number is provisioned */
export function buildProvisionSms(
  businessName: string,
  e164: string,
  publicBaseUrl: string
): string {
  const formatted = formatAuPhone(e164);
  const ussd = ussdDivertCode(e164);
  return `Hi ${businessName}! Your PickupAI AI receptionist is set up and ready to go.

Your dedicated forwarding number:
${formatted}

To activate "no-answer" call divert on your business phone, dial this code from that phone:
${ussd}

Or call your phone provider and ask them to set up "no-answer call divert" to ${formatted}.

Full setup guide:
${publicBaseUrl}/dashboard/setup-guide

Login to your dashboard:
${publicBaseUrl}/dashboard/login

Questions? Just reply to this message — PickupAI`;
}

function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit", month: "short", year: "numeric",
    timeZone: "Australia/Sydney"
  });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Australia/Sydney"
  });
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function isPending(number: string | null | undefined): boolean {
  return !number || number.startsWith("+PENDING_");
}

function paymentBadge(status: string | null | undefined): string {
  switch (status) {
    case "active":    return `<span class="badge badge-active">Active</span>`;
    case "trial":     return `<span class="badge badge-trial">Trial</span>`;
    case "expired":   return `<span class="badge badge-expired">Expired</span>`;
    case "cancelled": return `<span class="badge badge-expired">Cancelled</span>`;
    default:          return `<span class="badge badge-none">None</span>`;
  }
}

// ─── Shell ─────────────────────────────────────────────────────────────────────

function adminShell(title: string, activeTab: string, content: string, flash?: string): string {
  const tabs = [
    { href: "/admin", label: "Overview", key: "overview" },
    { href: "/admin/users", label: "Users", key: "users" },
    { href: "/admin/demo-sessions", label: "Demo Pool", key: "demo" },
    { href: "/admin/config", label: "Config", key: "config" },
  ];

  const navLinks = tabs.map(t =>
    `<a href="${t.href}" class="nav-tab${activeTab === t.key ? " active" : ""}">${t.label}</a>`
  ).join("");

  const flashHtml = flash
    ? `<div class="flash ${flash.startsWith("✓") ? "flash-ok" : "flash-err"}">${esc(flash)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} — PickupAI Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --navy: #0f172a; --navy-mid: #1e293b; --navy-light: #334155;
      --brand: #3b82f6; --brand-dark: #2563eb;
      --green: #16a34a; --red: #dc2626; --amber: #d97706; --purple: #7c3aed;
      --gray-50: #f8fafc; --gray-100: #f1f5f9; --gray-200: #e2e8f0;
      --gray-400: #94a3b8; --gray-600: #475569; --gray-800: #1e293b;
      --radius: 8px; --shadow: 0 1px 4px rgba(0,0,0,.1);
    }
    body { font-family: system-ui,-apple-system,sans-serif; background: var(--gray-50); color: var(--gray-800); min-height: 100vh; }
    a { color: var(--brand); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Topbar */
    header {
      background: var(--navy); color: #fff; display: flex; align-items: center;
      padding: 0 1.5rem; height: 54px; gap: 1rem;
    }
    .logo { font-weight: 800; font-size: 1rem; color: #fff; letter-spacing: -.2px; }
    .logo span { color: var(--brand); }
    .logo-badge { font-size: .7rem; background: var(--brand); color: #fff; border-radius: 4px; padding: .1rem .4rem; margin-left: .4rem; font-weight: 700; }
    header .spacer { flex: 1; }
    header a.logout { color: rgba(255,255,255,.6); font-size: .85rem; }
    header a.logout:hover { color: #fff; text-decoration: none; }

    /* Tab nav */
    nav { background: var(--navy-mid); display: flex; padding: 0 1.5rem; gap: 0; border-bottom: 1px solid var(--navy-light); }
    .nav-tab {
      color: rgba(255,255,255,.6); font-size: .875rem; padding: .7rem 1rem;
      border-bottom: 2px solid transparent; text-decoration: none; font-weight: 500;
    }
    .nav-tab:hover { color: #fff; text-decoration: none; }
    .nav-tab.active { color: #fff; border-bottom-color: var(--brand); }

    /* Layout */
    .container { max-width: 1200px; margin: 0 auto; padding: 1.5rem; }
    .page-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1.25rem; }

    /* Cards */
    .card { background: #fff; border-radius: var(--radius); box-shadow: var(--shadow); padding: 1.5rem; margin-bottom: 1.25rem; }
    .card-title { font-size: .85rem; font-weight: 600; color: var(--gray-600); text-transform: uppercase; letter-spacing: .5px; margin-bottom: .35rem; }

    /* Stat cards */
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 1.25rem; }
    .stat-card { background: #fff; border-radius: var(--radius); box-shadow: var(--shadow); padding: 1.25rem 1.5rem; }
    .stat-label { font-size: .8rem; color: var(--gray-600); text-transform: uppercase; letter-spacing: .5px; font-weight: 600; margin-bottom: .25rem; }
    .stat-value { font-size: 2rem; font-weight: 800; line-height: 1.1; color: var(--gray-800); }
    .stat-sub { font-size: .8rem; color: var(--gray-400); margin-top: .2rem; }
    .stat-card.brand .stat-value { color: var(--brand); }
    .stat-card.green .stat-value { color: var(--green); }
    .stat-card.amber .stat-value { color: var(--amber); }
    .stat-card.red .stat-value { color: var(--red); }

    /* Table */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: .875rem; }
    th { text-align: left; padding: .55rem .75rem; font-size: .72rem; font-weight: 700;
         text-transform: uppercase; letter-spacing: .5px; color: var(--gray-600);
         border-bottom: 2px solid var(--gray-200); white-space: nowrap; }
    td { padding: .65rem .75rem; border-bottom: 1px solid var(--gray-100); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--gray-50); }

    /* Badges */
    .badge {
      display: inline-block; padding: .2rem .55rem; border-radius: 999px;
      font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .3px;
    }
    .badge-active   { background: #dcfce7; color: var(--green); }
    .badge-trial    { background: #dbeafe; color: var(--brand); }
    .badge-expired  { background: #fee2e2; color: var(--red); }
    .badge-none     { background: var(--gray-100); color: var(--gray-600); }
    .badge-pending  { background: #fef3c7; color: var(--amber); }
    .badge-setup    { background: #dcfce7; color: var(--green); }
    .badge-emergency{ background: #fee2e2; color: var(--red); }
    .badge-urgent   { background: #ffedd5; color: var(--amber); }
    .badge-routine  { background: #dcfce7; color: var(--green); }

    /* Buttons */
    .btn {
      display: inline-block; padding: .4rem .9rem; border-radius: 6px;
      font-size: .82rem; font-weight: 600; cursor: pointer; border: none;
      text-decoration: none; transition: opacity .15s; line-height: 1.4;
    }
    .btn:hover { opacity: .82; text-decoration: none; }
    .btn-primary { background: var(--brand); color: #fff; }
    .btn-sm { padding: .28rem .6rem; font-size: .75rem; }
    .btn-outline { background: transparent; color: var(--brand); border: 1.5px solid var(--brand); }
    .btn-danger { background: var(--red); color: #fff; }
    .btn-danger-outline { background: transparent; color: var(--red); border: 1.5px solid var(--red); }
    .btn-ghost { background: transparent; color: var(--gray-600); border: 1.5px solid var(--gray-200); }
    .btn-amber { background: var(--amber); color: #fff; }

    /* Form */
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    @media(max-width:640px) { .form-grid { grid-template-columns: 1fr; } }
    .form-group { margin-bottom: .9rem; }
    .form-group.full { grid-column: 1/-1; }
    label { display: block; font-size: .82rem; font-weight: 600; margin-bottom: .3rem; color: var(--gray-800); }
    input[type=text], input[type=email], input[type=tel], input[type=date],
    input[type=time], select, textarea {
      width: 100%; padding: .48rem .75rem; border: 1.5px solid var(--gray-200);
      border-radius: 6px; font-size: .875rem; outline: none; font-family: inherit;
    }
    input:focus, select:focus, textarea:focus { border-color: var(--brand); }
    textarea { resize: vertical; min-height: 80px; }
    .form-hint { font-size: .75rem; color: var(--gray-400); margin-top: .25rem; }
    .check-row { display: flex; align-items: center; gap: .5rem; margin-top: .4rem; }
    .check-row input[type=checkbox] { width: auto; margin: 0; }

    /* Layouts */
    .two-col { display: grid; grid-template-columns: 1fr 340px; gap: 1.25rem; align-items: start; }
    @media(max-width:900px) { .two-col { grid-template-columns: 1fr; } }

    /* Flash */
    .flash { padding: .75rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: .9rem; font-weight: 500; }
    .flash-ok  { background: #dcfce7; color: var(--green); border: 1px solid #bbf7d0; }
    .flash-err { background: #fee2e2; color: var(--red); border: 1px solid #fecaca; }

    /* Misc */
    .section-title { font-size: 1rem; font-weight: 700; margin-bottom: .75rem; color: var(--gray-800); }
    .empty { color: var(--gray-400); font-size: .875rem; padding: 1.5rem 0; text-align: center; }
    .mono { font-family: monospace; font-size: .8rem; }
    .number-cell { font-weight: 700; }
    .actions-cell { white-space: nowrap; }
    .detail-stat { text-align: center; padding: 1rem; }
    .detail-stat .val { font-size: 2rem; font-weight: 800; color: var(--brand); }
    .detail-stat .lbl { font-size: .8rem; color: var(--gray-600); margin-top: .2rem; }
    .stat-row { display: grid; grid-template-columns: repeat(3,1fr); gap: .75rem; margin-bottom: 1rem; }
    .actions-panel { display: flex; flex-direction: column; gap: .65rem; }
    .action-btn { display: block; text-align: center; }
    .divider { border: none; border-top: 1px solid var(--gray-200); margin: 1rem 0; }
    .info-row { display: flex; justify-content: space-between; align-items: center;
                padding: .5rem 0; border-bottom: 1px solid var(--gray-100); font-size: .875rem; }
    .info-row:last-child { border-bottom: none; }
    .info-label { font-weight: 600; color: var(--gray-600); }
  </style>
</head>
<body>
<header>
  <span class="logo">Pickup<span>AI</span><span class="logo-badge">Admin</span></span>
  <div class="spacer"></div>
  <a href="/admin/logout" class="logout">Sign out</a>
</header>
<nav>${navLinks}</nav>
<div class="container">
${flashHtml}
${content}
</div>
</body>
</html>`;
}

// ─── Login page ────────────────────────────────────────────────────────────────

export function adminLoginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Login — PickupAI</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui,-apple-system,sans-serif; background: #0f172a; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .box { background: #fff; border-radius: 12px; padding: 2.5rem 2rem; width: 100%; max-width: 380px; box-shadow: 0 8px 40px rgba(0,0,0,.35); }
    h1 { font-size: 1.4rem; font-weight: 800; margin-bottom: .35rem; }
    .sub { font-size: .875rem; color: #64748b; margin-bottom: 1.75rem; }
    label { display: block; font-size: .82rem; font-weight: 600; margin-bottom: .3rem; }
    input { width: 100%; padding: .55rem .75rem; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: .9rem; outline: none; }
    input:focus { border-color: #3b82f6; }
    .err { background: #fee2e2; color: #dc2626; padding: .6rem .75rem; border-radius: 6px; font-size: .85rem; margin-bottom: 1rem; }
    button { width: 100%; margin-top: 1rem; padding: .65rem; background: #3b82f6; color: #fff; border: none; border-radius: 6px; font-size: .95rem; font-weight: 700; cursor: pointer; }
    button:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Admin Login</h1>
    <p class="sub">PickupAI internal dashboard</p>
    ${error ? `<div class="err">${esc(error)}</div>` : ""}
    <form method="POST" action="/admin/login">
      <div style="margin-bottom:1rem">
        <label for="token">Admin token</label>
        <input type="password" id="token" name="token" placeholder="Enter admin token" autofocus required />
      </div>
      <button type="submit">Sign in →</button>
    </form>
  </div>
</body>
</html>`;
}

// ─── Overview page ─────────────────────────────────────────────────────────────

export function adminOverviewPage(
  stats: OverviewStats,
  recentSignups: TenantWithStats[],
  flash?: string
): string {
  const recentRows = recentSignups.slice(0, 10).map(t => `
    <tr>
      <td><a href="/admin/users/${t.tenant_id}">${esc(t.name)}</a></td>
      <td><span style="font-size:.8rem;color:#64748b">${esc(t.trade_type)}</span></td>
      <td>${isPending(t.twilio_number)
        ? `<span class="badge badge-pending">Pending</span>`
        : `<span class="badge badge-setup">Active</span>`}</td>
      <td>${paymentBadge(t.payment_status)}</td>
      <td>${fmtDateTime(t.created_at)}</td>
    </tr>
  `).join("");

  const content = `
<div class="page-title">Overview</div>

<div class="stat-grid">
  <div class="stat-card brand">
    <div class="stat-label">Total Accounts</div>
    <div class="stat-value">${stats.total_tenants}</div>
    <div class="stat-sub">${stats.pending_setup} pending setup</div>
  </div>
  <div class="stat-card amber">
    <div class="stat-label">On Trial</div>
    <div class="stat-value">${stats.on_trial}</div>
    <div class="stat-sub">14-day free trial</div>
  </div>
  <div class="stat-card green">
    <div class="stat-label">Paying</div>
    <div class="stat-value">${stats.active_paying}</div>
    <div class="stat-sub">Active subscribers</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Calls Today</div>
    <div class="stat-value">${stats.calls_today}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Leads Today</div>
    <div class="stat-value">${stats.leads_today}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">SMS Sent Today</div>
    <div class="stat-value">${stats.sms_today}</div>
  </div>
</div>

<div class="card">
  <div class="section-title">Recent signups</div>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Business</th><th>Trade</th><th>Setup</th><th>Payment</th><th>Joined</th>
      </tr></thead>
      <tbody>
        ${recentRows || `<tr><td colspan="5" class="empty">No accounts yet</td></tr>`}
      </tbody>
    </table>
  </div>
  <div style="margin-top:.85rem"><a href="/admin/users" class="btn btn-outline btn-sm">View all users →</a></div>
</div>
`;
  return adminShell("Overview", "overview", content, flash);
}

// ─── Users list page ───────────────────────────────────────────────────────────

export function adminUsersPage(tenants: TenantWithStats[], flash?: string): string {
  const rows = tenants.map(t => {
    const setup = isPending(t.twilio_number)
      ? `<span class="badge badge-pending">Pending</span>`
      : `<span class="badge badge-setup">&#10003; Active</span>`;
    return `
    <tr>
      <td>
        <a href="/admin/users/${t.tenant_id}" style="font-weight:600">${esc(t.name)}</a>
        <div style="font-size:.75rem;color:#64748b">${esc(t.trade_type)}</div>
      </td>
      <td>
        ${setup}
        <div class="mono" style="margin-top:.25rem;color:#64748b;font-size:.75rem">${esc(t.twilio_number)}</div>
      </td>
      <td class="number-cell">${t.lead_count}</td>
      <td class="number-cell">${t.call_count}</td>
      <td class="number-cell">${t.sms_count}</td>
      <td>${paymentBadge(t.payment_status)}</td>
      <td style="font-size:.8rem">${t.trial_ends_at ? fmtDate(t.trial_ends_at) : "—"}</td>
      <td style="font-size:.8rem">${relativeTime(t.last_login_at)}</td>
      <td style="font-size:.8rem">${fmtDate(t.created_at)}</td>
      <td class="actions-cell">
        <a href="/admin/users/${t.tenant_id}" class="btn btn-ghost btn-sm">View</a>
      </td>
    </tr>`;
  }).join("");

  const content = `
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
  <div class="page-title" style="margin:0">Users <span style="font-size:1rem;color:#64748b;font-weight:400">(${tenants.length})</span></div>
</div>

<div class="card">
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Business</th>
        <th>Twilio Number</th>
        <th>Leads</th>
        <th>Calls</th>
        <th>SMS</th>
        <th>Payment</th>
        <th>Trial Ends</th>
        <th>Last Login</th>
        <th>Joined</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${rows || `<tr><td colspan="10" class="empty">No accounts yet</td></tr>`}
      </tbody>
    </table>
  </div>
</div>
`;
  return adminShell("Users", "users", content, flash);
}

// ─── User detail page ──────────────────────────────────────────────────────────

export function adminUserDetailPage(detail: TenantDetail, publicBaseUrl: string, flash?: string): string {
  const t = detail;
  const setupBadge = isPending(t.twilio_number)
    ? `<span class="badge badge-pending">Pending setup</span>`
    : `<span class="badge badge-setup">&#10003; Active number</span>`;

  const tradeOptions = ["plumber","electrician","handyman","roofer","painter","carpenter","builder","other"];
  const tradeSelect = tradeOptions.map(o =>
    `<option value="${o}"${t.trade_type === o ? " selected" : ""}>${o.charAt(0).toUpperCase()+o.slice(1)}</option>`
  ).join("");

  const paymentOptions = ["none","trial","active","expired","cancelled"];
  const paymentSelect = paymentOptions.map(o =>
    `<option value="${o}"${(t.payment_status ?? "none") === o ? " selected" : ""}>${o.charAt(0).toUpperCase()+o.slice(1)}</option>`
  ).join("");

  const leadsRows = t.recent_leads.map(l => `
    <tr>
      <td>${fmtDate(l.created_at)}</td>
      <td>${esc(l.name)}</td>
      <td>${esc(l.issue_summary?.slice(0, 60))}</td>
      <td>${l.urgency_level ? `<span class="badge badge-${l.urgency_level}">${l.urgency_level}</span>` : "—"}</td>
      <td>${esc(l.lead_status)}</td>
    </tr>
  `).join("") || `<tr><td colspan="5" class="empty">No leads yet</td></tr>`;

  const callsRows = t.recent_calls.map(c => `
    <tr>
      <td>${fmtDateTime(c.started_at)}</td>
      <td class="mono">${esc(c.from_number)}</td>
      <td>${esc(c.status)}</td>
      <td style="font-size:.8rem;max-width:240px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">
        ${esc(c.transcript?.slice(0, 80))}
      </td>
    </tr>
  `).join("") || `<tr><td colspan="4" class="empty">No calls yet</td></tr>`;

  const content = `
<div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap">
  <a href="/admin/users" style="font-size:.85rem;color:#64748b">← All users</a>
  <div class="page-title" style="margin:0">${esc(t.name)}</div>
  ${setupBadge}
  ${paymentBadge(t.payment_status)}
  ${t.active ? "" : `<span class="badge badge-expired">Inactive</span>`}
</div>

<div class="two-col">

  <!-- Left: Edit form -->
  <div>
    <div class="card">
      <div class="section-title">Account details</div>
      <form method="POST" action="/admin/users/${t.tenant_id}">
        <div class="form-grid">
          <div class="form-group">
            <label>Business name</label>
            <input type="text" name="name" value="${esc(t.name)}" required />
          </div>
          <div class="form-group">
            <label>Trade type</label>
            <select name="trade_type">${tradeSelect}</select>
          </div>
          <div class="form-group">
            <label>AI name</label>
            <input type="text" name="ai_name" value="${esc(t.ai_name)}" />
          </div>
          <div class="form-group">
            <label>Twilio number</label>
            <input type="text" name="twilio_number" value="${esc(t.twilio_number)}" />
            <div class="form-hint">Use +PENDING_xxx for unassigned, or real +614xxxxxxxx</div>
          </div>
          <div class="form-group">
            <label>Owner phone</label>
            <input type="tel" name="owner_phone" value="${esc(t.owner_phone)}" required />
          </div>
          <div class="form-group">
            <label>Owner email</label>
            <input type="email" name="owner_email" value="${esc(t.owner_email)}" />
          </div>
          <div class="form-group">
            <label>Business hours start</label>
            <input type="time" name="business_hours_start" value="${esc(t.business_hours_start)}" />
          </div>
          <div class="form-group">
            <label>Business hours end</label>
            <input type="time" name="business_hours_end" value="${esc(t.business_hours_end)}" />
          </div>
          <div class="form-group">
            <label>Timezone</label>
            <input type="text" name="timezone" value="${esc(t.timezone)}" />
          </div>
          <div class="form-group">
            <label>Payment status</label>
            <select name="payment_status">${paymentSelect}</select>
          </div>
          <div class="form-group">
            <label>Trial ends at</label>
            <input type="date" name="trial_ends_at" value="${t.trial_ends_at ? t.trial_ends_at.slice(0,10) : ""}" />
          </div>
          <div class="form-group full">
            <label>Service area</label>
            <textarea name="service_area">${esc(t.service_area)}</textarea>
            <div class="form-hint">Natural language description of areas served</div>
          </div>
          <div class="form-group full">
            <div class="check-row">
              <input type="checkbox" id="warm" name="enable_warm_transfer" value="1"${t.enable_warm_transfer ? " checked" : ""} />
              <label for="warm" style="margin:0;font-weight:500">Enable warm transfer (emergency calls)</label>
            </div>
          </div>
          <div class="form-group full">
            <div class="check-row">
              <input type="checkbox" id="active" name="active" value="1"${t.active ? " checked" : ""} />
              <label for="active" style="margin:0;font-weight:500">Account active</label>
            </div>
          </div>
        </div>
        <div style="margin-top:.5rem">
          <button type="submit" class="btn btn-primary">Save changes</button>
        </div>
      </form>
    </div>

    <!-- Recent leads -->
    <div class="card">
      <div class="section-title">Recent leads (last 10)</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Caller</th><th>Issue</th><th>Urgency</th><th>Status</th></tr></thead>
          <tbody>${leadsRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Recent calls -->
    <div class="card">
      <div class="section-title">Recent calls (last 10)</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>From</th><th>Status</th><th>Transcript preview</th></tr></thead>
          <tbody>${callsRows}</tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Right: Stats + actions -->
  <div>
    <div class="card">
      <div class="section-title">Activity</div>
      <div class="stat-row">
        <div class="detail-stat">
          <div class="val">${t.lead_count}</div>
          <div class="lbl">Leads</div>
        </div>
        <div class="detail-stat">
          <div class="val">${t.call_count}</div>
          <div class="lbl">Calls</div>
        </div>
        <div class="detail-stat">
          <div class="val">${t.sms_count}</div>
          <div class="lbl">SMS sent</div>
        </div>
      </div>
      <hr class="divider" />
      <div class="info-row"><span class="info-label">Created</span><span>${fmtDateTime(t.created_at)}</span></div>
      <div class="info-row"><span class="info-label">Last login</span><span>${fmtDateTime(t.last_login_at)}</span></div>
      <div class="info-row"><span class="info-label">Trial ends</span><span>${fmtDate(t.trial_ends_at)}</span></div>
      <div class="info-row"><span class="info-label">Tenant ID</span><span class="mono" style="font-size:.72rem">${t.tenant_id.slice(0,18)}…</span></div>
    </div>

    <!-- Provision number -->
    <div class="card" style="border:1.5px solid #7c3aed22;background:linear-gradient(135deg,#faf5ff 0%,#fff 100%)">
      <div class="section-title" style="color:#7c3aed">Provision Number</div>
      ${isPending(t.twilio_number)
        ? `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:.65rem .85rem;font-size:.82rem;color:#92400e;margin-bottom:1rem">
             ⏳ No number assigned yet. Buy one in Twilio Console then enter it below.
           </div>`
        : `<div class="info-row" style="margin-bottom:.75rem">
             <span class="info-label">Current number</span>
             <span class="mono" style="font-size:.85rem;color:#7c3aed;font-weight:700">${esc(t.twilio_number)}</span>
           </div>
           <div class="info-row" style="margin-bottom:.75rem">
             <span class="info-label">Display</span>
             <span style="font-weight:600">${esc(formatAuPhone(t.twilio_number))}</span>
           </div>
           <div class="info-row" style="margin-bottom:1rem">
             <span class="info-label">Divert code</span>
             <span class="mono" style="font-size:.78rem">${esc(ussdDivertCode(t.twilio_number))}</span>
           </div>`}
      <form method="POST" action="/admin/users/${t.tenant_id}/provision-number">
        <div class="form-group">
          <label>Twilio number (E.164)</label>
          <input type="text" name="twilio_number" placeholder="+61280000000"
            value="${isPending(t.twilio_number) ? "" : esc(t.twilio_number)}" required
            pattern="\\+[0-9]{9,15}" title="Must start with + and country code (e.g. +61)" />
          <div class="form-hint">Buy in <a href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming" target="_blank">Twilio Console</a>, then paste here</div>
        </div>
        <div class="check-row" style="margin-bottom:.6rem">
          <input type="checkbox" id="mark_active" name="mark_active" value="1" checked />
          <label for="mark_active" style="margin:0;font-weight:500;font-size:.84rem">Set payment status → Active</label>
        </div>
        <div class="check-row" style="margin-bottom:1rem">
          <input type="checkbox" id="send_sms" name="send_sms" value="1" checked />
          <label for="send_sms" style="margin:0;font-weight:500;font-size:.84rem">Send setup SMS to ${esc(t.owner_phone)}</label>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:.85rem;margin-bottom:1rem">
          <div style="font-size:.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.5rem">SMS preview</div>
          <div style="font-size:.79rem;color:#334155;white-space:pre-line;line-height:1.55;font-family:monospace">${esc(buildProvisionSms(t.name, t.twilio_number && !isPending(t.twilio_number) ? t.twilio_number : "+61XXXXXXXXX", publicBaseUrl))}</div>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%">
          Assign number &amp; notify →
        </button>
      </form>
    </div>

    <div class="card">
      <div class="section-title">Actions</div>
      <div class="actions-panel">
        <form method="POST" action="/admin/users/${t.tenant_id}/reset-password">
          <button type="submit" class="btn btn-amber action-btn"
            onclick="return confirm('Send a temporary password by SMS to ${esc(t.owner_phone)}?')">
            Send temp password by SMS
          </button>
          <div class="form-hint" style="text-align:center;margin-top:.3rem">Sends to ${esc(t.owner_phone)}</div>
        </form>

        <form method="POST" action="/admin/users/${t.tenant_id}/toggle-active">
          <button type="submit" class="btn btn-ghost action-btn">
            ${t.active ? "Deactivate account" : "Reactivate account"}
          </button>
        </form>

        <form method="POST" action="/admin/users/${t.tenant_id}/delete"
          onsubmit="return confirm('Permanently delete ${esc(t.name)} and all their data? This cannot be undone.')">
          <button type="submit" class="btn btn-danger-outline action-btn">Delete account</button>
        </form>
      </div>
    </div>

    <div class="card">
      <div class="section-title">Export leads</div>
      <a href="/admin/users/${t.tenant_id}/leads.csv" class="btn btn-ghost action-btn" download>
        Download leads CSV
      </a>
    </div>
  </div>

</div>
`;
  return adminShell(`User: ${t.name}`, "users", content, flash);
}

// ─── Demo sessions page ────────────────────────────────────────────────────────

export function adminDemoSessionsPage(sessions: DemoSessionRow[], poolNumbers: string[], flash?: string): string {
  const now = new Date().toISOString();
  const rows = sessions.map(s => {
    const expired = s.expires_at < now;
    return `
    <tr>
      <td class="mono">${esc(s.demo_number)}</td>
      <td class="mono" style="font-size:.78rem">${esc(s.tenant_id)}</td>
      <td>${fmtDateTime(s.assigned_at)}</td>
      <td>${fmtDateTime(s.expires_at)}</td>
      <td>${expired
        ? `<span class="badge badge-expired">Expired</span>`
        : `<span class="badge badge-active">Active</span>`}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="5" class="empty">No demo sessions</td></tr>`;

  const poolList = poolNumbers.length
    ? poolNumbers.map(n => `<div class="mono">${esc(n)}</div>`).join("")
    : `<span style="color:#94a3b8;font-size:.85rem">None configured (DEMO_POOL_NUMBERS env var)</span>`;

  const content = `
<div class="page-title">Demo Pool</div>

<div class="two-col">
  <div>
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
        <div class="section-title" style="margin:0">Active &amp; recent sessions (${sessions.length})</div>
        <form method="POST" action="/admin/demo-sessions/clear">
          <button type="submit" class="btn btn-danger-outline btn-sm"
            onclick="return confirm('Clear all demo sessions?')">Clear all</button>
        </form>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Demo number</th><th>Tenant ID</th><th>Assigned</th><th>Expires</th><th>Status</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  </div>

  <div>
    <div class="card">
      <div class="section-title">Pool numbers</div>
      <div style="margin-bottom:.75rem">${poolList}</div>
      <div class="form-hint">Configure via DEMO_POOL_NUMBERS environment variable (comma-separated)</div>
    </div>
  </div>
</div>
`;
  return adminShell("Demo Pool", "demo", content, flash);
}

// ─── Config page ───────────────────────────────────────────────────────────────

export function adminConfigPage(
  configs: { key: string; value: string; updated_at: string }[],
  flash?: string
): string {
  const rows = configs.map(c => `
    <tr>
      <td class="mono" style="font-weight:600">${esc(c.key)}</td>
      <td>
        <form method="POST" action="/admin/config/${esc(c.key)}" style="display:flex;gap:.5rem">
          <input type="text" name="value" value="${esc(c.value)}" style="flex:1" />
          <button type="submit" class="btn btn-primary btn-sm">Save</button>
        </form>
      </td>
      <td style="font-size:.8rem;color:#64748b">${fmtDateTime(c.updated_at)}</td>
    </tr>
  `).join("") || `<tr><td colspan="3" class="empty">No runtime config entries</td></tr>`;

  const content = `
<div class="page-title">System Config</div>

<div class="card" style="margin-bottom:1rem">
  <p style="font-size:.875rem;color:#64748b">
    Runtime-editable config values stored in the database. These override environment variables without requiring a restart.
    Common keys: <code>sms_numbers</code>, <code>default_voice_number</code>.
  </p>
</div>

<div class="card">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
    <div class="section-title" style="margin:0">Config entries</div>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Key</th><th>Value</th><th>Last updated</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <hr class="divider" />
  <div class="section-title" style="margin-bottom:.75rem">Add / update key</div>
  <form method="POST" action="/admin/config/__new__" style="display:flex;gap:.75rem;flex-wrap:wrap">
    <input type="text" name="key" placeholder="Key (e.g. sms_numbers)" style="flex:1;min-width:160px" required />
    <input type="text" name="value" placeholder="Value" style="flex:2;min-width:200px" required />
    <button type="submit" class="btn btn-primary">Add / Update</button>
  </form>
</div>
`;
  return adminShell("Config", "config", content, flash);
}
