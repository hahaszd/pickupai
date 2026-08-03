import type { Request } from "express";
import { env } from "../env.js";
import { isWithinHours } from "../utils/time.js";

/**
 * Whether a live call should ring through to the owner right now.
 *
 * **Gated on the tenant's OWN hours and timezone**, not the global env vars.
 * Until 2026-08-04 it read `BUSINESS_HOURS_START/END/TIMEZONE` from the
 * process, which are seed values for the first tenant — so a Perth business
 * would have been transferred on Sydney's clock, three hours out, and a tenant
 * who set 07:00–15:00 in their dashboard would have been ignored entirely.
 * Invisible with one tenant; wrong for the second.
 *
 * The env vars remain the fallback for a call with no resolved tenant.
 *
 * Note what this does NOT depend on: anything about the CALL. Not urgency,
 * which no longer exists, not the caller, not the content. It is every call or
 * no calls, by the tenant's choice — and `docs/gtm-playbook.md` used to have a
 * human say otherwise down the phone.
 */
export function shouldWarmTransferNow(tenant?: {
  business_hours_start?: string | null;
  business_hours_end?: string | null;
  timezone?: string | null;
}): boolean {
  if (!env.ENABLE_WARM_TRANSFER) return false;
  if (!env.WARM_TRANSFER_ONLY_DURING_BUSINESS_HOURS) return true;
  return isWithinHours({
    startHHMM: tenant?.business_hours_start || env.BUSINESS_HOURS_START,
    endHHMM: tenant?.business_hours_end || env.BUSINESS_HOURS_END,
    timeZone: tenant?.timezone || env.BUSINESS_TIMEZONE
  });
}

export function buildAbsoluteUrl(path: string) {
  return new URL(path, env.PUBLIC_BASE_URL).toString();
}

export function getCallSid(req: Request): string {
  const sid = req.body?.CallSid;
  if (!sid || typeof sid !== "string") throw new Error("Missing CallSid");
  return sid;
}

