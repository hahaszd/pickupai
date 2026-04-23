import pino from "pino";
import { env } from "../env.js";
import { toE164Au } from "../utils/phone.js";

const log = pino({ level: "info" });

const API_BASE = "https://api.mobilemessage.com.au/v1";

export function isMobileMessageConfigured(): boolean {
  return !!(env.MOBILE_MSG_API_USER && env.MOBILE_MSG_API_PASSWORD && env.MOBILE_MSG_SENDER);
}

function authHeader(): string {
  const creds = Buffer.from(`${env.MOBILE_MSG_API_USER}:${env.MOBILE_MSG_API_PASSWORD}`).toString("base64");
  return `Basic ${creds}`;
}

export type MobileMsgResult =
  | { status: "sent"; message_id: string; cost: number; to: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/**
 * Convert E.164 AU number (+614...) to Mobile Message format (04... or 614...).
 * The API accepts both local (04xx) and international (614xx) formats.
 */
function toMobileMsgPhone(phone: string): string {
  const e164 = toE164Au(phone);
  return e164.replace(/^\+/, "");
}

export async function sendMarketingSms(
  to: string,
  body: string,
  customRef?: string
): Promise<MobileMsgResult> {
  if (!isMobileMessageConfigured()) {
    return { status: "skipped", reason: "mobile_message_not_configured" };
  }

  const payload = {
    messages: [{
      to: toMobileMsgPhone(to),
      message: body,
      sender: env.MOBILE_MSG_SENDER!,
      ...(customRef ? { custom_ref: customRef } : {})
    }]
  };

  try {
    const res = await fetch(`${API_BASE}/messages`, {
      method: "POST",
      headers: {
        "Authorization": authHeader(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 429) {
      return { status: "failed", reason: "rate_limited" };
    }

    if (!res.ok) {
      const text = await res.text();
      log.warn({ status: res.status, body: text }, "Mobile Message API error");
      return { status: "failed", reason: `http_${res.status}` };
    }

    const data = await res.json() as {
      status: string;
      results?: Array<{
        status: string;
        message_id?: string;
        cost?: number;
        to?: string;
        error?: string;
      }>;
    };

    const result = data.results?.[0];
    if (!result || result.status !== "success") {
      log.warn({ data }, "Mobile Message send failed");
      return { status: "failed", reason: result?.error ?? result?.status ?? "unknown" };
    }

    log.info({ to, messageId: result.message_id, cost: result.cost }, "Marketing SMS sent via Mobile Message");
    return { status: "sent", message_id: result.message_id!, cost: result.cost ?? 0, to };
  } catch (err) {
    log.error({ err, to }, "Mobile Message send exception");
    return { status: "failed", reason: "network_error" };
  }
}

export interface BatchMessage {
  to: string;
  body: string;
  customRef?: string;
}

export interface BatchResult {
  to: string;
  result: MobileMsgResult;
}

/**
 * Send up to 100 messages in a single API call.
 * Messages beyond 100 are split into multiple requests.
 */
export async function sendMarketingSmsBatch(
  messages: BatchMessage[]
): Promise<BatchResult[]> {
  if (!isMobileMessageConfigured()) {
    return messages.map(m => ({
      to: m.to,
      result: { status: "skipped" as const, reason: "mobile_message_not_configured" }
    }));
  }

  const results: BatchResult[] = [];
  const BATCH_SIZE = 100;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);

    const payload = {
      messages: chunk.map(m => ({
        to: toMobileMsgPhone(m.to),
        message: m.body,
        sender: env.MOBILE_MSG_SENDER!,
        ...(m.customRef ? { custom_ref: m.customRef } : {})
      }))
    };

    try {
      const res = await fetch(`${API_BASE}/messages`, {
        method: "POST",
        headers: {
          "Authorization": authHeader(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        log.warn({ status: res.status, body: text }, "Mobile Message batch API error");
        for (const m of chunk) {
          results.push({ to: m.to, result: { status: "failed", reason: `http_${res.status}` } });
        }
        continue;
      }

      const data = await res.json() as {
        status: string;
        results?: Array<{
          status: string;
          message_id?: string;
          cost?: number;
          to?: string;
          error?: string;
        }>;
      };

      for (let j = 0; j < chunk.length; j++) {
        const apiResult = data.results?.[j];
        if (apiResult?.status === "success") {
          results.push({
            to: chunk[j].to,
            result: { status: "sent", message_id: apiResult.message_id!, cost: apiResult.cost ?? 0, to: chunk[j].to }
          });
        } else {
          results.push({
            to: chunk[j].to,
            result: { status: "failed", reason: apiResult?.error ?? apiResult?.status ?? "unknown" }
          });
        }
      }
    } catch (err) {
      log.error({ err }, "Mobile Message batch exception");
      for (const m of chunk) {
        results.push({ to: m.to, result: { status: "failed", reason: "network_error" } });
      }
    }
  }

  const sent = results.filter(r => r.result.status === "sent").length;
  log.info({ total: messages.length, sent, failed: messages.length - sent }, "Mobile Message batch complete");
  return results;
}

/**
 * Configure Mobile Message status webhook to receive delivery receipts.
 */
export async function configureMobileMessageWebhooks(publicBaseUrl: string): Promise<void> {
  if (!isMobileMessageConfigured()) return;

  const statusUrl = `${publicBaseUrl}/mobilemsg/sms/status`;

  try {
    const res = await fetch(`${API_BASE}/webhooks`, {
      method: "POST",
      headers: {
        "Authorization": authHeader(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ type: "status", url: statusUrl })
    });

    if (!res.ok) {
      const text = await res.text();
      log.warn({ status: res.status, body: text }, "Failed to configure Mobile Message status webhook");
      return;
    }

    log.info({ statusUrl }, "Mobile Message status webhook configured");
  } catch (err) {
    log.error({ err }, "Failed to configure Mobile Message webhooks");
  }
}
