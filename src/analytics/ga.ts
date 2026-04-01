/**
 * Google Analytics 4 (gtag.js) helpers.
 *
 * All functions return raw HTML strings suitable for injection into
 * server-rendered pages. When `measurementId` is falsy every helper
 * returns an empty string so GA can be disabled by simply unsetting
 * the env var.
 */

// ── Head snippet (goes right before </head>) ────────────────────────────────

export function gaHeadSnippet(measurementId: string | undefined): string {
  if (!measurementId) return "";
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>
<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','${measurementId}',{send_page_view:true});
</script>`;
}

// ── User properties (call after config, inside a <script> block) ─────────

export interface GaUserProps {
  user_id?: string;
  payment_status?: string | null;
  trade_type?: string | null;
  signup_date?: string | null;
}

export function gaUserProperties(
  measurementId: string | undefined,
  props: GaUserProps
): string {
  if (!measurementId) return "";
  const parts: string[] = [];
  if (props.user_id) {
    parts.push(`gtag('set',{user_id:${JSON.stringify(props.user_id)}});`);
  }
  const up: Record<string, string> = {};
  if (props.payment_status) up.payment_status = props.payment_status;
  if (props.trade_type) up.trade_type = props.trade_type;
  if (props.signup_date) up.signup_date = props.signup_date;
  if (Object.keys(up).length) {
    parts.push(`gtag('set','user_properties',${JSON.stringify(up)});`);
  }
  if (!parts.length) return "";
  return `<script>${parts.join("")}</script>`;
}

// ── Fire a single GA4 event (inline <script>) ───────────────────────────────

export function gaEvent(
  measurementId: string | undefined,
  eventName: string,
  params?: Record<string, unknown>
): string {
  if (!measurementId) return "";
  const p = params ? `,${JSON.stringify(params)}` : "";
  return `<script>gtag('event',${JSON.stringify(eventName)}${p});</script>`;
}
