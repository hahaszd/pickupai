import type { Request } from "express";
import { env } from "../env.js";
import { isWithinHours } from "../utils/time.js";

export function shouldWarmTransferNow(): boolean {
  if (!env.ENABLE_WARM_TRANSFER) return false;
  if (!env.WARM_TRANSFER_ONLY_DURING_BUSINESS_HOURS) return true;
  return isWithinHours({
    startHHMM: env.BUSINESS_HOURS_START,
    endHHMM: env.BUSINESS_HOURS_END,
    timeZone: env.BUSINESS_TIMEZONE
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

