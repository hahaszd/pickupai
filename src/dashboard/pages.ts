import type { LeadRow, TenantRow } from "../db/repo.js";

// ─── Trial helpers ────────────────────────────────────────────────────────────

function trialDaysLeft(tenant: TenantRow): number | null {
  if (tenant.payment_status !== "trial" || !tenant.trial_ends_at) return null;
  return Math.ceil((new Date(tenant.trial_ends_at).getTime() - Date.now()) / 86400000);
}

function trialBannerHtml(tenant: TenantRow): string {
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
    nav .logo { font-weight: 700; font-size: 1.1rem; letter-spacing: -.3px; color: #fff; text-decoration: none; }
    nav .logo span { opacity: .7; font-weight: 400; font-size: .85rem; margin-left: .5rem; }
    nav .logo:hover { opacity: .9; text-decoration: none; }
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
    input, select, textarea { width: 100%; padding: .5rem .75rem; border: 1.5px solid var(--gray-200);
                    border-radius: 6px; font-size: .9rem; outline: none; font-family: inherit; }
    input:focus, select:focus, textarea:focus { border-color: var(--brand); }
    textarea { resize: vertical; min-height: 80px; }
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
    .alert-success { background: #dcfce7; color: var(--green); }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    .detail-item label { color: var(--gray-600); font-size: .78rem; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; margin-bottom: .2rem; }
    .detail-item p { font-size: .95rem; }
    audio { width: 100%; margin-top: .5rem; }
    .transcript { background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: 6px;
                  padding: 1rem; font-size: .85rem; line-height: 1.6; white-space: pre-wrap;
                  max-height: 300px; overflow-y: auto; color: var(--gray-600); }
    .status-row { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: .75rem; }
    .empty { text-align: center; padding: 3rem; color: var(--gray-400); }
    .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    @media (max-width: 640px) {
      .detail-grid, .settings-grid { grid-template-columns: 1fr; }
      nav .hide-sm { display: none; }
    }
  </style>
</head>
<body>
<nav>
  <a href="/" class="logo">PickupAI <span>${escape(tenantName)}</span></a>
  ${tenant
    ? `<a href="/dashboard/leads">Leads</a>
       <a href="/dashboard/settings" class="hide-sm">Settings</a>
       <div class="spacer"></div>
       <a href="/dashboard/logout" class="hide-sm">Log out</a>`
    : `<div class="spacer"></div>`}
</nav>
${banner}
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
        ${isProvisioned ? `<details style="margin-top:.75rem;">
          <summary style="cursor:pointer;font-size:.85rem;color:var(--brand);font-weight:600;">Telstra / Optus / Vodafone instructions &amp; alternatives</summary>
          <div style="margin-top:.75rem;font-size:.85rem;color:var(--gray-600);line-height:1.7;">
            <p><strong>Option A:</strong> Dial the code above from your phone — you'll hear a confirmation tone.</p>
            <p style="margin-top:.5rem;"><strong>Option B:</strong> Via your carrier app — look for <em>Call Forwarding → No Answer</em> or <em>Divert when unanswered</em>.</p>
            <p style="margin-top:.5rem;"><strong>Option C:</strong> Call your carrier and ask them to set <em>conditional call forwarding (no answer) with a 20-second delay</em> to your PickupAI number.</p>
            <p style="margin-top:.75rem;"><strong>To cancel forwarding at any time:</strong> Dial <code>##61#</code> and press Call.</p>
          </div>
        </details>` : ""}
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

// ─── Welcome page (post-signup) ───────────────────────────────────────────────

export type WelcomePageOpts = {
  /** Currently claimed demo number for this tenant, if any */
  demoNumber?: string | null;
  /** Expiry timestamp ISO string for the demo session */
  demoExpiresAt?: string | null;
  /** Error message to display */
  error?: string;
  /** Whether a simulated demo call was just triggered */
  simulationStarted?: boolean;
  /** Recording URL from a completed simulated demo call */
  recordingUrl?: string | null;
};

export function welcomePage(tenant: TenantRow, opts: WelcomePageOpts = {}) {
  const { demoNumber, demoExpiresAt, error, simulationStarted, recordingUrl } = opts;

  // Format +61XXXXXXXXX → Australian local style (02 XXXX XXXX / 04XX XXX XXX)
  const formatAuPhone = (e164: string): string => {
    if (!e164.startsWith("+61")) return e164;
    const local = "0" + e164.slice(3);       // +61280000796 → 0280000796
    if (/^04\d{8}$/.test(local)) {           // mobile: 04XX XXX XXX
      return local.replace(/^(04\d{2})(\d{3})(\d{3})$/, "$1 $2 $3");
    }
    return local.replace(/^(0\d)(\d{4})(\d{4})$/, "$1 $2 $3"); // landline: 02 8000 0796
  };
  const demoNumberFormatted = demoNumber ? formatAuPhone(demoNumber) : null;

  // Card A: Hands-free (AI simulates a caller — no slot claimed)
  const proxyRecordingUrl = recordingUrl
    ? `/dashboard/recording-proxy?url=${encodeURIComponent(recordingUrl)}`
    : null;

  const cardA = simulationStarted
    ? `<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:var(--radius);padding:1.25rem;">
        <p style="font-weight:600;color:#16a34a;margin-bottom:.4rem;">✓ Demo call in progress!</p>
        <p style="font-size:.85rem;color:var(--gray-600);margin-bottom:.9rem;">
          Your AI receptionist is taking a call from a simulated customer right now.
          Click below to listen live — you'll hear everything the AI says in real-time.
        </p>
        <div id="live-audio-area">
          <button id="listen-btn" class="btn btn-primary" style="width:100%;margin-bottom:.6rem;">
            🎧 Listen Live
          </button>
          <div id="stream-status" style="font-size:.82rem;color:var(--gray-600);text-align:center;min-height:1.2em;"></div>
        </div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
        <script>
        (function() {
          var btn = document.getElementById('listen-btn');
          var status = document.getElementById('stream-status');

          // μ-law (PCMU) decode — converts Twilio's 8 kHz audio to float32 PCM
          function decodeMulaw(bytes) {
            var out = new Float32Array(bytes.length);
            for (var i = 0; i < bytes.length; i++) {
              var u = (~bytes[i]) & 0xFF;
              var t = ((u & 0x0F) << 3) + 0x84;
              t = t << ((u & 0x70) >> 4);
              out[i] = ((u & 0x80) ? (0x84 - t) : (t - 0x84)) / 32768.0;
            }
            return out;
          }

          btn.addEventListener('click', function() {
            btn.disabled = true;
            status.innerHTML = '<span style="display:inline-block;width:10px;height:10px;border:2px solid #86efac;border-top-color:#16a34a;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;margin-right:5px;"></span> Connecting…';

            // AudioContext must be created inside a user-gesture handler.
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            var ctx = new AudioCtx();
            var TWILIO_RATE = 8000;
            var BROWSER_RATE = ctx.sampleRate;
            var nextPlayTime = ctx.currentTime + 0.15; // 150 ms initial buffer

            function playChunk(b64) {
              var bin = atob(b64);
              var bytes = new Uint8Array(bin.length);
              for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

              // Decode μ-law → float32
              var src = decodeMulaw(bytes);

              // Upsample 8 kHz → browser native rate (usually 44100 or 48000)
              var ratio = BROWSER_RATE / TWILIO_RATE;
              var dstLen = Math.round(src.length * ratio);
              var dst = new Float32Array(dstLen);
              for (var j = 0; j < dstLen; j++) {
                var s = j / ratio;
                var lo = s | 0;
                var hi = Math.min(lo + 1, src.length - 1);
                dst[j] = src[lo] + (src[hi] - src[lo]) * (s - lo);
              }

              var buf = ctx.createBuffer(1, dstLen, BROWSER_RATE);
              buf.copyToChannel(dst, 0);
              var node = ctx.createBufferSource();
              node.buffer = buf;
              node.connect(ctx.destination);

              var now = ctx.currentTime;
              if (nextPlayTime < now + 0.05) nextPlayTime = now + 0.15;
              node.start(nextPlayTime);
              nextPlayTime += buf.duration;
            }

            var evtSource = new EventSource('/dashboard/demo-audio-stream');

            evtSource.onopen = function() {
              status.innerHTML = '<span style="color:#dc2626;font-size:1rem;">●</span> Live — listening to your AI receptionist…';
            };

            evtSource.onmessage = function(e) {
              if (ctx.state === 'suspended') ctx.resume();
              playChunk(e.data);
            };

            evtSource.addEventListener('end', function() {
              evtSource.close();
              ctx.close();
              status.innerHTML = '✓ Call finished. Check your phone (<strong>${escape(tenant.owner_phone)}</strong>) for the lead SMS!';
              btn.style.display = 'none';
            });

            evtSource.onerror = function() {
              if (evtSource.readyState === EventSource.CLOSED) {
                status.textContent = '✓ Call completed.';
              } else {
                status.textContent = 'Connection issue — the call may still be in progress.';
              }
            };
          });

          // Auto-click the listen button after a short delay so the user sees it
          // (they must still consciously click; we just scroll it into view)
          setTimeout(function() {
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 500);
        })();
        </script>
      </div>`
    : `<div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius);padding:1.25rem;">
        <p style="font-size:.9rem;color:var(--gray-600);margin-bottom:.6rem;">
          We place a simulated customer call to your AI receptionist — personalised with your trade and business name.
          You'll hear the full recording here and receive the lead SMS on your mobile.
        </p>
        <p style="font-size:.8rem;color:var(--gray-400);margin-bottom:1rem;">No number reservation needed. Takes about 60 seconds.</p>
        <form method="POST" action="/dashboard/simulate-demo-call">
          <button type="submit" class="btn btn-primary" style="width:100%;">Generate Demo Call →</button>
        </form>
      </div>`;

  // Card B: Call it yourself (claims a demo slot for 1 hour)
  const expiryTime = demoExpiresAt
    ? new Date(demoExpiresAt).toLocaleTimeString("en-AU", {
        hour: "2-digit", minute: "2-digit", timeZone: "Australia/Sydney"
      }) + " Sydney time"
    : null;

  const cardB = demoNumber
    ? `<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:var(--radius);padding:1.25rem;">
        <p style="font-weight:600;color:#16a34a;margin-bottom:.5rem;">✓ Your demo number is ready!</p>
        <div style="background:#fff;border:1.5px solid var(--gray-200);border-radius:8px;padding:.75rem 1rem;font-family:monospace;font-size:1.15rem;letter-spacing:.05em;text-align:center;margin-bottom:.75rem;">
          ${escape(demoNumberFormatted ?? demoNumber)}
        </div>
        <p style="font-size:.9rem;color:var(--gray-600);margin-bottom:.6rem;">
          Call this number from your mobile <strong>right now</strong>. Your AI receptionist will answer just like a real customer call.
          You'll receive a lead SMS on <strong>${escape(tenant.owner_phone)}</strong> after the call.
        </p>
        <div style="background:#fef9c3;border:1px solid #fde047;border-radius:6px;padding:.5rem .75rem;font-size:.8rem;color:#854d0e;">
          ⏱ This slot is reserved for <strong>1 hour</strong>${expiryTime ? ` — expires at <strong>${expiryTime}</strong>` : ""}.
          After that you'll need to request a new demo number.
        </div>
      </div>`
    : `<div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius);padding:1.25rem;">
        <p style="font-size:.9rem;color:var(--gray-600);margin-bottom:.6rem;">
          We'll reserve a demo number for you for <strong>1 hour</strong>. Call it from your own mobile to hear your AI receptionist exactly as your customers will.
        </p>
        <p style="font-size:.8rem;color:var(--gray-400);margin-bottom:1rem;">The slot auto-expires after 1 hour.</p>
        <form method="POST" action="/dashboard/request-demo">
          <button type="submit" class="btn btn-primary" style="width:100%;background:var(--gray-800);">Get Demo Number →</button>
        </form>
      </div>`;

  const body = `
<div style="max-width:680px;margin:2rem auto;">

  <div style="background:var(--brand);color:#fff;border-radius:var(--radius);padding:1.5rem 1.75rem;margin-bottom:1.75rem;display:flex;align-items:center;gap:1rem;">
    <span style="font-size:2rem;">🎉</span>
    <div>
      <div style="font-weight:700;font-size:1.15rem;">Welcome, ${escape(tenant.name)}!</div>
      <div style="opacity:.85;font-size:.9rem;margin-top:.2rem;">Your AI receptionist is ready. Try it out below — no call forwarding needed yet.</div>
    </div>
  </div>

  ${error ? `<div class="alert alert-error" style="margin-bottom:1rem;">${escape(error)}</div>` : ""}

  <div class="demo-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">

    <div class="card">
      <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.75rem;">
        <span style="font-size:1.3rem;">🤖</span>
        <h2 style="margin:0;font-size:1rem;">Option A — Hands-Free Demo</h2>
      </div>
      <p style="font-size:.8rem;color:var(--brand);font-weight:600;margin-bottom:.6rem;text-transform:uppercase;letter-spacing:.4px;">AI simulates a customer call</p>
      ${cardA}
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.75rem;">
        <span style="font-size:1.3rem;">📱</span>
        <h2 style="margin:0;font-size:1rem;">Option B — Call It Yourself</h2>
      </div>
      <p style="font-size:.8rem;color:var(--brand);font-weight:600;margin-bottom:.6rem;text-transform:uppercase;letter-spacing:.4px;">Dial from your own mobile</p>
      ${cardB}
    </div>

  </div>

  <div class="card" style="border:1.5px solid var(--brand);">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;">
      <div>
        <h2 style="margin:0 0 .25rem;">Ready to activate on your real number?</h2>
        <p style="font-size:.9rem;color:var(--gray-600);margin:0;">Set up call forwarding on your business mobile — takes 2 minutes.</p>
      </div>
      <a href="/dashboard/setup-guide" class="btn btn-primary" style="white-space:nowrap;">Set Up Call Forwarding →</a>
    </div>
  </div>

  <div style="text-align:center;margin-top:1.25rem;">
    <a href="/dashboard/leads" style="font-size:.85rem;color:var(--gray-600);">Skip for now — go to Dashboard →</a>
  </div>

</div>

<style>
  @media (max-width:600px) {
    .demo-grid { grid-template-columns: 1fr !important; }
  }
</style>`;

  return shell("Welcome", body, tenant);
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
  const isPending = !tenant.twilio_number || tenant.twilio_number.startsWith("+PENDING_");
  const setupBanner = isPending ? `
<div style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:var(--radius);padding:1rem 1.25rem;margin-bottom:1.25rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;">
  <div>
    <p style="font-weight:600;margin:0 0 .2rem;">⚙️ Your AI receptionist isn't active yet</p>
    <p style="font-size:.85rem;color:var(--gray-600);margin:0;">You haven't set up call forwarding — customers can't reach your AI receptionist until this is done.</p>
  </div>
  <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
    <a href="/dashboard/welcome" class="btn btn-outline btn-sm">Try Demo</a>
    <a href="/dashboard/setup-guide" class="btn btn-primary btn-sm">Set Up Now →</a>
  </div>
</div>` : "";

  const body = `
${setupBanner}
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

// ─── Settings page ────────────────────────────────────────────────────────────

export function settingsPage(tenant: TenantRow, flash?: string): string {
  const tradeOptions = ["plumber","electrician","handyman","roofer","painter","carpenter","builder","other"];
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
        <p style="font-size:.8rem;color:var(--gray-400);margin-top:.25rem">The name your AI uses when answering calls</p>
      </div>
      <div class="form-group">
        <label for="owner_phone">Your callback number</label>
        <input type="tel" id="owner_phone" name="owner_phone" value="${escape(tenant.owner_phone)}" required />
        <p style="font-size:.8rem;color:var(--gray-400);margin-top:.25rem">Lead SMS summaries are sent here</p>
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
      <p style="font-size:.8rem;color:var(--gray-400);margin-top:.25rem">
        Describe where you work — the AI will politely decline jobs outside this area.
        Example: "All suburbs within 40km of Parramatta, including the Hills District and Inner West."
      </p>
    </div>
    <div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;margin-top:.5rem">
      <button type="submit" class="btn btn-primary">Save changes</button>
      <a href="/dashboard/leads" class="btn btn-ghost">Cancel</a>
    </div>
  </form>
</div>

<div class="card" style="margin-top:1.25rem">
  <h2>Account info</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;font-size:.9rem">
    <div>
      <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.2rem">Email</p>
      <p>${escape(tenant.owner_email ?? "")}</p>
    </div>
    <div>
      <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.2rem">Plan</p>
      <p>${tenant.payment_status === "active" ? "Active" : tenant.payment_status === "trial" ? "Free trial" : "—"}</p>
    </div>
    ${tenant.trial_ends_at ? `<div>
      <p style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-600);margin-bottom:.2rem">Trial ends</p>
      <p>${new Date(tenant.trial_ends_at).toLocaleDateString("en-AU", { dateStyle: "long" })}</p>
    </div>` : ""}
  </div>
  <p style="font-size:.82rem;color:var(--gray-400);margin-top:1rem">
    To change your email or password, contact us at
    <a href="mailto:hello@pickupai.com.au">hello@pickupai.com.au</a>
  </p>
</div>`;
  return shell("Settings", body, tenant);
}

// ─── Upgrade / trial-expired page ─────────────────────────────────────────────

export function upgradePage(tenant?: TenantRow, stripeEnabled?: boolean): string {
  const ctaHtml = stripeEnabled
    ? `<form method="POST" action="/dashboard/create-checkout-session">
        <button type="submit" class="btn btn-primary" style="font-size:1rem;padding:.8rem 2.25rem;cursor:pointer">
          Subscribe — $149 / month →
        </button>
      </form>
      <p style="margin-top:.65rem;font-size:.82rem;color:var(--gray-400)">
        Secure payment via Stripe · Cancel anytime · No lock-in
      </p>`
    : `<a href="mailto:hello@pickupai.com.au?subject=I'd like to upgrade PickupAI&body=Hi, I'd like to continue my PickupAI subscription for ${escape(tenant?.name ?? "my business")}."
         class="btn btn-primary" style="font-size:1rem;padding:.8rem 2rem;display:inline-block">
        Email us to activate →
      </a>
      <p style="margin-top:1rem;font-size:.85rem;color:var(--gray-400)">
        Or email <a href="mailto:hello@pickupai.com.au" style="color:var(--gray-400)">hello@pickupai.com.au</a> — we'll respond same day
      </p>`;

  const body = `
<div style="max-width:560px;margin:4rem auto;text-align:center">
  <div style="font-size:3rem;margin-bottom:1rem">⏰</div>
  <h1 style="font-size:1.75rem;margin-bottom:.75rem">Your free trial has ended</h1>
  <p style="color:var(--gray-600);font-size:1rem;line-height:1.6;margin-bottom:2rem">
    Thanks for trying PickupAI! To keep your AI receptionist answering calls and capturing leads,
    subscribe below and we'll have your dedicated number set up within 24 hours.
  </p>
  <div class="card" style="text-align:left;margin-bottom:1.5rem">
    <h2 style="margin-bottom:1rem">What's included — $149 / month</h2>
    <ul style="list-style:none;display:flex;flex-direction:column;gap:.65rem">
      <li style="display:flex;gap:.65rem;align-items:flex-start">
        <span style="color:var(--green);font-weight:700;margin-top:.1rem">✓</span>
        <span>24/7 call answering — every call picked up, no voicemail</span>
      </li>
      <li style="display:flex;gap:.65rem;align-items:flex-start">
        <span style="color:var(--green);font-weight:700;margin-top:.1rem">✓</span>
        <span>Instant SMS lead summary after every call</span>
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
        <span>Dashboard with all your leads and call history</span>
      </li>
    </ul>
    <p style="font-size:.8rem;color:var(--gray-400);margin-top:1rem">
      Founding customer price — locked for 3 months, then $199/mo. Cancel anytime.
    </p>
  </div>
  ${ctaHtml}
  <p style="margin-top:1.5rem">
    <a href="/dashboard/logout" style="font-size:.85rem;color:var(--gray-400)">Sign out</a>
  </p>
</div>`;
  return shell("Upgrade", body, tenant);
}
